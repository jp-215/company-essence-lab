import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * ImageBase → branded still creatives. Mirrors the video flow: pick up to six
 * scraped assets, read their on-image copy with OCR, write brand-specific copy,
 * then render each one with Gemini's image model.
 */

export const generateImageCreatives = createServerFn({ method: "POST" })
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { loadCompanyContext, getImageAsTrend, remixTrend } = await import("./remix.server");
    const { scanImage } = await import("./ocr.server");
    const { buildImagePrompt, renderCreative, storeCreative, storeFailure } = await import(
      "./image-remix.server"
    );

    const company = await loadCompanyContext(context.supabase, context.userId, data.companyId);
    const created: string[] = [];
    const failed: Array<{ imageKey: string; error: string }> = [];

    for (const imageKey of data.imageKeys) {
      let headline = "";
      let prompt = "";
      try {
        const { data: asset, error } = await context.supabase
          .from("image_assets")
          .select("image_key, image_url, caption, title")
          .eq("image_key", imageKey)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!asset) throw new Error("Unknown ImageBase asset");

        // OCR is best-effort: a failed read still yields a usable remix.
        let ocrText = "";
        try {
          const scan = await scanImage(supabaseAdmin, imageKey);
          ocrText = scan.text;
        } catch (scanError) {
          console.error("OCR unavailable for", imageKey, scanError);
        }

        const trend = await getImageAsTrend(context.supabase, imageKey);
        if (!trend) throw new Error("Asset could not be prepared for remixing");
        const copy = await remixTrend({ trend, company });
        headline = copy.hook;

        prompt = buildImagePrompt({
          company,
          headline: copy.hook,
          caption: copy.caption,
          ocrText,
          assetCaption: asset.caption || asset.title || "",
        });

        const rendered = await renderCreative(prompt, asset.image_url);
        const saved = await storeCreative(supabaseAdmin, {
          ownerId: context.userId,
          companyId: data.companyId,
          imageKey,
          headline: copy.hook,
          caption: copy.caption,
          prompt,
          ocrText,
          rendered,
        });
        created.push(saved.id);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Image remix failed";
        console.error("Image creative failed", imageKey, message);
        await storeFailure(supabaseAdmin, {
          ownerId: context.userId,
          companyId: data.companyId,
          imageKey,
          headline,
          prompt,
          message,
        });
        failed.push({ imageKey, error: message });
      }
    }

    return { created, failed };
  });

export const listImageCreatives = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        companyId: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(60).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { listImageRemixes } = await import("./image-remix.server");
    return listImageRemixes(supabaseAdmin, context.userId, {
      companyId: data.companyId,
      limit: data.limit,
    });
  });
