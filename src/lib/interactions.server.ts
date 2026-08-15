import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type InteractionAction = "impression" | "tap" | "remix" | "skip";
export type InteractionSurface = "dashboard" | "trends" | "chat" | "remix" | "community";

export type InteractionRow = {
  companyId: string;
  ownerId: string;
  trendKey: string;
  action: InteractionAction;
  surface: string;
};

/** Insert interaction rows. Works with the RLS-scoped client (owner_id must be the caller). */
export async function logInteractions(client: Client, rows: InteractionRow[]): Promise<void> {
  if (!rows.length) return;
  const { error } = await client.from("trend_interactions").insert(
    rows.map((row) => ({
      company_id: row.companyId,
      owner_id: row.ownerId,
      trend_key: row.trendKey,
      action: row.action,
      surface: row.surface,
    })),
  );
  if (error) throw new Error(error.message);
}

/**
 * Fire-and-forget variant used on recommendation read paths — never throws,
 * never blocks the response, and degrades to a no-op when the service key
 * is absent (local dev).
 */
export function logInteractionsInBackground(rows: InteractionRow[]): void {
  if (!rows.length) return;
  void (async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await logInteractions(supabaseAdmin, rows);
  })().catch((error) => console.error("Interaction logging failed", error));
}

export type SocialProof = { remixCount: number; tapCount: number };

/**
 * Distinct-brand remix/tap counts per key ("N brands remixed this"). Aggregates
 * only — no company identity leaves the database. Returns an empty map when the
 * service key is absent (local dev) or the RPC fails.
 */
export async function getSocialProof(keys: string[]): Promise<Map<string, SocialProof>> {
  const proof = new Map<string, SocialProof>();
  if (!keys.length) return proof;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("trend_social_proof", {
      _trend_keys: keys,
    });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      proof.set(row.trend_key, {
        remixCount: Number(row.remix_count ?? 0),
        tapCount: Number(row.tap_count ?? 0),
      });
    }
  } catch (error) {
    console.error("Social proof lookup failed", error);
  }
  return proof;
}

/** Keys shown to this company on a surface within the last 24h (for rotation). */
export async function getRecentlyShownKeys(
  companyId: string,
  surface: string,
  cap = 150,
): Promise<string[]> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("trend_interactions")
      .select("trend_key")
      .eq("company_id", companyId)
      .eq("action", "impression")
      .eq("surface", surface)
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(cap);
    if (error) throw new Error(error.message);
    return [...new Set((data ?? []).map((row) => row.trend_key))];
  } catch {
    return [];
  }
}
