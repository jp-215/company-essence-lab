import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  listMappedPrescripts,
  listRemixes,
  loadCompanyContext,
  remixPrescript,
  saveRemix,
} from "./remix.server";

export const listCompanyPrescripts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ companyId: z.string().uuid(), limit: z.number().int().min(1).max(100).optional() })
      .parse(input),
  )
  .handler(async ({ context, data }) =>
    listMappedPrescripts(context.supabase, data.companyId, data.limit ?? 24),
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
      .object({ companyId: z.string().uuid(), prescriptKey: z.string().trim().min(3).max(40) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const company = await loadCompanyContext(context.supabase, context.userId, data.companyId);
    const prescripts = await listMappedPrescripts(context.supabase, data.companyId, 100);
    const prescript = prescripts.find((item) => item.prescriptKey === data.prescriptKey);
    if (!prescript) {
      throw new Error("That prescript is not mapped to your company's category.");
    }

    const output = await remixPrescript({ prescript, company });
    return saveRemix(context.supabase, context.userId, {
      companyId: data.companyId,
      prescriptKey: prescript.prescriptKey,
      platform: prescript.platform,
      output,
    });
  });
