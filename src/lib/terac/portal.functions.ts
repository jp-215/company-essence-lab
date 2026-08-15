/**
 * Terac — judge portal server functions.
 *
 * Deliberately NOT wrapped in requireSupabaseAuth. A judge never creates a
 * password; the invite token is the credential, and it is validated inside the
 * SECURITY DEFINER RPCs these call.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { DIMENSIONS, RATINGS } from "./spec";
import { claimSession, openSession, saveBallot, submitBallot } from "./portal.server";

const tokenSchema = z
  .string()
  .trim()
  .regex(/^[a-f0-9]{20,128}$/i, "Invalid link");

export const openReview = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: tokenSchema }).parse(input))
  .handler(async ({ data }) => openSession(data.token));

export const saveReviewBallot = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        videoId: z.string().uuid(),
        isPick: z.boolean().default(false),
        body: z.string().max(4000).default(""),
        dimensionScores: z.record(z.enum(DIMENSIONS), z.enum(RATINGS)).default({}),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    await saveBallot(data);
    return { saved: true };
  });

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        token: tokenSchema,
        ranks: z
          .array(z.object({ video_id: z.string().uuid(), rank: z.number().int().min(1).max(24) }))
          .max(24)
          .default([]),
        overallNote: z.string().max(4000).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => submitBallot(data));

export const claimReview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        publicToken: tokenSchema,
        name: z.string().trim().min(1).max(120),
        email: z.string().trim().email().max(200),
      })
      .parse(input),
  )
  .handler(async ({ data }) => claimSession(data));
