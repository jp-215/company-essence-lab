# Image → Video Brief Contract (OCR, sentiment, texture → vira-engine)

Goal: when a founder picks images (and trends) in Remix Studio, Vira sends the video agent a single rich **Creative Brief** instead of today's four thin fields (`company_slug`, `product`, `lane`, `mode`). This doc is the spec to hand your teammates on the engine side.

## 1. What we extract from each selected image

Every image gets an **Image Signal** record, built once and cached (so re-selecting the same asset is free).

| Group | Fields | Source |
| --- | --- | --- |
| Identity | `image_key`, `source` (instagram/tiktok/reddit), `permalink`, `posted_at`, `category` | already in `image_assets` |
| OCR | `ocr_text`, `text_lines[]`, `word_count`, `languages[]`, `confidence`, `has_text` | existing `image_ocr` table |
| Copy roles | `headline`, `subhead`, `price_or_offer`, `cta`, `brand_mentions[]`, `hashtags[]` | classifier pass over OCR lines |
| Sentiment | `tone` (playful, premium, urgent, wholesome, edgy, informative), `sentiment` (-1..1), `emotion_tags[]`, `intent` (promo, education, testimonial, meme, UGC), `urgency` (0..1) | vision+text pass |
| Texture / look | `palette[]` (hex + weight), `lighting` (soft, hard, golden-hour, studio, neon), `surface_texture[]` (matte, glossy, condensation, crumb, steam, grain), `finish` (film, digital-clean, HDR, retro-VHS), `contrast`, `saturation`, `noise_level` | vision pass |
| Composition | `aspect_ratio`, `subject` (product, person, hands, table-spread, storefront), `framing` (macro, close-up, mid, wide, overhead), `focal_depth`, `text_placement` (top/center/bottom/none), `negative_space` | vision pass |
| Motion hints | `implied_motion` (pour, sizzle, unbox, walk-in, static), `suggested_camera` (push-in, orbit, handheld, tripod-static), `suggested_beats[]` (3 shot ideas) | derived from the above |
| Performance | `engagement_score`, `like_count`, `similarity_to_brand` | existing feed/RAG data |
| Quality gates | `usable` (bool), `blockers[]` (watermark, competitor logo, low-res, unreadable text) | vision pass |

One vision call per image returns the sentiment + texture + composition + motion block as strict JSON; OCR stays a separate cached step so text extraction and interpretation can fail independently.

## 2. What Vira sends to the engine

`POST /v1/videos` gains an optional `brief` object (old fields stay valid, so nothing breaks):

```json
{
  "company_slug": "sunrise-bakery",
  "product": "Sourdough subscription",
  "lane": "founder-pov",
  "mode": "agentic",
  "brief": {
    "brief_id": "brf_01H...",
    "duration_seconds": 8,
    "aspect_ratio": "9:16",
    "brand": {
      "name": "Sunrise Bakery",
      "bio": "...", "mission": "...",
      "category": "consumer-products",
      "tone_guardrails": ["warm", "no hype-bro"],
      "palette": ["#F6EFE3", "#16233C"],
      "logo_url": "https://...",
      "must_say": ["fresh daily"], "never_say": ["cheap"]
    },
    "references": [
      {
        "type": "image",
        "image_key": "VIRA-IMG-IG-...",
        "signed_url": "https://... (6h)",
        "weight": 0.6,
        "ocr": { "text": "SOFT SERVE SEASON", "headline": "SOFT SERVE SEASON", "cta": "TAP TO ORDER", "confidence": 0.82 },
        "sentiment": { "tone": "playful", "score": 0.7, "emotion_tags": ["crave", "summer"], "intent": "promo", "urgency": 0.4 },
        "texture": { "palette": ["#F3D9B1"], "lighting": "golden-hour", "surface_texture": ["condensation", "glossy"], "finish": "film", "contrast": 0.6, "saturation": 0.75 },
        "composition": { "subject": "product", "framing": "macro", "text_placement": "top", "negative_space": 0.3 },
        "motion": { "implied_motion": "pour", "suggested_camera": "push-in" },
        "keep": ["condensation on the cup", "warm rim light"],
        "avoid": ["original brand watermark", "on-image phone number"]
      },
      { "type": "trend", "trend_key": "VIRA-TT-...", "weight": 0.4, "hook": "...", "format": "POV + text overlay", "why_it_works": "..." }
    ],
    "narrative": {
      "hook": "First line spoken in the opening 1.5s",
      "beats": [
        { "t": 0.0, "shot": "macro pour, condensation, golden light", "on_screen_text": "SOFT SERVE SEASON" },
        { "t": 3.0, "shot": "hands lifting the cup, push-in" },
        { "t": 6.0, "shot": "logo card on cream background", "on_screen_text": "Fresh daily" }
      ],
      "voiceover": "…", "cta": "Order today",
      "text_overlay_policy": "recreate copy in brand fonts, never copy source watermark"
    },
    "style": {
      "look": "film grain, golden-hour, shallow depth",
      "palette": ["#F6EFE3", "#16233C", "#F3D9B1"],
      "pace": "medium",
      "music_mood": "warm acoustic",
      "captions": true
    },
    "constraints": {
      "no_real_people_likeness": true,
      "no_competitor_marks": true,
      "language": "en",
      "safety_notes": ["no medical claims"]
    }
  }
}
```

Engine response is unchanged (`job_id` → poll `/v1/jobs/{id}`), plus we ask for `brief_id` echoed back on the job and video so we can trace which images produced which cut.

## 3. How the brief gets built

```text
picks (≤6 images + trends)
      │
      ├─ OCR cache hit? ── no ─→ scan image (Vision → Gemini fallback) → image_ocr
      │
      ├─ signal cache hit? ─ no ─→ one vision call → image_signals (sentiment/texture/composition/motion)
      │
      ├─ brand context (company, bio, mission, tone, palette, products)
      │
      └─ brief composer (LLM, strict JSON schema)
             → validate with Zod → store in video_briefs → POST /v1/videos with brief
```

Weights: each pick gets a normalized weight (default equal; user can nudge a "primary reference"). The composer must resolve conflicts by brand guardrails first, then the highest-weight reference.

## 4. Failure and degradation rules

- No OCR text → brief still valid; `narrative.on_screen_text` is written from brand copy.
- Vision signal fails → fall back to a minimal signal (palette from average color, tone from brand) and mark `signal_quality: "low"`.
- Unusable image (watermark-heavy, low-res) → excluded, user told which one and why, generation proceeds with the rest.
- AI credits exhausted / provider 403 → brief build stops before hitting the engine, with the plain-language message we already added, and picks stay selected for retry.
- Engine rejects `brief` (older deployment) → automatic retry with the legacy 4-field payload so video generation never hard-fails on a schema mismatch.

## 5. Technical work

- Migration: `public.image_signals` (image_key PK, jsonb sentiment/texture/composition/motion, model, status, error, timestamps) and `public.video_briefs` (brief_id, company_id, user_id, picks jsonb, brief jsonb, engine_job_id, status) — with GRANTs + owner-scoped RLS; signals readable by authenticated, briefs owner-only.
- `src/lib/image-signals.server.ts` — one vision call per image, strict JSON schema, cache read/write, byte-inlining via `fetchImageAsBase64` (Instagram CDN blocks provider crawls).
- `src/lib/brief.server.ts` — `buildCreativeBrief({ companyId, imageKeys, trendKeys, lane, duration, aspect })`, Zod-validated output, persistence.
- `src/lib/engine.server.ts` — extend `requestVideo` with optional `brief`, plus legacy-payload fallback on 400/422.
- `src/lib/video.functions.ts` — `prepareBrief` (returns the brief for review) and `startBriefedVideo`.
- UI: in Remix Studio, a "Review brief" step before Generate showing tone, palette chips, texture words, and the 3 beats, each editable; Video Studio shows which images fed the cut.
- Docs: `docs/VIDEO_BRIEF.md` — the JSON contract above, field-by-field, as the handoff artifact for the engine team.

## 6. Engine-side asks (for your teammates)

1. Accept and validate the `brief` object; ignore unknown fields rather than 400.
2. Use `references[].signed_url` as image conditioning (image-to-video) for the highest-weight image; treat others as style references only.
3. Honor `narrative.beats` timings and `style.palette`; never reproduce source watermarks or the source brand's text — recreate copy from `narrative.on_screen_text`.
4. Echo `brief_id` on job and video objects, and expose per-beat render notes in `/v1/jobs/{id}/events` so our progress UI can show which beat is rendering.
5. Confirm caps: max references, max signed-URL size, accepted aspect ratios and durations.
