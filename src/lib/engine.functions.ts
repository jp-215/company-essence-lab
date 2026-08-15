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

    return requestVideo({
      companySlug: company.slug,
      product: data.product?.trim() || company.name,
      lane: data.lane,
      mode: data.mode,
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
