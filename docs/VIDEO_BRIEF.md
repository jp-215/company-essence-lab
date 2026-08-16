# Image → Video Brief Contract

How Vira turns a founder's ImageBase selection into the payload vira-engine renders from.
Share this with the engine team: the JSON below is what `POST /v1/videos` now carries.

## Pipeline

```text
ImageBase asset ──> OCR (public.image_ocr)        ─┐
                └─> Image Signals (public.image_signals)  ├─> Brief composer ─> public.video_briefs
Brand record (companies) ──────────────────────────┘                │
Trend picks (trends) ──────────────────────────────────────────────┘
                                                                    v
                                          POST /v1/videos { product, brief, brief_id }
```

- `src/lib/ocr.server.ts` — literal on-image copy (Google Vision, Gemini fallback).
- `src/lib/image-signals.server.ts` — one cached vision read per asset: sentiment, texture,
  composition, implied motion, plus copy roles inferred from the OCR text. Cached by `image_key`,
  so re-selecting an asset costs nothing.
- `src/lib/brief.server.ts` — composes and persists the brief; weights references so the first
  pick leads (1, 1/2, 1/3 … normalised).
- `src/lib/brief-prose.ts` — flattens the brief into the `product` paragraph, the degradation path
  for an engine that only reads free text.

## Parameters extracted per image

| Group | Fields |
| --- | --- |
| copy_roles | headline, subhead, price_or_offer, cta, brand_mentions, hashtags |
| sentiment | tone (playful/premium/urgent/wholesome/edgy/informative), score −1..1, emotion_tags, intent (promo/education/testimonial/meme/ugc), urgency 0..1 |
| texture | palette (hex), lighting, surface_texture, finish (film/digital-clean/hdr/retro-vhs), contrast, saturation, noise_level |
| composition | aspect_ratio, subject, framing (macro→overhead), focal_depth, text_placement, negative_space |
| motion | implied_motion, suggested_camera (push-in/pull-out/orbit/handheld/tripod-static/whip-pan), suggested_beats |

`usable: false` + `blockers[]` rejects an asset (low resolution, watermark-heavy, foreign brand
marks); rejected picks appear in `brief.excluded` so the founder sees why.

## Payload shape

```json
{
  "company_slug": "acme-foods",
  "product": "<prose fallback of everything below>",
  "lane": "imagebase",
  "mode": "fast",
  "brief_id": "uuid",
  "brief": {
    "durationSeconds": 8,
    "aspectRatio": "9:16",
    "brand": { "name": "...", "bio": "...", "mission": "...", "category": "...",
               "toneGuardrails": [], "palette": ["#..."], "mustSay": [], "neverSay": [] },
    "references": [
      { "type": "image", "imageKey": "...", "weight": 0.55, "imageUrl": "...",
        "ocr": { "text": "", "headline": "", "cta": "", "confidence": 0.9 },
        "sentiment": {}, "texture": {}, "composition": {}, "motion": {},
        "keep": ["soft", "film", "macro", "push-in"],
        "avoid": ["visible watermarks", "third-party logos"] },
      { "type": "trend", "trendKey": "...", "platform": "tiktok", "hook": "...", "weight": 0.27 }
    ],
    "narrative": { "hook": "", "beats": [{ "t": 0, "shot": "", "onScreenText": "" }],
                   "voiceover": "", "cta": "", "textOverlayPolicy": "overlay-bottom" },
    "style": { "look": "", "palette": [], "pace": "steady|fast-cut", "musicMood": "", "captions": true },
    "constraints": { "noRealPeopleLikeness": true, "noCompetitorMarks": true,
                     "language": "en", "safetyNotes": [] },
    "excluded": [{ "imageKey": "...", "reason": "..." }],
    "signalQuality": "high|low"
  }
}
```

## Conflict and degradation rules

1. Brand guardrails beat the reference: `neverSay`, palette and tone from the brand record override
   anything read off the still.
2. Reference stills guide look and feel only — never frame-for-frame reproduction, and no logos or
   watermarks visible in them.
3. Missing OCR → copy roles fall back to caption lines; missing vision signal → a low-quality
   fallback signal is used and `signalQuality: "low"` is reported. Rendering never hard-fails on
   signal extraction.
4. Duration is clamped to 4/6/8 seconds; beats are spread evenly across it.

## Server functions

- `buildVideoBrief({ companyId, imageKeys, trendKeys, durationSeconds, aspectRatio, force })`
  composes and stores a brief for founder review; returns `{ briefId, brief }`.
- `startVideoRender({ ..., imageKeys, trendKeys })` composes the brief, renders with it, and records
  the engine job id on `public.video_briefs`.
