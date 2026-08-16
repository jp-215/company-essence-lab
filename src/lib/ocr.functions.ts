import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * OCR endpoints for the ImageBase remix flow. Reads are public (extracted text
 * from public posts); scans and batch runs go through the admin client because
 * public.image_ocr is write-protected.
 */

export const getImageOcrText = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ imageKey: z.string().trim().min(3).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { getImageOcr } = await import("./ocr.server");
    return getImageOcr(createPublicClient(), data.imageKey);
  });

export const getImageOcrTexts = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({ imageKeys: z.array(z.string().trim().min(3).max(80)).min(1).max(60) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { createPublicClient } = await import("./supabase-public.server");
    const { getManyImageOcr } = await import("./ocr.server");
    return getManyImageOcr(createPublicClient(), data.imageKeys);
  });

export const getOcrCoverageStats = createServerFn({ method: "GET" }).handler(async () => {
  const { createPublicClient } = await import("./supabase-public.server");
  const { getOcrCoverage } = await import("./ocr.server");
  return getOcrCoverage(createPublicClient());
});

/** On-demand scan for a single asset, triggered from the remix UI. */
export const scanImageText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        imageKey: z.string().trim().min(3).max(80),
        force: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scanImage } = await import("./ocr.server");
    return scanImage(supabaseAdmin, data.imageKey, { force: data.force ?? false });
  });

/** Scans a whole selection at once (used before an image remix). */
export const scanImageTextBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ imageKeys: z.array(z.string().trim().min(3).max(80)).min(1).max(12) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { scanImage } = await import("./ocr.server");

    const scanned: string[] = [];
    const failed: string[] = [];
    for (const imageKey of data.imageKeys) {
      try {
        await scanImage(supabaseAdmin, imageKey);
        scanned.push(imageKey);
      } catch (error) {
        console.error("OCR scan failed", imageKey, error);
        failed.push(imageKey);
      }
    }
    return { scanned, failed };
  });
