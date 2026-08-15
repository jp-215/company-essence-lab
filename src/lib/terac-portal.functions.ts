import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { openReview, saveJudgeFeedback, submitReview } from "./terac-portal.server";

/**
 * Public endpoints for the token-gated judge portal. There is no session and no
 * login: the invite token IS the credential, and every handler re-resolves it
 * server-side, so a token can only ever touch its own session_judge row.
 */

const tokenSchema = z.string().trim().min(10).max(80);

const scoreSchema = z
  .object({
    hook_strength: z.enum(["weak", "okay", "strong"]).optional(),
    pacing: z.enum(["weak", "okay", "strong"]).optional(),
    product_clarity: z.enum(["weak", "okay", "strong"]).optional(),
    visual_quality: z.enum(["weak", "okay", "strong"]).optional(),
    cta: z.enum(["weak", "okay", "strong"]).optional(),
    brand_fit: z.enum(["weak", "okay", "strong"]).optional(),
  })
  .default({});

export const openJudgeReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => openReview(data.token));

export const saveJudgeVideoFeedback = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        videoId: z.string().uuid(),
        isPick: z.boolean().default(false),
        body: z.string().max(4000).default(""),
        scores: scoreSchema,
      })
      .parse(input),
  )
  .handler(async ({ data }) => saveJudgeFeedback(data));

export const submitJudgeReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        rankedVideoIds: z.array(z.string().uuid()).max(20).default([]),
        overallNote: z.string().max(4000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => submitReview(data));
