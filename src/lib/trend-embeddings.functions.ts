import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { assertMaintenanceAllowed } from "./maintenance.server";

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
  .handler(async ({ context, data }) => {
    assertMaintenanceAllowed(context.claims);
    const { backfillTrendEmbeddings } = await import("./trend-embeddings.server");
    return backfillTrendEmbeddings(data.batchSize ?? 100);
  });

export const getWomIndexStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { countUnembeddedWom } = await import("./wom-embeddings.server");
    return { remaining: await countUnembeddedWom() };
  });

export const runWomEmbeddingBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ batchSize: z.number().int().min(1).max(200).optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    assertMaintenanceAllowed(context.claims);
    const { backfillWomEmbeddings } = await import("./wom-embeddings.server");
    return backfillWomEmbeddings(data.batchSize ?? 100);
  });

export const runDedupeTrends = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ threshold: z.number().min(0.8).max(0.999).optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    assertMaintenanceAllowed(context.claims);
    const { dedupeTrends } = await import("./dedupe.server");
    return dedupeTrends(data.threshold ?? 0.95);
  });
