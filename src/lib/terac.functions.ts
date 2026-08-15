import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  applyRevision,
  createReviewSession,
  editDirective,
  getReviewResults,
  listJudgeRoster,
  listReminderTargets,
  listReviewSessions,
  markDirective,
  upsertJudge,
} from "./terac.server";
import { synthesizeSession } from "./terac-synthesis.server";
import { maybeCompleteSession } from "./terac-portal.server";

export const listJudges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listJudgeRoster(context.supabase, context.userId));

export const saveJudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        email: z.string().trim().email().max(160),
        expertiseTags: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => upsertJudge(context.supabase, context.userId, data));

export const startReviewSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        remixIds: z.array(z.string().uuid()).min(1).max(20),
        judgeIds: z.array(z.string().uuid()).max(20).default([]),
        quorum: z.number().int().min(1).max(20).default(3),
        deadlineHours: z.number().int().min(1).max(720).default(72),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => createReviewSession(context.supabase, context.userId, data));

export const listSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listReviewSessions(context.supabase, context.userId));

export const getSessionResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    // Close on quorum/deadline and synthesize on first view after completion.
    await maybeCompleteSession(data.sessionId, context.userId);
    return getReviewResults(context.supabase, context.userId, data.sessionId);
  });

export const runSynthesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    synthesizeSession(context.supabase, context.userId, data.sessionId),
  );

export const approveRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sessionId: z.string().uuid(), videoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) =>
    applyRevision(context.supabase, context.userId, data.sessionId, data.videoId),
  );

export const dismissRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ sessionId: z.string().uuid(), videoId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await getReviewResults(context.supabase, context.userId, data.sessionId);
    return markDirective(context.supabase, data.sessionId, data.videoId, "dismissed");
  });

export const updateRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        sessionId: z.string().uuid(),
        videoId: z.string().uuid(),
        changes: z
          .array(
            z.object({
              element: z.string().trim().min(2).max(40),
              action: z.enum(["replace", "adjust", "keep"]),
              from: z.string().max(4000).optional(),
              to: z.string().max(4000).optional(),
            }),
          )
          .max(10),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await getReviewResults(context.supabase, context.userId, data.sessionId);
    return editDirective(context.supabase, data.sessionId, data.videoId, data.changes);
  });

export const getReminderTargets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    listReminderTargets(context.supabase, context.userId, data.sessionId),
  );
