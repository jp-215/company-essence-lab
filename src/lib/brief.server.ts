/**
 * Brief composer: turns a founder's selection (ImageBase stills + trends) plus
 * the brand record into the single Creative Brief payload vira-engine renders
 * from. Every selected image contributes OCR copy, sentiment, texture,
 * composition and motion hints; brand guardrails always win over the reference.
 *
 * Composed briefs are persisted in public.video_briefs so a render can be
 * replayed, audited or edited without recomputing vision signals.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import { getImageOcr } from "./ocr.server";
import { ensureImageSignal, type ParsedSignal } from "./image-signals.server";
import type {
  BriefBeat,
  BriefReference,
  CreativeBrief,
  PreparedBrief,
  SignalQuality,
} from "./brief-types";

type Client = SupabaseClient<Database>;

/** Vira's house palette; used when an asset yields no colour signal. */
const HOUSE_PALETTE = ["#FDF6EC", "#14213D", "#E4572E", "#2A9D8F"];

const NEVER_SAY = [
  "cure",
  "clinically proven",
  "guaranteed results",
  "FDA approved",
  "#1 in the world",
];

export type BriefInput = {
  companyId: string;
  ownerId: string;
  imageKeys: string[];
  trendKeys?: string[];
  lane?: string;
  mode?: string;
  durationSeconds?: number;
  aspectRatio?: string;
  force?: boolean;
};

type CompanyContext = {
  id: string;
  name: string;
  slug: string;
  bio: string;
  mission: string;
  category: string;
};

async function loadCompany(admin: Client, companyId: string, ownerId: string) {
  const { data, error } = await admin
    .from("companies")
    .select("id, name, slug, bio, mission, owner_id, categories(name)")
    .eq("id", companyId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.owner_id !== ownerId) throw new Error("Brand not found for this owner");
  const category = (data as { categories?: { name?: string } | null }).categories?.name;
  return {
    id: data.id,
    name: data.name,
    slug: data.slug,
    bio: data.bio ?? "",
    mission: data.mission ?? "",
    category: category ?? "Consumer products",
  } satisfies CompanyContext;
}

type AssetRow = {
  image_key: string;
  source_url: string;
  image_url: string;
  caption: string | null;
  hashtags: string[] | null;
  platform: string;
  buzz_score: number | null;
};

async function loadAssets(admin: Client, imageKeys: string[]): Promise<AssetRow[]> {
  if (!imageKeys.length) return [];
  const { data, error } = await admin
    .from("image_assets")
    .select("image_key, source_url, image_url, caption, hashtags, platform, buzz_score")
    .in("image_key", imageKeys);
  if (error) throw new Error(error.message);
  const byKey = new Map((data ?? []).map((row) => [row.image_key, row as AssetRow]));
  // Preserve the founder's selection order — the first pick leads the edit.
  return imageKeys.map((key) => byKey.get(key)).filter((row): row is AssetRow => Boolean(row));
}

async function loadTrends(admin: Client, trendKeys: string[]) {
  if (!trendKeys.length) return [];
  const { data, error } = await admin
    .from("trends")
    .select("trend_key, platform, title, caption, format, trend_score")
    .in("trend_key", trendKeys);
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Weights references so the lead pick dominates and later picks only tint. */
export function referenceWeights(count: number): number[] {
  if (count <= 0) return [];
  const raw = Array.from({ length: count }, (_, index) => 1 / (index + 1));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return raw.map((value) => Number((value / total).toFixed(3)));
}

/** Derives up to four narrative beats from the strongest reference's motion hints. */
export function buildBeats(input: {
  durationSeconds: number;
  lead: ParsedSignal | null;
  brandName: string;
  cta: string;
}): BriefBeat[] {
  const hints = input.lead?.motion.suggestedBeats ?? [];
  const shots = [
    hints[0] ?? `${input.lead?.composition.framing ?? "mid"} hero shot of the product in use`,
    hints[1] ?? "Texture detail with the signature colour in frame",
    hints[2] ?? "Human reaction moment, handheld",
    hints[3] ?? `End card on ${input.brandName}`,
  ];
  const overlays = [
    input.lead?.copyRoles.headline ?? "",
    input.lead?.copyRoles.subhead ?? "",
    input.lead?.copyRoles.priceOrOffer ?? "",
    input.cta,
  ];
  const step = Number((input.durationSeconds / shots.length).toFixed(2));
  return shots.map((shot, index) => ({
    t: Number((index * step).toFixed(2)),
    shot,
    onScreenText: overlays[index] ?? "",
  }));
}

function uniqueHexes(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).slice(0, 5);
}

/**
 * Builds the brief payload without persisting it. Pure enough to unit-test:
 * every provider call happens in ensureImageSignal upstream.
 */
export function composeBrief(input: {
  company: CompanyContext;
  durationSeconds: number;
  aspectRatio: string;
  references: BriefReference[];
  leadSignal: ParsedSignal | null;
  excluded: Array<{ imageKey: string; reason: string }>;
  quality: SignalQuality;
}): CreativeBrief {
  const { company, leadSignal } = input;
  const imageRefs = input.references.filter(
    (ref): ref is Extract<BriefReference, { type: "image" }> => ref.type === "image",
  );
  const palette = uniqueHexes([
    ...imageRefs.flatMap((ref) => ref.texture.palette),
    ...HOUSE_PALETTE,
  ]);
  const cta = leadSignal?.copyRoles.cta || `Try ${company.name}`;
  const hook =
    leadSignal?.copyRoles.headline ||
    imageRefs[0]?.ocr.headline ||
    `${company.name}: ${company.mission.slice(0, 80) || "made for the way you actually live"}`;

  return {
    briefId: null,
    durationSeconds: input.durationSeconds,
    aspectRatio: input.aspectRatio,
    brand: {
      name: company.name,
      slug: company.slug,
      bio: company.bio,
      mission: company.mission,
      category: company.category,
      toneGuardrails: Array.from(
        new Set([leadSignal?.sentiment.tone ?? "informative", "brand-safe", "no hard medical claims"]),
      ),
      palette: palette.slice(0, 4),
      mustSay: [company.name],
      neverSay: NEVER_SAY,
    },
    references: input.references,
    narrative: {
      hook,
      beats: buildBeats({
        durationSeconds: input.durationSeconds,
        lead: leadSignal,
        brandName: company.name,
        cta,
      }),
      voiceover: [hook, leadSignal?.copyRoles.subhead ?? "", cta].filter(Boolean).join(" "),
      cta,
      textOverlayPolicy:
        leadSignal?.composition.textPlacement === "none"
          ? "minimal-overlay"
          : `overlay-${leadSignal?.composition.textPlacement ?? "bottom"}`,
    },
    style: {
      look: [
        leadSignal?.texture.finish ?? "digital-clean",
        leadSignal?.texture.lighting ?? "soft",
        ...(leadSignal?.texture.surfaceTexture ?? []),
      ]
        .filter(Boolean)
        .join(", "),
      palette,
      pace: (leadSignal?.sentiment.urgency ?? 0.2) > 0.6 ? "fast-cut" : "steady",
      musicMood: leadSignal?.sentiment.emotionTags[0] ?? "upbeat",
      captions: true,
    },
    constraints: {
      noRealPeopleLikeness: true,
      noCompetitorMarks: true,
      language: "en",
      safetyNotes: [
        "Do not reproduce logos or watermarks visible in the reference stills.",
        "Reference stills guide look and feel only; never copy them frame-for-frame.",
      ],
    },
    excluded: input.excluded,
    signalQuality: input.quality,
  };
}

/**
 * Full pipeline: resolve the selection, ensure a cached signal per image,
 * compose the brief and persist it. Degrades to fallback signals rather than
 * failing the render.
 */
export async function prepareBrief(admin: Client, input: BriefInput): Promise<PreparedBrief> {
  const company = await loadCompany(admin, input.companyId, input.ownerId);
  const imageKeys = Array.from(new Set(input.imageKeys)).slice(0, 6);
  const trendKeys = Array.from(new Set(input.trendKeys ?? [])).slice(0, 6);

  const assets = await loadAssets(admin, imageKeys);
  const weights = referenceWeights(assets.length + trendKeys.length);

  const excluded: Array<{ imageKey: string; reason: string }> = [];
  for (const key of imageKeys) {
    if (!assets.some((asset) => asset.image_key === key)) {
      excluded.push({ imageKey: key, reason: "Asset no longer available in ImageBase" });
    }
  }

  const references: BriefReference[] = [];
  const signals: ParsedSignal[] = [];
  let quality: SignalQuality = "high";

  for (const [index, asset] of assets.entries()) {
    const ocr = await getImageOcr(admin, asset.image_key).catch(() => null);
    const ocrText = ocr?.status === "done" ? ocr.text : "";
    const { signal, quality: signalQuality } = await ensureImageSignal(admin, {
      imageKey: asset.image_key,
      imageUrl: asset.image_url,
      caption: asset.caption ?? "",
      ocrText,
      brandTone: null,
      brandPalette: HOUSE_PALETTE,
      ...(input.force === undefined ? {} : { force: input.force }),
    });
    if (signalQuality === "low") quality = "low";

    if (!signal.usable) {
      excluded.push({
        imageKey: asset.image_key,
        reason: signal.blockers[0] ?? "Reference rejected by creative review",
      });
      continue;
    }

    signals.push(signal);
    references.push({
      type: "image",
      imageKey: asset.image_key,
      sourceUrl: asset.source_url,
      imageUrl: asset.image_url,
      weight: weights[index] ?? 0.1,
      ocr: {
        text: ocrText,
        headline: signal.copyRoles.headline,
        cta: signal.copyRoles.cta,
        confidence: ocr?.confidence ?? 0,
      },
      sentiment: signal.sentiment,
      texture: signal.texture,
      composition: signal.composition,
      motion: signal.motion,
      keep: [
        signal.texture.lighting,
        signal.texture.finish,
        signal.composition.framing,
        signal.motion.suggestedCamera,
      ].filter(Boolean),
      avoid: ["visible watermarks", "third-party logos", "unreadable text density"],
    });
  }

  const trends = await loadTrends(admin, trendKeys);
  trends.forEach((trend, index) => {
    references.push({
      type: "trend",
      trendKey: trend.trend_key,
      platform: trend.platform,
      hook: trend.title ?? "",
      format: trend.format ?? "short-form",
      weight: weights[assets.length + index] ?? 0.1,
      whyItWorks: (trend.caption ?? "").slice(0, 240),
    });
  });

  const durationSeconds = [4, 6, 8].includes(input.durationSeconds ?? 8)
    ? (input.durationSeconds ?? 8)
    : 8;

  const brief = composeBrief({
    company,
    durationSeconds,
    aspectRatio: input.aspectRatio ?? "9:16",
    references,
    leadSignal: signals[0] ?? null,
    excluded,
    quality,
  });

  const { data, error } = await admin
    .from("video_briefs")
    .insert({
      company_id: company.id,
      owner_id: input.ownerId,
      image_keys: references
        .filter((ref) => ref.type === "image")
        .map((ref) => (ref as { imageKey: string }).imageKey),
      trend_keys: trendKeys,
      lane: input.lane ?? "imagebase",
      mode: input.mode ?? "image-to-video",
      duration_seconds: durationSeconds,
      aspect_ratio: brief.aspectRatio,
      status: "ready",
      brief: brief as unknown as NonNullable<
        Database["public"]["Tables"]["video_briefs"]["Insert"]["brief"]
      >,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  return { briefId: data.id, brief: { ...brief, briefId: data.id } };
}

/** Links a composed brief to the engine job it was rendered by. */
export async function attachBriefRender(
  admin: Client,
  briefId: string,
  render: { engineJobId?: string | null; engineVideoId?: string | null; error?: string | null },
) {
  await admin
    .from("video_briefs")
    .update({
      engine_job_id: render.engineJobId ?? null,
      engine_video_id: render.engineVideoId ?? null,
      error: render.error ?? null,
      status: render.error ? "failed" : "rendering",
      updated_at: new Date().toISOString(),
    })
    .eq("id", briefId);
}
