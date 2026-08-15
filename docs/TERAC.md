# Terac — expert review layer

Terac sits between generation (Vira remixes → videos) and delivery. A founder
sends a batch of concepts to a small expert panel, the panel reviews on their
phones without logging in, and Vira turns their signal into revisions the
founder approves before anything is regenerated.

## Tables

| Table | Purpose |
| --- | --- |
| `review_sessions` | One round per "send to judges" press. Holds `public_token`, `quorum`, `deadline_at`, `status` (`open`/`complete`/`expired`). |
| `ad_videos` | One row per concept under review. `generation_spec` is the source of truth; `parent_video_id` + `version` preserve revision lineage. |
| `judges` | Owner-scoped reviewer roster (`expertise_tags`, `active`). |
| `session_judges` | A judge's seat in one round: `invite_token`, `status` (`invited`/`opened`/`submitted`), per-judge randomized `video_order`, `overall_note`. |
| `video_votes` | Top picks and final ranks. |
| `video_comments` | Free text plus `dimension_scores` (the six quick ratings). |
| `feedback_syntheses` | `summary`, `consensus_themes`, `video_verdicts`, `revision_directives` (diffs). |

### Access model

- Brand side: every table is owner-scoped through `review_sessions.user_id`.
- `video_votes` / `video_comments` are readable by the brand **only for judges
  whose `status = 'submitted'`**, so nothing leaks mid-round.
- Judge portal: no login, no anon SELECT policies at all. The public server
  functions in `src/lib/terac-portal.functions.ts` resolve the invite token to
  exactly one `session_judges` row and never widen a query past that row's
  session. Expiry (`deadline_at`) is checked on every write. **Interface note:**
  the spec asked for token scoping expressed in RLS; Postgres RLS has no way to
  read a per-request token for the `anon` role without a custom JWT, so the
  scoping lives in server-side token resolution instead and `anon` has no grants.

## Flows

**A — Create ads (`/ads`).** Select concepts + judges → `startReviewSession`
creates one session, one `ad_videos` row per selected remix (spec copied from the
remix), and one `invite_token` per judge. Live per-judge status is on
`/reviews/$sessionId`.

**B — Judge portal (`/terac/r/$token`).** Landing (brand, one-liner, video count,
time estimate) → one video at a time, full-bleed, muted autoplay with
tap-to-unmute, swipe or arrow keys, sticky bar with top-pick toggle, expanding
comment field and the six weak/okay/strong dimensions → rank picks (drag or
arrow buttons) + one overall note → submit. Every change writes to the server
and to `localStorage`, so a closed tab loses nothing. Order is randomized per
judge and persisted. Vote counts are never shown.

**C — Synthesis and regeneration.** A round completes on quorum OR deadline,
whichever first (`maybeCompleteSession`), then an LLM pass writes the synthesis.
`revision_directives` are diffs — `{ element, action: replace|adjust|keep, from,
to }` — never fresh prompts. Approving one copies the existing
`generation_spec`, applies only the named changes, and inserts a new `ad_videos`
row with `parent_video_id` set and `version + 1`.

## Interfaces we had to assume

1. **Video pipeline.** Videos are rendered by Remotion and do not exist yet.
   `ad_videos.playback_id` / `playback_url` / `thumbnail_url` stay `NULL`; the
   portal falls back to the concept hook and script. To wire the renderer in,
   write those three columns per row — nothing else changes. No Mux or Cloudflare
   Stream account is connected, so there is no signed-URL minting yet; when one
   exists, sign at read time in `openReview` with expiry tied to `deadline_at`.
2. **Product = company.** The spec's `product_id` maps to `companies.id`, the
   existing product entity.
3. **Concepts = remixes.** `ad_videos` seeds from `company_remixes`, the existing
   generation output.
4. **Email.** No email provider is connected, so invites and reminders are
   copyable links on the round screen; `getReminderTargets` returns the judges
   still in `invited` state past the halfway mark, and founder-completion notice
   is the round screen itself.
