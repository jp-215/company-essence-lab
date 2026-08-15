/**
 * Terac — Flow C, part 1: synthesis.
 *
 * Runs over every vote and comment in a complete session and produces a
 * plain-English summary, consensus themes, and revision_directives.
 *
 * revision_directives are always a DIFF against each video's existing
 * generation_spec — which elements to replace, keep, or adjust — never a fresh
 * generation prompt. Anything the model emits is validated against the spec it
 * claims to revise, and ops naming paths outside the whitelist are dropped and
 * reported rather than applied.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import {
  applyDirectives,
  generationSpecSchema,
  revisionDirectivesSchema,
  type GenerationSpec,
  type RevisionDirective,
} from "./spec";
import {
  consensusThemes,
  tallySession,
  verdictFor,
  type BallotRow,
  type VideoTally,
} from "./tally";
import { terac } from "./terac-db";

type Client = SupabaseClient<Database>;

export type SynthesisResult = {
  summary: string;
  themes: string[];
  directives: RevisionDirective[];
  engine: "llm" | "deterministic";
  rejectedOps: { videoId: string; why: string }[];
};

// ---------------------------------------------------------------------------
// Ballot loading
// ---------------------------------------------------------------------------

export async function loadBallots(
  base: Client,
  sessionId: string,
): Promise<{
  ballots: BallotRow[];
  videos: { id: string; title: string; spec: GenerationSpec }[];
}> {
  const client = terac(base);

  const { data: videoRows, error: videoError } = await client
    .from("ad_videos")
    .select("id, concept_title, generation_spec, display_order")
    .eq("session_id", sessionId)
    .order("display_order", { ascending: true });
  if (videoError) throw new Error(videoError.message);

  const videos = (videoRows ?? []).map((row) => {
    const parsed = generationSpecSchema.safeParse(row.generation_spec);
    return {
      id: row.id,
      title: row.concept_title,
      // A spec that fails to parse is treated as empty rather than crashing the
      // whole synthesis — the video simply gets no structural directives.
      spec: parsed.success
        ? parsed.data
        : generationSpecSchema.parse({
            concept: {},
            hook: {},
            pacing: {},
            style: {},
            cta: {},
            brand: {},
          }),
    };
  });

  const { data: assignments } = await client
    .from("session_judges")
    .select("id, status, judges(name)")
    .eq("session_id", sessionId)
    .eq("status", "submitted");

  const sessionJudgeIds = (assignments ?? []).map((a) => a.id);
  if (sessionJudgeIds.length === 0) return { ballots: [], videos };

  const [{ data: votes }, { data: comments }] = await Promise.all([
    client.from("video_votes").select("*").in("session_judge_id", sessionJudgeIds),
    client.from("video_comments").select("*").in("session_judge_id", sessionJudgeIds),
  ]);

  const nameFor = (id: string) =>
    ((assignments ?? []).find((a) => a.id === id)?.judges as unknown as { name: string } | null)
      ?.name ?? "Judge";

  const keys = new Set<string>();
  for (const v of votes ?? []) keys.add(`${v.session_judge_id}|${v.video_id}`);
  for (const c of comments ?? []) keys.add(`${c.session_judge_id}|${c.video_id}`);

  const ballots: BallotRow[] = Array.from(keys).map((key) => {
    const [sessionJudgeId, videoId] = key.split("|") as [string, string];
    const vote = (votes ?? []).find(
      (v) => v.session_judge_id === sessionJudgeId && v.video_id === videoId,
    );
    const comment = (comments ?? []).find(
      (c) => c.session_judge_id === sessionJudgeId && c.video_id === videoId,
    );
    return {
      sessionJudgeId,
      judgeName: nameFor(sessionJudgeId),
      videoId,
      isPick: vote?.is_pick ?? false,
      rank: vote?.rank ?? null,
      body: comment?.body ?? "",
      dimensionScores: (comment?.dimension_scores ?? {}) as BallotRow["dimensionScores"],
    };
  });

  return { ballots, videos };
}

// ---------------------------------------------------------------------------
// Deterministic synthesis — always available, no API key required.
//
// Only emits ops with a defensible mechanical mapping. It never invents ad copy;
// where a fix needs writing (a new hook line), it emits a *direction* on
// /hook/delivery and leaves the copy to the founder or the LLM pass.
// ---------------------------------------------------------------------------

export function deterministicDirective(
  tally: VideoTally,
  all: VideoTally[],
  video: { id: string; title: string; spec: GenerationSpec },
): RevisionDirective {
  const weak = new Set(tally.dimensions.filter((d) => d.isConsensusWeak).map((d) => d.dimension));
  const verdict = verdictFor(tally, all);
  const ops: RevisionDirective["ops"] = [];

  if (weak.has("pacing")) {
    ops.push({
      op: "adjust",
      path: "/pacing/cut_rate",
      from: video.spec.pacing.cut_rate,
      to: video.spec.pacing.cut_rate === "fast" ? "medium" : "fast",
      reason: "Judges rated pacing weak",
    });
  }

  if (weak.has("hook_strength")) {
    ops.push({
      op: "replace",
      path: "/hook/delivery",
      value:
        "Open on the product already in frame and name the frustration inside the first 1.5 seconds.",
      reason: "Judges rated the hook weak",
    });
  }

  if (weak.has("product_clarity")) {
    const anchor = video.spec.shots[0]?.id ?? null;
    ops.push({
      op: "insert_shot",
      after: anchor,
      shot: {
        id: `clarity-${video.spec.shots.length + 1}`,
        start_s: 3,
        end_s: 6,
        purpose: "product clarity",
        direction:
          "Hold a clean, well-lit shot of the product with the label readable for a full two seconds.",
        vo: "",
        on_screen_text: "",
        b_roll: "",
      },
      reason: "Judges could not tell what the product was",
    });
  }

  if (weak.has("cta")) {
    ops.push({
      op: "adjust",
      path: "/cta/placement",
      from: video.spec.cta.placement,
      to: "mid+end",
      reason: "Judges rated the CTA weak — state it once mid-roll as well as at the end",
    });
  }

  // Explicit endorsement is provenance worth keeping: it tells the next
  // regeneration what not to touch.
  for (const dimension of tally.dimensions) {
    if (dimension.rated > 0 && dimension.score > 0.5 && dimension.dimension === "hook_strength") {
      ops.push({ op: "keep", path: "/hook/text", reason: "Panel rated the hook strong" });
    }
  }

  const quotes = tally.comments.slice(0, 3).map((c) => `${c.judgeName}: “${c.body}”`);
  const weakLabels = tally.dimensions.filter((d) => d.isConsensusWeak).map((d) => d.label);

  return {
    spec_version: 1,
    video_id: video.id,
    verdict,
    rationale: [
      `${tally.picks} pick${tally.picks === 1 ? "" : "s"}, ${tally.rankPoints} rank point${tally.rankPoints === 1 ? "" : "s"}.`,
      weakLabels.length
        ? `Panel consensus: ${weakLabels.join(", ")} rated weak.`
        : "No dimension reached weak consensus.",
      ...quotes,
    ]
      .join(" ")
      .slice(0, 1200),
    ops,
  };
}

export function deterministicSummary(tallies: VideoTally[], titles: Map<string, string>): string {
  if (tallies.length === 0) return "No ballots were submitted before this session closed.";
  const winner = tallies[0]!;
  const lines = [
    `The panel put ${titles.get(winner.videoId) ?? "the top concept"} first with ${winner.picks} pick${winner.picks === 1 ? "" : "s"}.`,
  ];
  const weakest = tallies
    .flatMap((t) => t.dimensions.filter((d) => d.isConsensusWeak).map((d) => d.label))
    .filter((v, i, a) => a.indexOf(v) === i);
  if (weakest.length) {
    lines.push(`Across the set the recurring weakness is ${weakest.join(", ").toLowerCase()}.`);
  } else {
    lines.push("No single weakness reached consensus across the set.");
  }
  const bottom = tallies[tallies.length - 1]!;
  if (tallies.length > 1 && bottom.total === 0) {
    lines.push(`${titles.get(bottom.videoId) ?? "The last concept"} drew no support at all.`);
  }
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// LLM synthesis
// ---------------------------------------------------------------------------

const ALLOWED_PATHS = [
  "/concept/title",
  "/concept/angle",
  "/hook/text",
  "/hook/delivery",
  "/hook/on_screen_text",
  "/pacing/total_seconds",
  "/pacing/cut_rate",
  "/pacing/energy",
  "/style/tone",
  "/style/palette",
  "/style/typography",
  "/style/music",
  "/cta/text",
  "/cta/placement",
  "/shots/{shot_id}/purpose",
  "/shots/{shot_id}/direction",
  "/shots/{shot_id}/vo",
  "/shots/{shot_id}/on_screen_text",
  "/shots/{shot_id}/b_roll",
  "/shots/{shot_id}/start_s",
  "/shots/{shot_id}/end_s",
  "/shots/{shot_id}",
];

const SYSTEM_PROMPT = `You are Terac, the synthesis step of an expert ad review panel.

You receive: the generation_spec of each ad, and every judge's structured
dimension ratings plus optional free text. You return ONLY JSON:

{"summary": string (3-5 sentences, plain English, addressed to the founder),
 "consensus_themes": string[] (3-8 short phrases the panel agreed on),
 "directives": [
   {"video_id": string (uuid, exactly as given),
    "verdict": "keep" | "revise" | "cut",
    "rationale": string (2-3 sentences citing what judges actually said),
    "ops": [ ... ]}
 ]}

CRITICAL — ops are a DIFF against the spec you were given, never a new brief:
- "replace": {"op":"replace","path":"<path>","value":<string|number>,"reason":string}
- "adjust":  {"op":"adjust","path":"<path>","from":<value>,"to":<value>,"reason":string}
- "remove":  {"op":"remove","path":"/shots/<shot_id>","reason":string}
- "keep":    {"op":"keep","path":"<path>","reason":string}
- "insert_shot": {"op":"insert_shot","after":"<shot_id>"|null,"shot":{...},"reason":string}

Only these paths may be targeted:
${ALLOWED_PATHS.join("\n")}

Rules:
- Every shot_id you reference MUST already exist in that video's spec.
- Never target /brand/*, /spec_version, /concept/trend_key, /concept/platform
  or /concept/format. They are locked.
- Emit "keep" for elements judges explicitly praised — it tells the next pass
  what not to touch.
- Change only what the feedback justifies. An unjustified op is worse than none.`;

async function llmSynthesis(
  videos: { id: string; title: string; spec: GenerationSpec }[],
  tallies: VideoTally[],
): Promise<{ summary: string; themes: string[]; directives: unknown } | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;

  const userContent = videos
    .map((video) => {
      const tally = tallies.find((t) => t.videoId === video.id);
      return [
        `VIDEO ${video.id} — ${video.title}`,
        `spec: ${JSON.stringify(video.spec)}`,
        `picks: ${tally?.picks ?? 0}, rank points: ${tally?.rankPoints ?? 0}`,
        `dimensions: ${(tally?.dimensions ?? [])
          .map((d) => `${d.label} weak=${d.weak} okay=${d.okay} strong=${d.strong}`)
          .join("; ")}`,
        `comments: ${(tally?.comments ?? []).map((c) => `${c.judgeName}: ${c.body}`).join(" | ") || "none"}`,
      ].join("\n");
    })
    .join("\n---\n");

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!response.ok) {
      console.error(
        `[terac] synthesis gateway failed [${response.status}]: ${await response.text()}`,
      );
      return null;
    }

    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = (data.choices?.[0]?.message?.content ?? "")
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;

    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      summary?: string;
      consensus_themes?: string[];
      directives?: unknown;
    };
    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      themes: Array.isArray(parsed.consensus_themes)
        ? parsed.consensus_themes.filter((t): t is string => typeof t === "string")
        : [],
      directives: parsed.directives,
    };
  } catch (cause) {
    console.error(`[terac] synthesis failed: ${cause instanceof Error ? cause.message : cause}`);
    return null;
  }
}

// ---------------------------------------------------------------------------

export async function synthesiseSession(
  base: Client,
  userId: string,
  sessionId: string,
): Promise<SynthesisResult> {
  const client = terac(base);

  const { data: session, error } = await client
    .from("review_sessions")
    .select("id, status")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) throw new Error("Session not found.");
  if (session.status !== "complete" && session.status !== "synthesized") {
    throw new Error(`Session is ${session.status}; synthesis runs once a session is complete.`);
  }

  const { ballots, videos } = await loadBallots(base, sessionId);
  const tallies = tallySession(
    videos.map((v) => v.id),
    ballots,
  );
  const titles = new Map(videos.map((v) => [v.id, v.title] as const));

  const rejectedOps: SynthesisResult["rejectedOps"] = [];
  let directives: RevisionDirective[] = [];
  let summary = "";
  let themes: string[] = [];
  let engine: "llm" | "deterministic" = "deterministic";

  const llm = await llmSynthesis(videos, tallies);
  if (llm) {
    const parsed = revisionDirectivesSchema.safeParse(llm.directives);
    if (parsed.success) {
      // Keep only directives that name a video in this session, and drop any op
      // the diff engine refuses — verified against the real spec, not trusted.
      directives = parsed.data.filter((d) => videos.some((v) => v.id === d.video_id));
      for (const directive of directives) {
        const video = videos.find((v) => v.id === directive.video_id)!;
        const result = applyDirectives(video.spec, directive);
        for (const rejection of result.rejected) {
          rejectedOps.push({ videoId: directive.video_id, why: rejection.why });
        }
        directive.ops = result.applied;
      }
      summary = llm.summary;
      themes = llm.themes;
      engine = "llm";
    } else {
      console.warn("[terac] LLM directives failed validation, falling back to deterministic.");
    }
  }

  if (directives.length === 0) {
    directives = videos.map((video) => {
      const tally = tallies.find((t) => t.videoId === video.id);
      return deterministicDirective(
        tally ?? {
          videoId: video.id,
          picks: 0,
          rankPoints: 0,
          total: 0,
          comments: [],
          dimensions: [],
          weakest: null,
        },
        tallies,
        video,
      );
    });
    engine = "deterministic";
  }
  if (!summary) summary = deterministicSummary(tallies, titles);
  if (themes.length === 0) themes = consensusThemes(tallies);

  const { error: insertError } = await client.from("feedback_syntheses").insert({
    session_id: sessionId,
    summary,
    consensus_themes: themes,
    revision_directives: directives as unknown as never,
    engine,
  });
  if (insertError) throw new Error(insertError.message);

  if (session.status === "complete") {
    const { error: advanceError } = await client.rpc("terac_advance_session", {
      _session_id: sessionId,
      _to: "synthesized",
    });
    if (advanceError) throw new Error(advanceError.message);
  }

  return { summary, themes, directives, engine, rejectedOps };
}
