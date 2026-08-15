import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embedText } from "./knowledge.server";
import type { BackfillResult } from "./trend-embeddings.server";

export type WomEmbedSource = {
  title: string;
  content: string;
  hashtags: string[];
  topic: string;
  theme: string;
  query: string;
};

export function buildWomEmbedText(row: WomEmbedSource): string {
  return [
    row.title ? `Title: ${row.title}` : "",
    row.content ? `Post: ${row.content}` : "",
    row.hashtags.length ? `Hashtags: ${row.hashtags.join(", ")}` : "",
    row.topic ? `Topic: ${row.topic}` : "",
    row.theme ? `Theme: ${row.theme}` : "",
    row.query ? `Search query: ${row.query}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

const CHUNK_SIZE = 4;
const CHUNK_DELAY_MS = 300;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Embeds word-of-mouth posts that have no embedding yet, highest buzz first.
 * Mirrors backfillTrendEmbeddings: service-role writes, idempotent, failures
 * stay NULL and are retried on the next run.
 */
export async function backfillWomEmbeddings(batchSize = 100): Promise<BackfillResult> {
  const { data, error } = await supabaseAdmin
    .from("word_of_mouth")
    .select("id, title, content, hashtags, topic, theme, query")
    .is("embedding", null)
    .order("buzz_score", { ascending: false })
    .limit(batchSize);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  let embedded = 0;
  let failed = 0;

  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const chunk = rows.slice(index, index + CHUNK_SIZE);
    const results = await Promise.all(
      chunk.map(async (row) => {
        const vector = await embedText(buildWomEmbedText({ ...row, hashtags: row.hashtags ?? [] }));
        if (!vector) return false;
        const { error: updateError } = await supabaseAdmin
          .from("word_of_mouth")
          .update({ embedding: JSON.stringify(vector) })
          .eq("id", row.id);
        if (updateError) {
          console.error(`WoM embedding write failed: ${updateError.message}`);
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
    .from("word_of_mouth")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);

  return { embedded, failed, remaining: count ?? 0 };
}

export async function countUnembeddedWom(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("word_of_mouth")
    .select("id", { count: "exact", head: true })
    .is("embedding", null);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
