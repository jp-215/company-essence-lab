import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { getRecommendedTrends } from "./recommendations.server";

export const getRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        limit: z.number().int().min(1).max(24).optional(),
        query: z.string().trim().max(300).optional(),
        seed: z.number().int().min(0).max(1_000_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) =>
    getRecommendedTrends(context.supabase, data.companyId, {
      limit: data.limit,
      queryText: data.query,
      seed: data.seed,
    }),
  );

export const getChatterRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        limit: z.number().int().min(1).max(24).optional(),
        seed: z.number().int().min(0).max(1_000_000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { getRecommendedChatter } = await import("./recommendations.server");
    return getRecommendedChatter(
      context.supabase,
      data.companyId,
      data.limit ?? 6,
      data.seed ?? 1,
    );
  });

