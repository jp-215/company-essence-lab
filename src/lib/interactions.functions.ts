import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { getSocialProof, logInteractions } from "./interactions.server";

const surfaceSchema = z.enum(["dashboard", "trends", "chat", "remix", "community"]);

/** UI-triggered events (chip taps, card opens, swipe skips). */
export const logTrendInteractions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        surface: surfaceSchema,
        action: z.enum(["tap", "skip"]),
        trendKeys: z.array(z.string().min(3).max(200)).min(1).max(50),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { data: company, error } = await context.supabase
      .from("companies")
      .select("id")
      .eq("id", data.companyId)
      .eq("owner_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!company) throw new Error("Company not found.");

    await logInteractions(
      context.supabase,
      data.trendKeys.map((trendKey) => ({
        companyId: data.companyId,
        ownerId: context.userId,
        trendKey,
        action: data.action,
        surface: data.surface,
      })),
    );
    return { logged: data.trendKeys.length };
  });

/** Public: aggregate remix/tap counts for social-proof badges on anon surfaces. */
export const getTrendSocialProof = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ trendKeys: z.array(z.string().min(3).max(200)).min(1).max(50) }).parse(input),
  )
  .handler(async ({ data }) => {
    const proof = await getSocialProof(data.trendKeys);
    return Object.fromEntries(proof);
  });
