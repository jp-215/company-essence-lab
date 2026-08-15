import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isEntitled, type SubscriptionDTO, type SubscriptionStatus } from "./billing-types";

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<SubscriptionDTO> => {
    const { data, error } = await context.supabase
      .from("subscriptions")
      .select("subscription_status, cancel_at_period_end, current_period_end, stripe_customer_id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const status = (data?.subscription_status ?? "unpaid") as SubscriptionStatus;
    return {
      status,
      entitled: isEntitled(status),
      cancelAtPeriodEnd: Boolean(data?.cancel_at_period_end),
      currentPeriodEnd: data?.current_period_end ?? null,
      hasCustomer: Boolean(data?.stripe_customer_id),
    };
  });

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ origin: z.string().url() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { ensureCustomer, priceId, stripeRequest } = await import("./billing.server");
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const customerId = await ensureCustomer(context.userId, email);

    const session = await stripeRequest("/checkout/sessions", {
      body: {
        mode: "subscription",
        customer: customerId,
        client_reference_id: context.userId,
        line_items: [{ price: priceId(), quantity: 1 }],
        subscription_data: { metadata: { user_id: context.userId } },
        metadata: { user_id: context.userId },
        allow_promotion_codes: true,
        success_url: `${data.origin}/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${data.origin}/billing?checkout=cancelled`,
      },
    });

    return { url: session.url as string };
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ origin: z.string().url() }).parse(input))
  .handler(async ({ context, data }) => {
    const { ensureCustomer, stripeRequest } = await import("./billing.server");
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const customerId = await ensureCustomer(context.userId, email);
    const session = await stripeRequest("/billing_portal/sessions", {
      body: { customer: customerId, return_url: `${data.origin}/billing` },
    });
    return { url: session.url as string };
  });

/** Immediately reconcile with Stripe after returning from Checkout. */
export const syncMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { stripeRequest, syncSubscriptionObject, ensureCustomer } = await import(
      "./billing.server"
    );
    const email = (context.claims as { email?: string } | null)?.email ?? null;
    const customerId = await ensureCustomer(context.userId, email);
    const list = await stripeRequest("/subscriptions", {
      method: "GET",
      body: { customer: customerId, status: "all", limit: 1 },
    });
    const subscription = list?.data?.[0];
    if (!subscription) return { status: "unpaid" as SubscriptionStatus };
    subscription.metadata = { ...(subscription.metadata ?? {}), user_id: context.userId };
    await syncSubscriptionObject(subscription);
    return { status: subscription.status as string };
  });
