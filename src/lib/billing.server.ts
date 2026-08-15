import type { SubscriptionStatus } from "./billing-types";

const STRIPE_API = "https://api.stripe.com/v1";

function secretKey() {
  const key = process.env["STRIPE_TEST_API_KEY"];
  if (!key) throw new Error("Stripe secret key is not configured");
  return key;
}

export function priceId() {
  const id = process.env["STRIPE_PRICE_ID"];
  if (!id) throw new Error("Stripe price id is not configured");
  return id;
}

function encode(payload: Record<string, unknown>, prefix = ""): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === "object" && !Array.isArray(value)) {
      parts.push(...encode(value as Record<string, unknown>, name));
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          parts.push(...encode(item as Record<string, unknown>, `${name}[${index}]`));
        } else {
          parts.push(`${encodeURIComponent(`${name}[${index}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts;
}

export async function stripeRequest<T = any>(
  path: string,
  init: { method?: "GET" | "POST"; body?: Record<string, unknown> } = {},
): Promise<T> {
  const method = init.method ?? "POST";
  const body = init.body ? encode(init.body).join("&") : undefined;
  const url = method === "GET" && body ? `${STRIPE_API}${path}?${body}` : `${STRIPE_API}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "POST" ? (body ?? null) : null,
  });

  const json = (await response.json()) as any;
  if (!response.ok) {
    throw new Error(json?.error?.message ?? `Stripe request failed (${response.status})`);
  }
  return json as T;
}

export function normalizeStatus(stripeStatus: string | null | undefined): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "paused":
      return "canceled";
    case "incomplete":
    case "incomplete_expired":
      return "unpaid_incomplete";
    default:
      return "unpaid";
  }
}

function periodEnd(subscription: any): string | null {
  const raw =
    subscription?.current_period_end ??
    subscription?.items?.data?.[0]?.current_period_end ??
    null;
  return typeof raw === "number" ? new Date(raw * 1000).toISOString() : null;
}

type SubscriptionUpsert = {
  userId: string;
  email?: string | null;
  status: SubscriptionStatus;
  customerId?: string | null;
  subscriptionId?: string | null;
  stripePriceId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

export async function upsertSubscription(input: SubscriptionUpsert) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row: Record<string, unknown> = {
    user_id: input.userId,
    subscription_status: input.status,
    cancel_at_period_end: input.cancelAtPeriodEnd ?? false,
  };
  if (input.email !== undefined) row["email"] = input.email;
  if (input.customerId !== undefined) row["stripe_customer_id"] = input.customerId;
  if (input.subscriptionId !== undefined) row["stripe_subscription_id"] = input.subscriptionId;
  if (input.stripePriceId !== undefined) row["stripe_price_id"] = input.stripePriceId;
  if (input.currentPeriodEnd !== undefined) row["current_period_end"] = input.currentPeriodEnd;

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row as never, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/** Sync a Stripe subscription object onto the matching user row. */
export async function syncSubscriptionObject(subscription: any, deleted = false) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const customerId: string | null = subscription?.customer ?? null;
  const metaUser: string | null = subscription?.metadata?.user_id ?? null;

  let userId = metaUser;
  if (!userId && customerId) {
    const { data } = await supabaseAdmin
      .from("subscriptions")
      .select("user_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    userId = data?.user_id ?? null;
  }
  if (!userId) return { synced: false as const };

  await upsertSubscription({
    userId,
    status: deleted ? "canceled" : normalizeStatus(subscription?.status),
    customerId,
    subscriptionId: subscription?.id ?? null,
    stripePriceId: subscription?.items?.data?.[0]?.price?.id ?? null,
    currentPeriodEnd: periodEnd(subscription),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
  });
  return { synced: true as const, userId };
}

export async function markStatusByCustomer(
  customerId: string | null,
  status: SubscriptionStatus,
) {
  if (!customerId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("subscriptions")
    .update({ subscription_status: status } as never)
    .eq("stripe_customer_id", customerId);
}

export async function ensureCustomer(userId: string, email: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const customer = await stripeRequest("/customers", {
    body: { email: email ?? undefined, metadata: { user_id: userId } },
  });
  await upsertSubscription({
    userId,
    email,
    status: "unpaid",
    customerId: customer.id,
  });
  return customer.id as string;
}

export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  toleranceSeconds = 300,
) {
  if (!header) return false;
  const parts = header.split(",").reduce<Record<string, string[]>>((acc, item) => {
    const [k, v] = item.split("=");
    if (!k || !v) return acc;
    (acc[k] ??= []).push(v);
    return acc;
  }, {});
  const timestamp = parts["t"]?.[0];
  const signatures = parts["v1"] ?? [];
  if (!timestamp || signatures.length === 0) return false;

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) return false;

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHmac, timingSafeEqual } = require("crypto") as typeof import("crypto");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");
  return signatures.some((signature) => {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
