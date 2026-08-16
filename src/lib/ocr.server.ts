/**
 * OCR pipeline for Vira's ImageBase.
 *
 * Primary provider is Google Cloud Vision (DOCUMENT_TEXT_DETECTION) using an
 * API key supplied through the GOOGLE_CLOUD_VISION_API_KEY secret. When that
 * key is absent we fall back to a Gemini vision read through the Lovable AI
 * gateway so the remix flow keeps working while the key is being provisioned.
 *
 * Extracted copy is persisted in public.image_ocr keyed by image_key (the
 * ImageBase primary identifier key) and reused by the remix prompts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import type { ImageOcrDTO, OcrBatchResult, OcrBlock, OcrCoverage, OcrStatus } from "./ocr-types";

type Client = SupabaseClient<Database>;

const VISION_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";
const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export type OcrReadResult = {
  provider: string;
  text: string;
  languages: string[];
  confidence: number;
  blocks: OcrBlock[];
};

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/* ------------------------------- providers -------------------------------- */

type VisionVertex = { x?: number; y?: number };

function normalizedBox(
  vertices: VisionVertex[] | undefined,
  width: number,
  height: number,
): OcrBlock["box"] {
  if (!vertices?.length || width <= 0 || height <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const xs = vertices.map((v) => (v.x ?? 0) / width);
  const ys = vertices.map((v) => (v.y ?? 0) / height);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return {
    x: Number(x.toFixed(4)),
    y: Number(y.toFixed(4)),
    w: Number((Math.max(...xs) - x).toFixed(4)),
    h: Number((Math.max(...ys) - y).toFixed(4)),
  };
}

/** Google Cloud Vision read. Accepts a public image URL (no upload needed). */
export async function readWithGoogleVision(imageUrl: string, apiKey: string): Promise<OcrReadResult> {
  // Plain API keys (AIza...) go on the query string; OAuth-style access tokens
  // (AQ..., ya29...) must be sent as a bearer token instead.
  const isApiKey = apiKey.startsWith("AIza");
  const endpoint = isApiKey
    ? `${VISION_ENDPOINT}?key=${encodeURIComponent(apiKey)}`
    : VISION_ENDPOINT;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(isApiKey ? {} : { Authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({
      requests: [
        {
          image: { source: { imageUri: imageUrl } },
          features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
          imageContext: { languageHints: ["en"] },
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Vision failed [${response.status}]: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    responses?: Array<{
      error?: { message?: string };
      fullTextAnnotation?: { text?: string; pages?: Array<{ width?: number; height?: number }> };
      textAnnotations?: Array<{
        description?: string;
        boundingPoly?: { vertices?: VisionVertex[] };
      }>;
    }>;
  };

  const first = payload.responses?.[0];
  if (first?.error?.message) throw new Error(`Google Vision: ${first.error.message}`);

  const text = (first?.fullTextAnnotation?.text ?? "").replace(/\r/g, "").trim();
  const page = first?.fullTextAnnotation?.pages?.[0];
  const width = page?.width ?? 0;
  const height = page?.height ?? 0;

  // textAnnotations[0] is the whole block; the rest are individual words.
  const blocks: OcrBlock[] = (first?.textAnnotations ?? []).slice(1, 60).map((annotation) => ({
    text: annotation.description ?? "",
    box: normalizedBox(annotation.boundingPoly?.vertices, width, height),
    confidence: 0,
  }));

  return {
    provider: "google-vision",
    text,
    languages: text ? ["en"] : [],
    confidence: text ? 0.9 : 0,
    blocks,
  };
}

/** Gemini fallback read through the Lovable AI gateway. */
export async function readWithGemini(imageUrl: string, lovableKey: string): Promise<OcrReadResult> {
  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        {
          role: "system",
          content:
            "You transcribe text that appears inside advertising images. Return ONLY the literal on-image text in reading order, one line per visual line. If the image contains no text, return the single word NONE.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcribe all visible text in this image." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini OCR failed [${response.status}]: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const raw = (payload.choices?.[0]?.message?.content ?? "").trim();
  const text = raw.toUpperCase() === "NONE" ? "" : raw;

  return {
    provider: "gemini-ocr",
    text,
    languages: text ? ["en"] : [],
    confidence: text ? 0.65 : 0,
    blocks: [],
  };
}

/** Reads one image with the best available provider. */
export async function readImageText(imageUrl: string): Promise<OcrReadResult> {
  const googleKey =
    process.env["GOOGLE_CLOUD_VISION_API_KEY"] ??
    process.env["GOOGLE_API_KEY"] ??
    process.env["GOOGLE_AI_STUDIO_API_KEY"];
  const lovableKey = process.env["LOVABLE_API_KEY"];

  if (googleKey) {
    try {
      return await readWithGoogleVision(imageUrl, googleKey);
    } catch (error) {
      // Vision can reject the credential or the remote image; Gemini still reads it.
      console.error("Google Vision OCR failed, falling back to Gemini", error);
      if (!lovableKey) throw error;
    }
  }

  if (lovableKey) return readWithGemini(imageUrl, lovableKey);

  throw new Error("No OCR provider configured (set GOOGLE_CLOUD_VISION_API_KEY)");
}

/* ------------------------------ persistence ------------------------------- */

function toDTO(row: Database["public"]["Tables"]["image_ocr"]["Row"]): ImageOcrDTO {
  return {
    imageKey: row.image_key,
    provider: row.provider,
    status: row.status as OcrStatus,
    text: row.ocr_text,
    wordCount: Number(row.word_count ?? 0),
    languages: row.languages ?? [],
    confidence: Number(row.confidence ?? 0),
    blocks: Array.isArray(row.blocks) ? (row.blocks as unknown as OcrBlock[]) : [],
    scannedAt: row.scanned_at,
    error: row.error,
  };
}

/** Upserts a successful (or empty) scan. */
export async function saveOcrResult(
  admin: Client,
  imageKey: string,
  result: OcrReadResult,
): Promise<ImageOcrDTO> {
  const { data, error } = await admin
    .from("image_ocr")
    .upsert(
      {
        image_key: imageKey,
        provider: result.provider,
        status: result.text ? "done" : "empty",
        ocr_text: result.text,
        word_count: words(result.text),
        languages: result.languages,
        confidence: result.confidence,
        blocks: result.blocks as unknown as NonNullable<
          Database["public"]["Tables"]["image_ocr"]["Insert"]["blocks"]
        >,
        error: null,
        scanned_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "image_key" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data);
}

export async function saveOcrFailure(
  admin: Client,
  imageKey: string,
  message: string,
): Promise<void> {
  const { data: existing } = await admin
    .from("image_ocr")
    .select("attempts")
    .eq("image_key", imageKey)
    .maybeSingle();

  await admin.from("image_ocr").upsert(
    {
      image_key: imageKey,
      status: "failed",
      error: message.slice(0, 500),
      attempts: Number(existing?.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "image_key" },
  );
}

/** Public read of a stored scan. */
export async function getImageOcr(client: Client, imageKey: string): Promise<ImageOcrDTO | null> {
  const { data, error } = await client
    .from("image_ocr")
    .select("*")
    .eq("image_key", imageKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDTO(data) : null;
}

export async function getManyImageOcr(
  client: Client,
  imageKeys: string[],
): Promise<Record<string, ImageOcrDTO>> {
  if (!imageKeys.length) return {};
  const { data, error } = await client.from("image_ocr").select("*").in("image_key", imageKeys);
  if (error) throw new Error(error.message);
  const map: Record<string, ImageOcrDTO> = {};
  for (const row of data ?? []) map[row.image_key] = toDTO(row);
  return map;
}

/**
 * Scans one image on demand, reusing a stored scan unless force is set.
 * Requires the admin client because image_ocr is write-protected.
 */
export async function scanImage(
  admin: Client,
  imageKey: string,
  options: { force?: boolean } = {},
): Promise<ImageOcrDTO> {
  if (!options.force) {
    const existing = await getImageOcr(admin, imageKey);
    if (existing && existing.status !== "failed") return existing;
  }

  const { data: asset, error } = await admin
    .from("image_assets")
    .select("image_key, image_url")
    .eq("image_key", imageKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!asset) throw new Error("Unknown image key");

  try {
    const result = await readImageText(asset.image_url);
    return await saveOcrResult(admin, imageKey, result);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "OCR failed";
    await saveOcrFailure(admin, imageKey, message);
    throw new Error(message);
  }
}

/** Worker pass: OCRs the next batch of unscanned images. */
export async function runOcrBatch(
  admin: Client,
  limit: number,
  concurrency = 4,
): Promise<OcrBatchResult> {
  const { data, error } = await admin.rpc("images_needing_ocr", { _limit: limit });
  if (error) throw new Error(error.message);

  const queue = (data ?? []) as Array<{ image_key: string; image_url: string }>;
  let scanned = 0;
  let withText = 0;
  let failed = 0;
  let provider = "none";

  let cursor = 0;
  async function worker() {
    while (cursor < queue.length) {
      const item = queue[cursor++];
      if (!item) return;
      try {
        const result = await readImageText(item.image_url);
        await saveOcrResult(admin, item.image_key, result);
        provider = result.provider;
        scanned += 1;
        if (result.text) withText += 1;
      } catch (cause) {
        failed += 1;
        await saveOcrFailure(
          admin,
          item.image_key,
          cause instanceof Error ? cause.message : "OCR failed",
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length || 1) }, worker));

  return { requested: queue.length, scanned, withText, failed, provider };
}

export async function getOcrCoverage(client: Client): Promise<OcrCoverage> {
  const { data, error } = await client.rpc("image_ocr_coverage");
  if (error) throw new Error(error.message);
  const row = (data ?? [])[0] as
    | { total_images: number; scanned: number; with_text: number; failed: number }
    | undefined;
  return {
    totalImages: Number(row?.total_images ?? 0),
    scanned: Number(row?.scanned ?? 0),
    withText: Number(row?.with_text ?? 0),
    failed: Number(row?.failed ?? 0),
  };
}
