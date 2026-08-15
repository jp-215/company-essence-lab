/**
 * Terac — brand-side server functions (authenticated).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { revisionDirectiveSchema } from "./spec";
import {
  createReviewSession,
  listSessions,
  notifyCompletion,
  sendDueReminders,
} from "./sessions.server";
import { loadSessionResults, loadVideoSpec } from "./results.server";
import { synthesiseSession } from "./synthesis.server";
import { previewRegeneration, regenerateVideo, loadLineage } from "./regeneration.server";
import { terac } from "./terac-db";

function origin(): string {
  const request = getRequest();
  const explicit = process.env["TERAC_PUBLIC_ORIGIN"];
  if (explicit) return explicit;
  if (request?.url) return new URL(request.url).origin;
  return "http://localhost:8080";
}

// --- Flow A ----------------------------------------------------------------
//
// There is no judge roster. A session opens as a task in the Terac agent pool:
// anyone with the session link can claim it, watch every concept, rank them and
// leave feedback. Identity is captured on claim, not curated up front.

export const createAds = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        trendKeys: z.array(z.string().trim().min(3).max(40)).min(1).max(6),
        quorum: z.number().int().min(1).max(20).default(3),
        deadlineHours: z.number().int().min(1).max(336).default(48),
      })
      .parse(input),
  )

  .handler(async ({ context, data }) =>
    createReviewSession(context.supabase, context.userId, { ...data, origin: origin() }),
  );

export const listReviewSessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listSessions(context.supabase, context.userId, origin()));

export const getSessionResults = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    loadSessionResults(context.supabase, context.userId, data.sessionId),
  );

export const getVideoSpec = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ videoId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    loadVideoSpec(context.supabase, context.userId, data.videoId),
  );

export const runReminders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    sent: await sendDueReminders(context.supabase, context.userId, origin()),
  }));

export const notifySessionComplete = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => ({
    notified: await notifyCompletion(context.supabase, context.userId, data.sessionId, origin()),
  }));

// --- Flow C ----------------------------------------------------------------

export const runSynthesis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    synthesiseSession(context.supabase, context.userId, data.sessionId),
  );

export const previewRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ directive: revisionDirectiveSchema }).parse(input))
  .handler(async ({ context, data }) =>
    previewRegeneration(context.supabase, context.userId, data.directive),
  );

export const approveRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ directive: revisionDirectiveSchema }).parse(input))
  .handler(async ({ context, data }) =>
    regenerateVideo(context.supabase, context.userId, { directive: data.directive }),
  );

export const getLineage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ videoId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    loadLineage(context.supabase, context.userId, data.videoId),
  );
