/**
 * ImageBase creative remixing.
 *
 * Takes a scraped Instagram asset, the on-image copy we read with OCR, and the
 * brand context, then renders a brand-specific still creative with Gemini's
 * image model ("nano banana"). Renders go through the Lovable AI gateway; if a
 * Google AI Studio credential is present we fall back to Google directly so the
 * flow keeps working when the gateway is unavailable.
 *
 * Output bytes land in the private `remix-images` bucket under the owner's id
 * and are handed to the client as short-lived signed URLs.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import type { ImageRemixDTO } from "./image-remix-types";

type Client = SupabaseClient<Database>;

const GATEWAY_IMAGES = "https://ai.gateway.lovable.dev/v1/chat/completions";
const NANO_BANANA = "google/gemini-2.5-flash-image";
const GOOGLE_DIRECT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent";
const BUCKET = "remix-images";
const SIGNED_URL_TTL = 60 * 60 * 6;

export type BrandContext = {
  name: string;
  bio: string;
  mission: string;
  category: string;
  positioning: string | null;
  tone: string | null;
  keywords: string[];
  adThemes: string[];
};

export type RenderedCreative = {
  bytes: Uint8Array;
  contentType: string;
  provider: string;
  notes: string;
};

/* ------------------------------ prompt build ------------------------------ */

export function buildImagePrompt(input: {
  company: BrandContext;
  headline: string;
  caption: string;
  ocrText: string;
  assetCaption: string;
}): string {
  const { company } = input;
  return [
    `Remix this trending ${company.category} advertisement into a new static ad creative for the brand "${company.name}".`,
    `Brand mission: ${company.mission}`,
    company.positioning ? `Positioning: ${company.positioning}` : "",
    company.tone ? `Tone of voice: ${company.tone}` : "",
    company.keywords.length ? `Brand keywords: ${company.keywords.slice(0, 8).join(", ")}` : "",
    input.ocrText
      ? `The reference creative shows this on-image copy: "${input.ocrText.slice(0, 400)}". Keep the same layout energy and text placement, but replace the words with the new headline.`
      : "Keep the composition energy of the reference creative.",
    input.assetCaption ? `Reference caption context: ${input.assetCaption.slice(0, 240)}` : "",
    `Render the headline text exactly as: "${input.headline}"`,
    "Requirements: vertical 4:5 social ad, photoreal product-forward styling, clean legible typography, no watermarks, no competitor logos, no gibberish text.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* -------------------------------- rendering ------------------------------- */

function decodeDataUrl(url: string): { bytes: Uint8Array; contentType: string } {
  const parts = url.startsWith("data:") ? url.split(";base64,") : ["", url];
  const payload = parts[1] ?? parts[0] ?? "";
  const contentType = (parts[0] ?? "").replace("data:", "") || "image/png";
  const binary = atob(payload ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return { bytes, contentType };
}

/** Nano banana render through the Lovable AI gateway (image-in, image-out). */
async function renderWithGateway(
  prompt: string,
  sourceImageUrl: string,
  lovableKey: string,
): Promise<RenderedCreative> {
  const response = await fetch(GATEWAY_IMAGES, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: NANO_BANANA,
      modalities: ["image", "text"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: sourceImageUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Image remix failed [${response.status}]: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        images?: Array<{ image_url?: { url?: string } }>;
      };
    }>;
  };
  const message = payload.choices?.[0]?.message;
  const url = message?.images?.[0]?.image_url?.url;
  if (!url) {
    throw new Error(`Model returned no image. ${(message?.content ?? "").slice(0, 200)}`);
  }
  const { bytes, contentType } = decodeDataUrl(url);
  return { bytes, contentType, provider: "nano-banana-gateway", notes: message?.content ?? "" };
}

/** Direct Google AI Studio render, used when the gateway is unavailable. */
async function renderWithGoogle(
  prompt: string,
  sourceImageUrl: string,
  googleKey: string,
): Promise<RenderedCreative> {
  const source = await fetch(sourceImageUrl);
  if (!source.ok) throw new Error(`Could not download source image [${source.status}]`);
  const buffer = new Uint8Array(await source.arrayBuffer());
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  const base64 = btoa(binary);
  const mimeType = source.headers.get("content-type") ?? "image/jpeg";

  const isApiKey = googleKey.startsWith("AIza");
  const response = await fetch(
    isApiKey ? `${GOOGLE_DIRECT}?key=${encodeURIComponent(googleKey)}` : GOOGLE_DIRECT,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(isApiKey ? {} : { Authorization: `Bearer ${googleKey}` }),
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google image remix failed [${response.status}]: ${body.slice(0, 300)}`);
  }

  const payload = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; inlineData?: { data?: string; mimeType?: string } }> };
    }>;
  };
  const parts = payload.candidates?.[0]?.content?.parts ?? [];
  const inline = parts.find((part) => part.inlineData?.data)?.inlineData;
  if (!inline?.data) throw new Error("Google returned no image data.");
  const decoded = decodeDataUrl(inline.data);
  return {
    bytes: decoded.bytes,
    contentType: inline.mimeType ?? "image/png",
    provider: "nano-banana-google",
    notes: parts.find((part) => part.text)?.text ?? "",
  };
}

export async function renderCreative(
  prompt: string,
  sourceImageUrl: string,
): Promise<RenderedCreative> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const googleKey =
    process.env["GOOGLE_AI_STUDIO_API_KEY"] ?? process.env["GOOGLE_API_KEY"] ?? undefined;

  if (lovableKey) {
    try {
      return await renderWithGateway(prompt, sourceImageUrl, lovableKey);
    } catch (error) {
      console.error("Gateway image remix failed, trying Google directly", error);
      if (!googleKey) throw error;
    }
  }
  if (googleKey) return renderWithGoogle(prompt, sourceImageUrl, googleKey);
  throw new Error("No image generation provider configured.");
}

/* ------------------------------- persistence ------------------------------ */

type Row = Database["public"]["Tables"]["image_remixes"]["Row"];

async function signPath(admin: Client, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) {
    console.error("Could not sign remix image", path, error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

export async function storeCreative(
  admin: Client,
  input: {
    ownerId: string;
    companyId: string;
    imageKey: string;
    headline: string;
    caption: string;
    prompt: string;
    ocrText: string;
    rendered: RenderedCreative;
  },
): Promise<ImageRemixDTO> {
  const extension = input.rendered.contentType.includes("jpeg") ? "jpg" : "png";
  const path = `${input.ownerId}/${input.imageKey}-${Date.now()}.${extension}`;

  const upload = await admin.storage
    .from(BUCKET)
    .upload(path, input.rendered.bytes, { contentType: input.rendered.contentType, upsert: true });
  if (upload.error) throw new Error(upload.error.message);

  const { data, error } = await admin
    .from("image_remixes")
    .insert({
      owner_id: input.ownerId,
      company_id: input.companyId,
      image_key: input.imageKey,
      status: "ready",
      headline: input.headline,
      caption: input.caption,
      prompt: input.prompt,
      source_ocr_text: input.ocrText.slice(0, 4000),
      storage_path: path,
      provider: input.rendered.provider,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    ...toDTO(data),
    imageUrl: await signPath(admin, path),
  };
}

export async function storeFailure(
  admin: Client,
  input: {
    ownerId: string;
    companyId: string;
    imageKey: string;
    headline: string;
    prompt: string;
    message: string;
  },
): Promise<void> {
  await admin.from("image_remixes").insert({
    owner_id: input.ownerId,
    company_id: input.companyId,
    image_key: input.imageKey,
    status: "failed",
    headline: input.headline,
    prompt: input.prompt,
    error: input.message.slice(0, 500),
  });
}

function toDTO(row: Row): ImageRemixDTO {
  return {
    id: row.id,
    companyId: row.company_id,
    imageKey: row.image_key,
    status: row.status,
    headline: row.headline,
    caption: row.caption,
    prompt: row.prompt,
    sourceOcrText: row.source_ocr_text,
    imageUrl: null,
    sourceImageUrl: null,
    sourceUrl: null,
    provider: row.provider,
    error: row.error,
    createdAt: row.created_at,
  };
}

/** Owner-scoped gallery read with fresh signed URLs. */
export async function listImageRemixes(
  admin: Client,
  ownerId: string,
  options: { companyId?: string | undefined; limit?: number | undefined } = {},
): Promise<ImageRemixDTO[]> {
  let query = admin
    .from("image_remixes")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 40);
  if (options.companyId) query = query.eq("company_id", options.companyId);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = data ?? [];

  const keys = [...new Set(rows.map((row) => row.image_key))];
  const sources: Record<string, { imageUrl: string; sourceUrl: string }> = {};
  if (keys.length) {
    const { data: assets } = await admin
      .from("image_assets")
      .select("image_key, thumbnail_url, image_url, source_url")
      .in("image_key", keys);
    for (const asset of assets ?? []) {
      sources[asset.image_key] = {
        imageUrl: asset.thumbnail_url || asset.image_url,
        sourceUrl: asset.source_url,
      };
    }
  }

  return Promise.all(
    rows.map(async (row) => ({
      ...toDTO(row),
      imageUrl: await signPath(admin, row.storage_path),
      sourceImageUrl: sources[row.image_key]?.imageUrl ?? null,
      sourceUrl: sources[row.image_key]?.sourceUrl ?? null,
    })),
  );
}
