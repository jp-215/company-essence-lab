import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embedText } from "./knowledge.server";

export type TrendEmbedSource = {
  title: string;
  caption: string;
  hashtags: string[];
  format: string;
  query: string;
};

export function buildTrendEmbedText(trend: TrendEmbedSource): string {
  return [
    trend.title ? `Title: ${trend.title}` : "",
    trend.caption ? `Caption: ${trend.caption}` : "",
    trend.hashtags.length ? `Hashtags: ${trend.hashtags.join(", ")}` : "",
    trend.format ? `Format: ${trend.format}` : "",
    trend.query ? `Search query: ${trend.query}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const CHUNK_SIZE = 4;
const CHUNK_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type BackfillResult = {
  embedded: number;
  failed: number;
  remaining: number;
};

/**
 * Embeds trends that have no embedding yet, most viral first, writing via the
 * service-role client (trends has no authenticated write policy). Idempotent:
 * failures stay NULL and are retried on the next run; freshly ingested trends
 * land with NULL embeddings and are picked up the same way.
 */
export async function backfillTrendEmbeddings(batchSize = 100): Promise<BackfillResult> {
  const { data, error } = await supabaseAdmin
    .from("trends")
    .select("id, title, caption, hashtags, format, query")
    .is("embedding", null)
    .order("trend_score", { ascending: false })
    .limit(batchSize);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  let embedded = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (row) => {
        const vector = await embedText(
          buildTrendEmbedText({ ...row, hashtags: row.hashtags ?? [] }),
        );
        if (!vector) return false;
        const { error: updateError } = await supabaseAdmin
          .from("trends")
          .update({ embedding: JSON.stringify(vector) })
          .eq("id", row.id);
        if (updateError) {
          console.error(`Trend embedding write failed: ${updateError.message}`);
          return false;
        }
        return true;
      }),
    );
    embedded += results.filter(Boolean).length;
    failed += results.filter((ok) => !ok).length;
    if (index + CHUNK_SIZE < rows.length) await sleep(CHUNK_DELAY_MS);
  }

  const { count } = await supabaseAdmin
    .from("trends")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  return { embedded, failed, remaining: count ?? 0 };
}

export async function countUnembeddedTrends(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("trends")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
