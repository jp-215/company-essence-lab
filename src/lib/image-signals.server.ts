/**
 * Image Signals: one cached vision read per ImageBase asset that captures the
 * creative parameters a video model actually needs — sentiment, texture, colour,
 * composition and implied motion — alongside the copy roles inferred from OCR.
 *
 * Stored in public.image_signals keyed by image_key so re-selecting an asset in
 * Remix Studio never pays for a second analysis.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { fetchImageAsBase64, friendlyProviderError } from "./image-fetch.server";
import type {
  CopyRoles,
  ImageComposition,
  ImageMotion,
  ImageSentiment,
  ImageSignalDTO,
  ImageTexture,
  SignalQuality,
  SignalStatus,
} from "./brief-types";

type Client = SupabaseClient<Database>;

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const SIGNAL_MODEL = "google/gemini-3.5-flash";

const SIGNAL_SCHEMA = {
  name: "image_signal",
  description: "Creative read of an advertising still, used to brief a video model.",
  parameters: {
    type: "object",
    properties: {
      usable: { type: "boolean" },
      blockers: { type: "array", items: { type: "string" } },
      copy_roles: {
        type: "object",
        properties: {
          headline: { type: "string" },
          subhead: { type: "string" },
          price_or_offer: { type: "string" },
          cta: { type: "string" },
          brand_mentions: { type: "array", items: { type: "string" } },
          hashtags: { type: "array", items: { type: "string" } },
        },
        required: ["headline", "subhead", "price_or_offer", "cta", "brand_mentions", "hashtags"],
      },
      sentiment: {
        type: "object",
        properties: {
          tone: {
            type: "string",
            enum: ["playful", "premium", "urgent", "wholesome", "edgy", "informative"],
          },
          score: { type: "number" },
          emotion_tags: { type: "array", items: { type: "string" } },
          intent: {
            type: "string",
            enum: ["promo", "education", "testimonial", "meme", "ugc"],
          },
          urgency: { type: "number" },
        },
        required: ["tone", "score", "emotion_tags", "intent", "urgency"],
      },
      texture: {
        type: "object",
        properties: {
          palette: { type: "array", items: { type: "string" } },
          lighting: {
            type: "string",
            enum: ["soft", "hard", "golden-hour", "studio", "neon", "overcast"],
          },
          surface_texture: { type: "array", items: { type: "string" } },
          finish: { type: "string", enum: ["film", "digital-clean", "hdr", "retro-vhs"] },
          contrast: { type: "number" },
          saturation: { type: "number" },
          noise_level: { type: "number" },
        },
        required: [
          "palette",
          "lighting",
          "surface_texture",
          "finish",
          "contrast",
          "saturation",
          "noise_level",
        ],
      },
      composition: {
        type: "object",
        properties: {
          aspect_ratio: { type: "string" },
          subject: { type: "string" },
          framing: { type: "string", enum: ["macro", "close-up", "mid", "wide", "overhead"] },
          focal_depth: { type: "string" },
          text_placement: { type: "string", enum: ["top", "center", "bottom", "none"] },
          negative_space: { type: "number" },
        },
        required: [
          "aspect_ratio",
          "subject",
          "framing",
          "focal_depth",
          "text_placement",
          "negative_space",
        ],
      },
      motion: {
        type: "object",
        properties: {
          implied_motion: { type: "string" },
          suggested_camera: {
            type: "string",
            enum: ["push-in", "pull-out", "orbit", "handheld", "tripod-static", "whip-pan"],
          },
          suggested_beats: { type: "array", items: { type: "string" } },
        },
        required: ["implied_motion", "suggested_camera", "suggested_beats"],
      },
    },
    required: ["usable", "blockers", "copy_roles", "sentiment", "texture", "composition", "motion"],
  },
} as const;

/* --------------------------------- helpers -------------------------------- */

function clamp(value: unknown, min: number, max: number, fallback = 0): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Number(Math.min(max, Math.max(min, num)).toFixed(3));
}

function strings(value: unknown, limit = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function str(value: unknown, fallback = ""): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function hexes(value: unknown): string[] {
  return strings(value, 6).filter((item) => /^#?[0-9a-f]{3,8}$/i.test(item)).map((item) =>
    item.startsWith("#") ? item.toUpperCase() : `#${item.toUpperCase()}`,
  );
}

export type ParsedSignal = {
  usable: boolean;
  blockers: string[];
  copyRoles: CopyRoles;
  sentiment: ImageSentiment;
  texture: ImageTexture;
  composition: ImageComposition;
  motion: ImageMotion;
};

/** Coerces the model's JSON into the shape the brief composer relies on. */
export function normalizeSignal(raw: Record<string, unknown>): ParsedSignal {
  const copy = (raw["copy_roles"] ?? {}) as Record<string, unknown>;
  const sentiment = (raw["sentiment"] ?? {}) as Record<string, unknown>;
  const texture = (raw["texture"] ?? {}) as Record<string, unknown>;
  const composition = (raw["composition"] ?? {}) as Record<string, unknown>;
  const motion = (raw["motion"] ?? {}) as Record<string, unknown>;

  return {
    usable: raw["usable"] !== false,
    blockers: strings(raw["blockers"], 6),
    copyRoles: {
      headline: str(copy["headline"]).slice(0, 160),
      subhead: str(copy["subhead"]).slice(0, 240),
      priceOrOffer: str(copy["price_or_offer"]).slice(0, 80),
      cta: str(copy["cta"]).slice(0, 80),
      brandMentions: strings(copy["brand_mentions"], 6),
      hashtags: strings(copy["hashtags"], 10),
    },
    sentiment: {
      tone: str(sentiment["tone"], "informative"),
      score: clamp(sentiment["score"], -1, 1),
      emotionTags: strings(sentiment["emotion_tags"], 6),
      intent: str(sentiment["intent"], "promo"),
      urgency: clamp(sentiment["urgency"], 0, 1),
    },
    texture: {
      palette: hexes(texture["palette"]),
      lighting: str(texture["lighting"], "soft"),
      surfaceTexture: strings(texture["surface_texture"], 6),
      finish: str(texture["finish"], "digital-clean"),
      contrast: clamp(texture["contrast"], 0, 1, 0.5),
      saturation: clamp(texture["saturation"], 0, 1, 0.5),
      noiseLevel: clamp(texture["noise_level"], 0, 1),
    },
    composition: {
      aspectRatio: str(composition["aspect_ratio"], "1:1"),
      subject: str(composition["subject"], "product"),
      framing: str(composition["framing"], "mid"),
      focalDepth: str(composition["focal_depth"], "medium"),
      textPlacement: str(composition["text_placement"], "none"),
      negativeSpace: clamp(composition["negative_space"], 0, 1, 0.2),
    },
    motion: {
      impliedMotion: str(motion["implied_motion"], "static"),
      suggestedCamera: str(motion["suggested_camera"], "push-in"),
      suggestedBeats: strings(motion["suggested_beats"], 4),
    },
  };
}

/** Minimal signal used when the vision pass is unavailable (credits, provider outage). */
export function fallbackSignal(input: {
  ocrText: string;
  brandTone: string | null;
  brandPalette: string[];
}): ParsedSignal {
  const lines = input.ocrText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    usable: true,
    blockers: [],
    copyRoles: {
      headline: lines[0] ?? "",
      subhead: lines[1] ?? "",
      priceOrOffer: "",
      cta: lines.find((line) => /order|shop|tap|buy|try/i.test(line)) ?? "",
      brandMentions: [],
      hashtags: lines.filter((line) => line.startsWith("#")).slice(0, 6),
    },
    sentiment: {
      tone: input.brandTone ?? "informative",
      score: 0.2,
      emotionTags: [],
      intent: "promo",
      urgency: 0.2,
    },
    texture: {
      palette: input.brandPalette.slice(0, 4),
      lighting: "soft",
      surfaceTexture: [],
      finish: "digital-clean",
      contrast: 0.5,
      saturation: 0.5,
      noiseLevel: 0.1,
    },
    composition: {
      aspectRatio: "1:1",
      subject: "product",
      framing: "mid",
      focalDepth: "medium",
      textPlacement: lines.length ? "top" : "none",
      negativeSpace: 0.2,
    },
    motion: { impliedMotion: "static", suggestedCamera: "push-in", suggestedBeats: [] },
  };
}

/* -------------------------------- provider -------------------------------- */

/** One vision call per image; returns strict JSON via tool calling. */
export async function readImageSignal(input: {
  imageUrl: string;
  caption: string;
  ocrText: string;
}): Promise<ParsedSignal> {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  if (!lovableKey) throw new Error("No vision provider configured.");

  const { dataUrl } = await fetchImageAsBase64(input.imageUrl);

  const response = await fetch(AI_GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SIGNAL_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are a creative director reading a social advertising still so a video model can recreate its feel. Judge only what is visible. Palette values must be hex. Mark usable=false with blockers when the image is low-resolution, watermark-heavy, or dominated by another brand's marks.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                `Post caption: ${input.caption.slice(0, 600) || "(none)"}`,
                `On-image text (OCR): ${input.ocrText.slice(0, 600) || "(none)"}`,
                "Return the image_signal object.",
              ].join("\n"),
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      tools: [{ type: "function", function: SIGNAL_SCHEMA }],
      tool_choice: { type: "function", function: { name: SIGNAL_SCHEMA.name } },
    }),
  });

  if (!response.ok) {
    throw new Error(friendlyProviderError(response.status, await response.text()));
  }

  const payload = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
        tool_calls?: Array<{ function?: { arguments?: string } }>;
      };
    }>;
  };
  const args =
    payload.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ??
    payload.choices?.[0]?.message?.content ??
    "";
  const cleaned = args.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!cleaned) throw new Error("Vision model returned no signal.");

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    throw new Error("Vision model returned malformed signal JSON.");
  }
  return normalizeSignal(parsed);
}

/* ------------------------------ persistence ------------------------------- */

type SignalRow = Database["public"]["Tables"]["image_signals"]["Row"];

function toDTO(row: SignalRow): ImageSignalDTO {
  const parsed = normalizeSignal({
    usable: row.usable,
    blockers: row.blockers ?? [],
    copy_roles: row.copy_roles as Record<string, unknown>,
    sentiment: row.sentiment as Record<string, unknown>,
    texture: row.texture as Record<string, unknown>,
    composition: row.composition as Record<string, unknown>,
    motion: row.motion as Record<string, unknown>,
  });
  return {
    imageKey: row.image_key,
    model: row.model,
    status: row.status as SignalStatus,
    signalQuality: row.signal_quality as SignalQuality,
    usable: parsed.usable,
    blockers: parsed.blockers,
    copyRoles: parsed.copyRoles,
    sentiment: parsed.sentiment,
    texture: parsed.texture,
    composition: parsed.composition,
    motion: parsed.motion,
    analyzedAt: row.analyzed_at,
    error: row.error,
  };
}

/** camelCase → the snake_case jsonb we persist (and hand to the engine). */
function toStored(signal: ParsedSignal) {
  return {
    copy_roles: {
      headline: signal.copyRoles.headline,
      subhead: signal.copyRoles.subhead,
      price_or_offer: signal.copyRoles.priceOrOffer,
      cta: signal.copyRoles.cta,
      brand_mentions: signal.copyRoles.brandMentions,
      hashtags: signal.copyRoles.hashtags,
    },
    sentiment: {
      tone: signal.sentiment.tone,
      score: signal.sentiment.score,
      emotion_tags: signal.sentiment.emotionTags,
      intent: signal.sentiment.intent,
      urgency: signal.sentiment.urgency,
    },
    texture: {
      palette: signal.texture.palette,
      lighting: signal.texture.lighting,
      surface_texture: signal.texture.surfaceTexture,
      finish: signal.texture.finish,
      contrast: signal.texture.contrast,
      saturation: signal.texture.saturation,
      noise_level: signal.texture.noiseLevel,
    },
    composition: {
      aspect_ratio: signal.composition.aspectRatio,
      subject: signal.composition.subject,
      framing: signal.composition.framing,
      focal_depth: signal.composition.focalDepth,
      text_placement: signal.composition.textPlacement,
      negative_space: signal.composition.negativeSpace,
    },
    motion: {
      implied_motion: signal.motion.impliedMotion,
      suggested_camera: signal.motion.suggestedCamera,
      suggested_beats: signal.motion.suggestedBeats,
    },
  };
}

export async function getImageSignal(
  client: Client,
  imageKey: string,
): Promise<ImageSignalDTO | null> {
  const { data, error } = await client
    .from("image_signals")
    .select("*")
    .eq("image_key", imageKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toDTO(data) : null;
}

export async function saveImageSignal(
  admin: Client,
  imageKey: string,
  signal: ParsedSignal,
  options: { model: string; quality: SignalQuality },
): Promise<ImageSignalDTO> {
  const { data, error } = await admin
    .from("image_signals")
    .upsert(
      {
        image_key: imageKey,
        model: options.model,
        status: "done",
        signal_quality: options.quality,
        usable: signal.usable,
        blockers: signal.blockers,
        ...toStored(signal),
        error: null,
        analyzed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "image_key" },
    )
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toDTO(data);
}

export async function saveSignalFailure(admin: Client, imageKey: string, message: string) {
  await admin.from("image_signals").upsert(
    {
      image_key: imageKey,
      status: "failed",
      error: message.slice(0, 600),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "image_key" },
  );
}

/**
 * Returns the signal for an image, analysing it once and caching the result.
 * Never throws: a provider failure degrades to a low-quality fallback signal so
 * brief building keeps working.
 */
export async function ensureImageSignal(
  admin: Client,
  input: {
    imageKey: string;
    imageUrl: string;
    caption: string;
    ocrText: string;
    brandTone: string | null;
    brandPalette: string[];
    force?: boolean;
  },
): Promise<{ signal: ParsedSignal; quality: SignalQuality; error: string | null }> {
  if (!input.force) {
    const existing = await getImageSignal(admin, input.imageKey);
    if (existing && existing.status === "done") {
      return {
        signal: {
          usable: existing.usable,
          blockers: existing.blockers,
          copyRoles: existing.copyRoles,
          sentiment: existing.sentiment,
          texture: existing.texture,
          composition: existing.composition,
          motion: existing.motion,
        },
        quality: existing.signalQuality,
        error: null,
      };
    }
  }

  try {
    const parsed = await readImageSignal({
      imageUrl: input.imageUrl,
      caption: input.caption,
      ocrText: input.ocrText,
    });
    await saveImageSignal(admin, input.imageKey, parsed, {
      model: SIGNAL_MODEL,
      quality: "high",
    });
    return { signal: parsed, quality: "high", error: null };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Signal read failed";
    await saveSignalFailure(admin, input.imageKey, message);
    return {
      signal: fallbackSignal({
        ocrText: input.ocrText,
        brandTone: input.brandTone,
        brandPalette: input.brandPalette,
      }),
      quality: "low",
      error: message,
    };
  }
}
