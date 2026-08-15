import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DedupeResult = {
  /** Rows flagged by this run. */
  marked: number;
  /** Total rows currently flagged as duplicates. */
  totalDuplicates: number;
};

/**
 * Flags near-duplicate trends (embedding cosine similarity above the threshold)
 * so ranking paths can filter them. The highest-scored member of each cluster
 * stays canonical. Re-runnable and reversible (duplicate_of can be nulled).
 */
export async function dedupeTrends(threshold = 0.95): Promise<DedupeResult> {
  const { data, error } = await supabaseAdmin.rpc("mark_trend_duplicates", {
    _threshold: threshold,
  });
  if (error) throw new Error(error.message);

  const { count } = await supabaseAdmin
    .from("trends")
    .select("id", { count: "exact", head: true })
    .not("duplicate_of", "is", null);

  return { marked: Number(data ?? 0), totalDuplicates: count ?? 0 };
}
