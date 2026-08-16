import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  listMappedTrends,
  listRemixes,
  loadCompanyContext,
  remixTrend,
  saveRemix,
  saveSourcedRemix,
  getWomAsTrend,
  getImageAsTrend,
} from "./remix.server";
import { getTrendByKey } from "./recommendations.server";

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
    const trend = await getTrendByKey(context.supabase, data.trendKey);
    if (!trend) {
      throw new Error("That trend no longer exists.");
    }

    const output = await remixTrend({ trend, company });
    return saveRemix(context.supabase, context.userId, {
      companyId: data.companyId,
      trend,
      output,
    });
  });

/**
 * Batch hand-off: turns a multi-select of feed items (TikTok trends and Reddit
 * chatter) into saved remixes ready for video generation.
 */
export const generateRemixBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        items: z
          .array(
            z.object({
              kind: z.enum(["video", "chatter", "image"]),
              key: z.string().trim().min(3).max(80),
            }),
          )
          .min(1)
          .max(6),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const company = await loadCompanyContext(context.supabase, context.userId, data.companyId);
    const created: string[] = [];
    const failed: string[] = [];

    for (const item of data.items) {
      try {
        const trend =
          item.kind === "video"
            ? await getTrendByKey(context.supabase, item.key)
            : item.kind === "image"
              ? await getImageAsTrend(context.supabase, item.key)
              : await getWomAsTrend(context.supabase, item.key);
        if (!trend) {
          failed.push(item.key);
          continue;
        }
        const output = await remixTrend({ trend, company });
        const saved = await saveSourcedRemix(context.supabase, context.userId, {
          companyId: data.companyId,
          kind: item.kind,
          trend,
          output,
        });
        created.push(saved.id);
      } catch (error) {
        console.error("Batch remix failed", item.key, error);
        failed.push(item.key);
      }
    }

    return { created, failed };
  });

/**
 * ImageBase remix: OCRs the selected assets (reusing stored scans), then turns
 * each one into a brand-specific concept. Up to 6 assets per run, matching the
 * video generator's influence cap.
 */
export const generateImageRemixBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid(),
        imageKeys: z.array(z.string().trim().min(3).max(80)).min(1).max(6),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const company = await loadCompanyContext(context.supabase, context.userId, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scanImage } = await import("./ocr.server");

    const created: string[] = [];
    const failed: string[] = [];
    const ocrText: Record<string, string> = {};

    for (const imageKey of data.imageKeys) {
      try {
        // Best-effort OCR: a scan failure should not block the remix itself.
        try {
          const scan = await scanImage(supabaseAdmin, imageKey);
          ocrText[imageKey] = scan.text;
        } catch (scanError) {
          console.error("OCR unavailable for", imageKey, scanError);
        }

        const trend = await getImageAsTrend(context.supabase, imageKey);
        if (!trend) {
          failed.push(imageKey);
          continue;
        }
        const output = await remixTrend({ trend, company });
        const saved = await saveSourcedRemix(context.supabase, context.userId, {
          companyId: data.companyId,
          kind: "image",
          trend,
          output,
        });
        created.push(saved.id);
      } catch (error) {
        console.error("Image remix failed", imageKey, error);
        failed.push(imageKey);
      }
    }

    return { created, failed, ocrText };
  });
