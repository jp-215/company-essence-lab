import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { getRecommendedTrends } from "./recommendations.server";

const surfaceSchema = z.enum(["dashboard", "trends", "chat", "remix", "community"]);

export const getRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        limit: z.number().int().min(1).max(24).optional(),
        query: z.string().trim().max(300).optional(),
        seed: z.number().int().min(0).max(1_000_000).optional(),
        surface: surfaceSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) =>
    getRecommendedTrends(context.supabase, data.companyId, {
      limit: data.limit,
      queryText: data.query,
      seed: data.seed,
      surface: data.surface,
      ownerId: context.userId,
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
        surface: surfaceSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { getRecommendedChatter } = await import("./recommendations.server");
    return getRecommendedChatter(context.supabase, data.companyId, data.limit ?? 6, data.seed, {
      surface: data.surface,
      ownerId: context.userId,
    });
  });
