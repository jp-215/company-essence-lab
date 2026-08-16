import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  ensureEngineCompany,
  fetchCompanyVideos,
  fetchJob,
  fetchJobEvents,
  fetchLanes,
  fetchVideo,
  requestRegenerate,
  requestVideo,
} from "./engine.server";
import { getOwnedCompany } from "./owner.server";
import { briefToProse } from "./brief-prose";

export const listVideoLanes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => fetchLanes());

export const listVideosForCompany = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const company = await getOwnedCompany(context.supabase, context.userId, data.companyId);
    if (!company) throw new Error("That product is not yours.");
    return fetchCompanyVideos(company.slug);
  });

export const startVideoRender = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        lane: z.string().trim().min(2).max(60),
        mode: z.enum(["fast", "agentic"]).default("fast"),
        product: z.string().trim().min(2).max(200).optional(),
        // Up to six pieces of platform content the founder selected as influence.
        influences: z.array(z.string().trim().min(2).max(300)).max(6).default([]),
        // ImageBase stills / trends the founder picked as references. When present
        // we compose a Creative Brief (OCR + sentiment + texture + motion) first.
        imageKeys: z.array(z.string().trim().min(2).max(200)).max(6).default([]),
        trendKeys: z.array(z.string().trim().min(2).max(200)).max(6).default([]),
        durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
        aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const company = await getOwnedCompany(context.supabase, context.userId, data.companyId);
    if (!company) throw new Error("That product is not yours.");

    await ensureEngineCompany({
      slug: company.slug,
      name: company.name,
      category: company.categoryName,
      bio: company.bio,
      mission: company.mission,
      website: company.website,
    });

    // The engine takes a single free-text product brief, so selected trends ride
    // along as explicit influence lines it can ground the script in.
    const base = data.product?.trim() || company.name;
    const product = data.influences.length
      ? `${base}. Influenced by these trending posts: ${data.influences
          .map((line, index) => `(${index + 1}) ${line}`)
          .join(" ")}`.slice(0, 1800)
      : base;

    // No references picked: keep the plain prose path.
    if (!data.imageKeys.length && !data.trendKeys.length) {
      return requestVideo({
        companySlug: company.slug,
        product,
        lane: data.lane,
        mode: data.mode,
      });
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prepareBrief, attachBriefRender } = await import("./brief.server");
    const { briefId, brief } = await prepareBrief(supabaseAdmin, {
      companyId: company.id,
      ownerId: context.userId,
      imageKeys: data.imageKeys,
      trendKeys: data.trendKeys,
      lane: data.lane,
      mode: data.mode,
      durationSeconds: data.durationSeconds,
      aspectRatio: data.aspectRatio,
    });

    try {
      const job = await requestVideo({
        companySlug: company.slug,
        product: briefToProse(brief),
        lane: data.lane,
        mode: data.mode,
        brief,
        briefId,
      });
      await attachBriefRender(supabaseAdmin, briefId, {
        engineJobId: job.job_id ?? null,
      });
      return { ...job, brief_id: briefId, brief_quality: brief.signalQuality, excluded: brief.excluded };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Render request failed";
      await attachBriefRender(supabaseAdmin, briefId, { error: message });
      throw new Error(message);
    }
  });

/** Composes (and caches) the brief so founders can review it before rendering. */
export const buildVideoBrief = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        imageKeys: z.array(z.string().trim().min(2).max(200)).min(1).max(6),
        trendKeys: z.array(z.string().trim().min(2).max(200)).max(6).default([]),
        durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
        aspectRatio: z.enum(["9:16", "16:9", "1:1"]).default("9:16"),
        force: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const company = await getOwnedCompany(context.supabase, context.userId, data.companyId);
    if (!company) throw new Error("That product is not yours.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { prepareBrief } = await import("./brief.server");
    return prepareBrief(supabaseAdmin, {
      companyId: company.id,
      ownerId: context.userId,
      imageKeys: data.imageKeys,
      trendKeys: data.trendKeys,
      durationSeconds: data.durationSeconds,
      aspectRatio: data.aspectRatio,
      force: data.force,
    });
  });


export const getVideoJob = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ jobId: z.string().min(6).max(120) }).parse(input))
  .handler(async ({ data }) => {
    const job = await fetchJob(data.jobId);
    const events = await fetchJobEvents(data.jobId).catch(() => ({ events: [] }));
    const video = job.video_id ? await fetchVideo(job.video_id).catch(() => null) : null;
    return { job, events: events.events.slice(-8), video };
  });

export const regenerateVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        videoId: z.string().min(6).max(120),
        notes: z.array(z.string().trim().min(2).max(400)).max(20).default([]),
        lane: z.string().trim().min(2).max(60).nullish(),
      })
      .parse(input),
  )
  .handler(async ({ data }) =>
    requestRegenerate(data.videoId, { notes: data.notes, lane: data.lane ?? null }),
  );
