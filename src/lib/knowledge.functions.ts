import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { listKnowledge, semanticSearch, syncOwnedKnowledge } from "./knowledge.server";

export const listKnowledgeBase = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ search: z.string().max(120).optional() }).parse(input ?? {}),
  )
  .handler(async ({ context, data }) =>
    listKnowledge(context.supabase, context.userId, data.search),
  );

export const searchKnowledgeBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        query: z.string().trim().min(3).max(400),
        limit: z.number().int().min(1).max(12).optional(),
        excludeCompanyId: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) =>
    semanticSearch(context.supabase, data.query, data.limit ?? 6, data.excludeCompanyId),
  );

export const syncMyKnowledge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => syncOwnedKnowledge(context.supabase, context.userId));
