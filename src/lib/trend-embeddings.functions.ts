import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getTrendIndexStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { countUnembeddedTrends } = await import("./trend-embeddings.server");
    return { remaining: await countUnembeddedTrends() };
  });

export const runTrendEmbeddingBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ batchSize: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const { backfillTrendEmbeddings } = await import("./trend-embeddings.server");
    return backfillTrendEmbeddings(data.batchSize ?? 100);
  });
