import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  deleteCompanyRow,
  getOwnedCompany,
  insertCompany,
  listOwnedCompanies,
  updateCompanyRow,
} from "./owner.server";

const companyInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  ownerName: z.string().trim().min(2).max(80),
  categoryId: z.string().uuid(),
  bio: z.string().trim().min(10).max(1200),
  mission: z.string().trim().min(10).max(1200),
  website: z.string().trim().max(200).optional().nullable(),
  logoPath: z.string().trim().max(300).optional().nullable(),
});

export const listMyCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listOwnedCompanies(context.supabase, context.userId));

export const getMyCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    getOwnedCompany(context.supabase, context.userId, data.id),
  );

export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => companyInputSchema.parse(input))
  .handler(async ({ context, data }) => insertCompany(context.supabase, context.userId, data));

export const updateCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    companyInputSchema.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { id, ...rest } = data;
    return updateCompanyRow(context.supabase, context.userId, id, rest);
  });

export const deleteCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await deleteCompanyRow(context.supabase, context.userId, data.id);
    return { ok: true };
  });
