import type { CreativeBrief } from "./brief-types";

/**
 * Flattens a Creative Brief into the single product paragraph vira-engine's
 * existing /v1/videos contract understands. The structured `brief` object is
 * still sent alongside, so an engine that reads it wins — this string is the
 * degradation path for an engine that only knows `product`.
 */
export function briefToProse(brief: CreativeBrief): string {
  const imageRefs = brief.references.filter((ref) => ref.type === "image");
  const trendRefs = brief.references.filter((ref) => ref.type === "trend");

  const parts: string[] = [
    `${brief.brand.name} (${brief.brand.category}). ${brief.brand.bio}`.trim(),
    brief.brand.mission ? `Mission: ${brief.brand.mission}` : "",
    `Hook: ${brief.narrative.hook}`,
    `Beats: ${brief.narrative.beats
      .map((beat) => `${beat.t}s ${beat.shot}${beat.onScreenText ? ` — text "${beat.onScreenText}"` : ""}`)
      .join("; ")}`,
    `Voiceover: ${brief.narrative.voiceover}`,
    `Call to action: ${brief.narrative.cta}`,
    `Look: ${brief.style.look}. Palette ${brief.style.palette.join(", ")}. Pace ${brief.style.pace}. Music ${brief.style.musicMood}.`,
  ];

  imageRefs.forEach((ref, index) => {
    if (ref.type !== "image") return;
    parts.push(
      [
        `Reference still ${index + 1} (weight ${ref.weight}):`,
        `${ref.sentiment.tone} ${ref.sentiment.intent}`,
        `${ref.composition.framing} framing of ${ref.composition.subject}`,
        `${ref.texture.lighting} lighting, ${ref.texture.finish} finish`,
        ref.texture.surfaceTexture.length ? `textures ${ref.texture.surfaceTexture.join("/")}` : "",
        `camera ${ref.motion.suggestedCamera}`,
        ref.ocr.text ? `on-image copy "${ref.ocr.text.replace(/\s+/g, " ").slice(0, 160)}"` : "",
      ]
        .filter(Boolean)
        .join(", "),
    );
  });

  trendRefs.forEach((ref) => {
    if (ref.type !== "trend") return;
    parts.push(`Trend influence (${ref.platform}): ${ref.hook}. ${ref.whyItWorks}`.trim());
  });

  parts.push(
    `Constraints: no real-person likeness, no competitor marks, never claim ${brief.brand.neverSay.join(" / ")}.`,
  );

  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").slice(0, 4000);
}
