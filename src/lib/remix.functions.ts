import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  listMappedTrends,
  listRemixes,
  loadCompanyContext,
  remixTrend,
  saveRemix,
} from "./remix.server";

export const listCompanyTrends = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ companyId: z.string().uuid(), limit: z.number().int().min(1).max(200).optional() })
      .parse(input),
  )
  .handler(async ({ context, data }) =>
    listMappedTrends(context.supabase, data.companyId, data.limit ?? 24),
  );

export const listCompanyRemixes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    listRemixes(context.supabase, data.companyId, context.userId),
  );

export const generateRemix = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ companyId: z.string().uuid(), trendKey: z.string().trim().min(3).max(60) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const company = await loadCompanyContext(context.supabase, context.userId, data.companyId);
    const trends = await listMappedTrends(context.supabase, data.companyId, 200);
    const trend = trends.find((item) => item.trendKey === data.trendKey);
    if (!trend) {
      throw new Error("That trend is not mapped to your company's category.");
    }

    const output = await remixTrend({ trend, company });
    return saveRemix(context.supabase, context.userId, {
      companyId: data.companyId,
      trend,
      output,
    });
  });
