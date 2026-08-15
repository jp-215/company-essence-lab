# Terac — expert review layer for Vira

Terac is the human review loop between ad generation and ship. It lives **inside
this app** as a second route group sharing one database — not a separate
project, so feedback flows back to Vira automatically: it never left.

- Brand side (authenticated): `/reviews`, `/reviews/$id`, and the review panel on `/ads`
- Judge side (unauthenticated, token-gated): `/terac/r/{invite_token}`

Naming: **Terac** throughout. If it should be Terra, it is a rename in four
places: this file, `src/lib/terac/`, `src/components/terac/`, `src/routes/terac/`,
and the `terac_*` SQL identifiers.

---

## Read this first: the tables already existed

`review_sessions`, `ad_videos`, `judges`, `session_judges`, `video_votes`,
`video_comments` and `feedback_syntheses` were **already in the live database**
before this branch — they appear in `src/integrations/supabase/types.ts`, but no
migration in the repo creates them. They were made outside the migration history.

This branch therefore **creates none of them and drops nothing**. The migration
`20260815210000_terac_review_system.sql` is additive and idempotent, and safe to
re-run. It only:

- adds columns the app layer needs — `review_sessions.title/updated_at`,
  `ad_videos.media_status/media_provider`, `session_judges.reminded_at/is_adhoc`,
  `video_votes.updated_at`, `video_comments.updated_at`, `feedback_syntheses.engine`
- adds `public.terac_email_log`, the one genuinely new table
- adds the `terac_*` **SECURITY DEFINER** functions — the live schema had none,
  which is why the judge portal could not exist yet
- revokes `anon` access on all review tables

Where the existing schema and the original spec disagreed, **the existing schema
won**: `judges.owner_id` (not `created_by`), `ad_videos.remix_id` (not
`source_remix_id`). `session_judges.video_order` is a better design than the
computed shuffle I had, so `terac_open_session` populates and uses it.

---

## Status

| Piece | State |
|---|---|
| Migration (additive) | Written, **not yet applied** |
| Spec-diff regeneration | Done, 38 unit tests green |
| Judge portal | Done |
| Brand results + approval | Done |
| Session lifecycle, quorum, deadline | Done |
| Invite / reminder / completion email | Done behind an adapter (`log` driver by default) |
| Video delivery | Adapter written; **no render pipeline exists to feed it** |
| E2E suite | Written, skips until credentials + migration are present |

`npm run test` → 38/38 pass. `npm run test:e2e` after the migration lands.

---

## Three places the spec assumed something this codebase doesn't have

### 1. Vira does not generate video

`remixTrend()` in `src/lib/remix.server.ts` returns **text**: `hook`, `script`,
`caption`, `hashtags`, `differentiator`. There is no renderer, no Mux/Cloudflare
account. `ad_videos.playback_id` is nullable and unused today.

- `src/lib/terac/video-provider.server.ts` is an adapter — `TERAC_VIDEO_DRIVER`
  picks `storyboard` (default), `mux`, or `cloudflare`. The real drivers do
  signed HLS with adaptive bitrate and poster frames; they need a **source video
  URL to ingest**, which is the artefact Vira does not produce.
  `createAsset(null)` throws a named `MissingRenderError` at that seam.
- The judge portal renders a **storyboard** — hook at full weight, then the
  timestamped beats — when there is no `playback_id`. The entire loop runs on
  that today.
- **No raw MP4 is served anywhere.** When media exists it is HLS via `hls.js`,
  lazy-imported; Safari/iOS uses native HLS with no library.

> **Wire-up point:** whatever renders a video should call `createAsset(sourceUrl)`
> and write the returned `playbackId` / `mediaStatus` onto the `ad_videos` row.

### 2. No service-role key, so RLS alone can't gate the judge portal

`.env` has only the publishable key. Judge access goes through SECURITY DEFINER
functions that take the invite token and resolve their own scope:

```
terac_open_session(_token)     -- landing + review payload, marks opened
terac_save_ballot(...)         -- autosave one video's ballot
terac_submit_ballot(...)       -- ranks + lock + quorum check
terac_claim_session(...)       -- ad-hoc reviewer mints their own token
```

`anon` has **no table grants**. A judge cannot read a session their token doesn't
belong to, nor another judge's ballot — before or after submitting, because the
payload only ever contains their own.

### 3. No email provider

`src/lib/terac/mailer.server.ts`, selected by `TERAC_MAIL_DRIVER`:

- `log` (default) — renders the email into `public.terac_email_log` and console.
  Nothing sends. The invite link is recoverable from the log row, which is what
  lets the E2E walk the judge flow without a mailbox.
- `resend` — real delivery. Needs `RESEND_API_KEY` and `TERAC_MAIL_FROM`.

### Also

- **`LOVABLE_API_KEY` is unset.** A trend is a social post, not a script, so when
  `remixTrend` is unavailable the concept is **scaffolded** from the trend's
  mechanic and `aiUnavailable` is surfaced in the UI. Synthesis falls back to a
  deterministic pass. The loop completes either way.
- **Nothing schedules the sweeps.** `terac_sweep_deadlines()` and
  `sendDueReminders()` are idempotent and ready but need `pg_cron` or a ping:
  ```sql
  select cron.schedule('terac-sweep','*/10 * * * *','select public.terac_sweep_deadlines()');
  ```
- **Tokens are stored raw.** Hashing them would be a strict improvement.

---

## The two schemas that make the diff approach work

Pinned in `src/lib/terac/spec.ts` with zod, not left to convention.

### `generation_spec`

```jsonc
{
  "spec_version": 1,
  "concept": { "title", "angle", "platform", "format", "trend_key" },
  "hook":    { "text", "delivery", "on_screen_text" },
  "shots":   [ { "id": "s1", "start_s": 0, "end_s": 2,
                 "purpose", "direction", "vo", "on_screen_text", "b_roll" } ],
  "pacing":  { "total_seconds", "cut_rate": "slow|medium|fast",
               "energy": "calm|steady|high" },
  "style":   { "tone", "palette", "typography", "music" },
  "cta":     { "text", "placement" },
  "brand":   { "must_include": [], "must_avoid": [] }   // LOCKED
}
```

Built by `specFromRemix()`, which parses Vira's `"0-2s hook: …"` beats into shots.
Trends carry no CTA field, so the CTA is taken from the last sentence of the
remix caption rather than invented.

### `revision_directives`

A **diff**, never a fresh prompt:

```jsonc
{
  "spec_version": 1,
  "video_id": "<uuid>",
  "verdict": "keep" | "revise" | "cut",
  "rationale": "2-3 sentences citing what judges actually said",
  "ops": [
    { "op": "replace", "path": "/hook/text", "value": "…", "reason": "…" },
    { "op": "adjust",  "path": "/pacing/cut_rate", "from": "medium", "to": "fast", "reason": "…" },
    { "op": "remove",  "path": "/shots/s5", "reason": "…" },
    { "op": "keep",    "path": "/hook/text", "reason": "panel rated it strong" },
    { "op": "insert_shot", "after": "s1", "shot": { … }, "reason": "…" }
  ]
}
```

`applyDirectives(spec, directive)` replays it onto the **original** spec and:

- rejects paths outside a whitelist, and hard-locks `/brand/*`, `/spec_version`,
  `/concept/trend_key`, `/concept/platform`, `/concept/format`
- rejects unknown shot ids, duplicate ids, missing anchors, illegal enum values
- **returns** rejections instead of throwing, so one bad op doesn't discard the
  good ones — and the founder sees what was dropped
- never mutates its input, so v1 survives for the version tree
- re-validates and falls back to the original if the diff produced something invalid

`describeDirective()` renders it as plain English for approval. Nothing
regenerates until the founder clicks — that click is the drift guard.

---

## Lifecycle

```
generating → ready → sent → in_review → complete → synthesized → actioned → closed
```

Enforced in `terac_advance_session()`. `complete` fires on **quorum OR deadline,
whichever comes first**, so one slow judge cannot block a founder.

---

## Flows

**A — Create Ads** (`/ads`, via `CreateReviewPanel`): pick up to 6 trends → one
`review_session` containing all the concepts from that press → one `invite_token`
per judge → invite emails. One session per press regardless of count, so judges
vote comparatively. Live progress on `/reviews`.

**B — Judge portal** (`/terac/r/{token}`): no login ever. Mobile-first, dark,
near-zero chrome. Landing → one concept at a time, swipe or arrow keys, muted
autoplay with tap-to-unmute → sticky bar with Top pick, the six
weak/okay/strong dimensions, optional note → drag-rank the picks (with up/down
buttons, because HTML5 drag doesn't fire on touch) → overall note → submit.
Every change hits `localStorage` synchronously; the server save is debounced
behind it. Order is randomised per judge and **persisted in
`session_judges.video_order`**, so reopening never reshuffles. Vote counts are
never in the payload. Post-submit is final.

**C — Synthesis and regeneration** (`/reviews/$id`): summary, consensus themes,
ranked concepts, comments **grouped by theme rather than by judge**, and per weak
concept a plain-English proposed revision. Approve / edit / dismiss. Approving
writes a new `ad_videos` row with `parent_video_id` set and `version`
incremented — full lineage, so only what changed needs re-reviewing.

---

## Environment

Nothing below is required to run the loop; each unset variable degrades to a
documented fallback.

```sh
TERAC_PUBLIC_ORIGIN=https://your-app.lovable.app   # invite links; falls back to request origin

TERAC_VIDEO_DRIVER=storyboard    # storyboard | mux | cloudflare
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_SIGNING_KEY_ID=              # omit for public playback
CF_ACCOUNT_ID=
CF_STREAM_TOKEN=
VITE_TERAC_VIDEO_DRIVER=         # client-side, must match TERAC_VIDEO_DRIVER
VITE_CF_STREAM_DOMAIN=

TERAC_MAIL_DRIVER=log            # log | resend
RESEND_API_KEY=
TERAC_MAIL_FROM="Terac <terac@yourdomain.com>"

LOVABLE_API_KEY=                 # personalised concepts + LLM synthesis
```

---

## Testing

```sh
npm run test        # 38 unit tests, no DB, green today
npm run test:e2e    # full DB round-trip — skips loudly until it can run
```

**`tests/unit/`** covers the part that decides what a founder is told to change:
every guard rail on the diff engine (locked paths, unknown paths, phantom shots,
illegal enums, partial application, non-mutation, idempotency), the tally maths,
deterministic synthesis, and the full ballots-in → v2-spec-out loop asserting
identity survives the diff.

**`tests/e2e/terac-loop.test.ts`** walks the real thing: Create Ads → tokens
minted → invites logged → judge opens by token → per-judge stable ordering →
ballot saved → **another judge cannot see it** → anon has no direct table access
→ quorum fires `complete` while a third judge never responds → submitted ballot
locked → synthesis emits path-scoped ops → approve writes v2 with
`parent_video_id` and v1 untouched → expired deadline kills the token.

It needs the migration applied plus `TERAC_TEST_EMAIL` / `TERAC_TEST_PASSWORD`
for an account owning a company — a real sign-in, not a service-role key,
because service-role bypasses RLS and RLS is half of what the test is for.

```sh
TERAC_TEST_EMAIL=you@example.com TERAC_TEST_PASSWORD=… npm run test:e2e
```

It creates disposable judges and deletes them plus the session afterwards.

---

## Files

```
supabase/migrations/20260815210000_terac_review_system.sql   (additive only)

src/lib/terac/
  spec.ts                    generation_spec + revision_directives + applyDirectives  ← the drift guard
  tally.ts                   vote/dimension aggregation, consensus
  tokens.ts                  32-byte tokens, URL builders
  terac-db.ts                types for the review tables (delete once types.ts is regenerated)
  sessions.server.ts         Flow A, progress, reminders, completion notice
  portal.server.ts           Flow B over the definer RPCs
  synthesis.server.ts        Flow C part 1 — LLM pass + deterministic fallback
  regeneration.server.ts     Flow C part 2 — approve → v2, lineage
  results.server.ts          founder view, comments grouped by theme
  video-provider.server.ts   Mux / Cloudflare / storyboard adapter
  mailer.server.ts           Resend / log adapter
  terac.functions.ts         authenticated server fns
  portal.functions.ts        unauthenticated server fns

src/components/terac/        VideoStage, DimensionTaps, RankList, CreateReviewPanel
src/routes/terac/r/$token.tsx
src/routes/_authenticated/reviews.index.tsx
src/routes/_authenticated/reviews.$id.tsx

tests/unit/spec-diff.test.ts
tests/unit/review-loop.test.ts
tests/e2e/terac-loop.test.ts
```

Existing files touched, all additively:

- `src/routes/__root.tsx` — a chrome-free branch for `/terac/r/*`; the existing
  layout is unchanged below it
- `src/components/SiteHeader.tsx` — one nav link
- `src/routes/_authenticated/ads.tsx` — one import, one `<CreateReviewPanel />`
- `package.json` — test scripts, `hls.js`, `vitest`
- `.gitignore` — `.env` and `package-lock.json` (this project installs with bun)

`src/routes/_authenticated/remix.tsx` was **not** touched.
