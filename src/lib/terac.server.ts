import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type {
  AdVideoDTO,
  DimensionScores,
  GenerationSpec,
  ReviewResultsDTO,
  ReviewSessionDTO,
  RevisionDirective,
  SessionJudgeDTO,
  SynthesisDTO,
  VideoResultDTO,
} from "./terac-types";
import { REVIEW_DIMENSIONS } from "./terac-types";

type Client = SupabaseClient<Database>;

/** URL-safe opaque token. Tokens are the only credential a judge ever holds. */
export function mintToken(prefix: string): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const body = Array.from(bytes)
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 32);
  return `${prefix}_${body}`;
}

export function toAdVideo(row: {
  id: string;
  session_id: string;
  remix_id: string | null;
  playback_id: string | null;
  playback_url: string | null;
  thumbnail_url: string | null;
  concept_title: string;
  hook_text: string;
  generation_spec: unknown;
  parent_video_id: string | null;
  version: number;
  display_order: number;
}): AdVideoDTO {
  return {
    id: row.id,
    sessionId: row.session_id,
    remixId: row.remix_id,
    playbackId: row.playback_id,
    playbackUrl: row.playback_url,
    thumbnailUrl: row.thumbnail_url,
    conceptTitle: row.concept_title,
    hookText: row.hook_text,
    generationSpec: (row.generation_spec ?? {}) as GenerationSpec,
    parentVideoId: row.parent_video_id,
    version: row.version,
    displayOrder: row.display_order,
  };
}

const VIDEO_SELECT =
  "id, session_id, remix_id, playback_id, playback_url, thumbnail_url, concept_title, hook_text, generation_spec, parent_video_id, version, display_order";

/* --------------------------------- judges --------------------------------- */

export async function listJudgeRoster(client: Client, userId: string) {
  const { data, error } = await client
    .from("judges")
    .select("id, name, email, expertise_tags, active")
    .eq("owner_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    expertiseTags: row.expertise_tags ?? [],
    active: row.active,
  }));
}

export async function upsertJudge(
  client: Client,
  userId: string,
  input: { name: string; email: string; expertiseTags: string[] },
) {
  const { data, error } = await client
    .from("judges")
    .upsert(
      {
        owner_id: userId,
        name: input.name,
        email: input.email.toLowerCase(),
        expertise_tags: input.expertiseTags,
        active: true,
      },
      { onConflict: "owner_id,email" },
    )
    .select("id, name, email, expertise_tags, active")
    .single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    name: data.name,
    email: data.email,
    expertiseTags: data.expertise_tags ?? [],
    active: data.active,
  };
}

/* -------------------------------- sessions -------------------------------- */

/**
 * One session per "Create ads" press, holding every concept generated in it.
 * Videos are seeded from remixes; playback fields stay null until the render
 * pipeline fills them in (see docs/TERAC.md — pipeline interface).
 */
export async function createReviewSession(
  client: Client,
  userId: string,
  input: {
    companyId: string;
    remixIds: string[];
    judgeIds: string[];
    quorum: number;
    deadlineHours: number;
  },
) {
  const { data: company, error: companyError } = await client
    .from("companies")
    .select("id, name")
    .eq("id", input.companyId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (companyError) throw new Error(companyError.message);
  if (!company) throw new Error("That product is not yours.");

  const { data: remixRows, error: remixError } = await client
    .from("company_remixes")
    .select("id, hook, script, caption, hashtags, differentiator, platform, trend_key, trend_title")
    .eq("company_id", input.companyId)
    .eq("owner_id", userId)
    .in("id", input.remixIds);
  if (remixError) throw new Error(remixError.message);
  if (!remixRows?.length) throw new Error("Pick at least one concept to review.");

  const deadline = new Date(Date.now() + input.deadlineHours * 3600_000).toISOString();
  const { data: session, error: sessionError } = await client
    .from("review_sessions")
    .insert({
      user_id: userId,
      company_id: input.companyId,
      public_token: mintToken("rs"),
      quorum: Math.max(1, Math.min(input.quorum, input.judgeIds.length || input.quorum)),
      deadline_at: deadline,
    })
    .select("id")
    .single();
  if (sessionError) throw new Error(sessionError.message);

  const videos = remixRows.map((remix, index) => ({
    session_id: session.id,
    remix_id: remix.id,
    concept_title: remix.trend_title || `Concept ${index + 1}`,
    hook_text: remix.hook,
    display_order: index + 1,
    generation_spec: {
      trendKey: remix.trend_key ?? "",
      hook: remix.hook,
      script: remix.script,
      caption: remix.caption,
      hashtags: remix.hashtags ?? [],
      differentiator: remix.differentiator,
      platform: remix.platform,
    } satisfies GenerationSpec as never,
  }));
  const { error: videoError } = await client.from("ad_videos").insert(videos);
  if (videoError) throw new Error(videoError.message);

  if (input.judgeIds.length) {
    const { error: inviteError } = await client.from("session_judges").insert(
      input.judgeIds.map((judgeId) => ({
        session_id: session.id,
        judge_id: judgeId,
        invite_token: mintToken("tj"),
      })),
    );
    if (inviteError) throw new Error(inviteError.message);
  }

  return { sessionId: session.id };
}

const SESSION_SELECT =
  "id, company_id, status, public_token, quorum, deadline_at, created_at, closed_at, companies(name)";

type SessionRow = {
  id: string;
  company_id: string;
  status: string;
  public_token: string;
  quorum: number;
  deadline_at: string;
  created_at: string;
  closed_at: string | null;
  companies: { name: string } | null;
};

function toSession(row: SessionRow, videoCount: number, submittedCount: number): ReviewSessionDTO {
  const status =
    row.status === "complete" ? "complete" : row.status === "expired" ? "expired" : "open";
  return {
    id: row.id,
    companyId: row.company_id,
    companyName: row.companies?.name ?? "Your product",
    status,
    publicToken: row.public_token,
    quorum: row.quorum,
    deadlineAt: row.deadline_at,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    videoCount,
    submittedCount,
  };
}

export async function listReviewSessions(
  client: Client,
  userId: string,
): Promise<ReviewSessionDTO[]> {
  const { data, error } = await client
    .from("review_sessions")
    .select(SESSION_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as unknown as SessionRow[];
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [{ data: videoRows }, { data: judgeRows }] = await Promise.all([
    client.from("ad_videos").select("id, session_id").in("session_id", ids),
    client.from("session_judges").select("id, session_id, status").in("session_id", ids),
  ]);

  return rows.map((row) =>
    toSession(
      row,
      (videoRows ?? []).filter((video) => video.session_id === row.id).length,
      (judgeRows ?? []).filter((j) => j.session_id === row.id && j.status === "submitted").length,
    ),
  );
}

/* -------------------------------- results --------------------------------- */

export async function getReviewResults(
  client: Client,
  userId: string,
  sessionId: string,
): Promise<ReviewResultsDTO> {
  const { data: sessionData, error: sessionError } = await client
    .from("review_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (sessionError) throw new Error(sessionError.message);
  if (!sessionData) throw new Error("Review session not found.");
  const sessionRow = sessionData as unknown as SessionRow;

  const [videosRes, judgesRes, synthesisRes] = await Promise.all([
    client.from("ad_videos").select(VIDEO_SELECT).eq("session_id", sessionId).order("display_order"),
    client
      .from("session_judges")
      .select(
        "id, judge_id, invite_token, status, opened_at, submitted_at, judges(name, email, expertise_tags)",
      )
      .eq("session_id", sessionId),
    client
      .from("feedback_syntheses")
      .select("summary, consensus_themes, video_verdicts, revision_directives, created_at")
      .eq("session_id", sessionId)
      .maybeSingle(),
  ]);
  if (videosRes.error) throw new Error(videosRes.error.message);
  if (judgesRes.error) throw new Error(judgesRes.error.message);

  const videos = (videosRes.data ?? []).map(toAdVideo);
  const judgeRows = (judgesRes.data ?? []) as unknown as {
    id: string;
    judge_id: string;
    invite_token: string;
    status: string;
    opened_at: string | null;
    submitted_at: string | null;
    judges: { name: string; email: string; expertise_tags: string[] } | null;
  }[];

  const judges: SessionJudgeDTO[] = judgeRows.map((row) => ({
    id: row.id,
    judgeId: row.judge_id,
    name: row.judges?.name ?? "Judge",
    email: row.judges?.email ?? "",
    expertiseTags: row.judges?.expertise_tags ?? [],
    status: row.status === "submitted" ? "submitted" : row.status === "opened" ? "opened" : "invited",
    inviteToken: row.invite_token,
    openedAt: row.opened_at,
    submittedAt: row.submitted_at,
  }));

  const submittedIds = judges.filter((j) => j.status === "submitted").map((j) => j.id);
  const nameOf = new Map(judges.map((j) => [j.id, j.name]));

  // RLS already hides unsubmitted judges' input; the filter keeps intent explicit.
  const [votesRes, commentsRes] = submittedIds.length
    ? await Promise.all([
        client
          .from("video_votes")
          .select("session_judge_id, video_id, is_pick, rank")
          .in("session_judge_id", submittedIds),
        client
          .from("video_comments")
          .select("session_judge_id, video_id, body, dimension_scores")
          .in("session_judge_id", submittedIds),
      ])
    : [{ data: [] as never[] }, { data: [] as never[] }];

  const votes = (votesRes.data ?? []) as {
    session_judge_id: string;
    video_id: string;
    is_pick: boolean;
    rank: number | null;
  }[];
  const comments = (commentsRes.data ?? []) as {
    session_judge_id: string;
    video_id: string;
    body: string;
    dimension_scores: unknown;
  }[];

  const results: VideoResultDTO[] = videos.map((video) => {
    const videoVotes = votes.filter((vote) => vote.video_id === video.id);
    const ranks = videoVotes.map((vote) => vote.rank).filter((r): r is number => typeof r === "number");
    const videoComments = comments.filter((comment) => comment.video_id === video.id);

    const tally: VideoResultDTO["dimensionTally"] = {};
    for (const dimension of REVIEW_DIMENSIONS) {
      tally[dimension.key] = { weak: 0, okay: 0, strong: 0 };
    }
    for (const comment of videoComments) {
      const scores = (comment.dimension_scores ?? {}) as DimensionScores;
      for (const dimension of REVIEW_DIMENSIONS) {
        const value = scores[dimension.key];
        if (value) tally[dimension.key]![value] += 1;
      }
    }

    return {
      video,
      picks: videoVotes.filter((vote) => vote.is_pick).length,
      averageRank: ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : null,
      dimensionTally: tally,
      comments: videoComments
        .filter((comment) => comment.body.trim().length > 0)
        .map((comment) => ({
          judgeName: nameOf.get(comment.session_judge_id) ?? "Judge",
          body: comment.body,
          scores: (comment.dimension_scores ?? {}) as DimensionScores,
        })),
    };
  });

  results.sort(
    (a, b) => b.picks - a.picks || (a.averageRank ?? 99) - (b.averageRank ?? 99),
  );

  const synthesis: SynthesisDTO | null = synthesisRes.data
    ? {
        summary: synthesisRes.data.summary,
        consensusThemes: synthesisRes.data.consensus_themes ?? [],
        videoVerdicts: (synthesisRes.data.video_verdicts ?? []) as SynthesisDTO["videoVerdicts"],
        revisionDirectives: (synthesisRes.data.revision_directives ?? []) as RevisionDirective[],
        createdAt: synthesisRes.data.created_at,
      }
    : null;

  const themes = groupCommentsByTheme(
    synthesis?.consensusThemes ?? [],
    comments.map((comment) => ({
      judgeName: nameOf.get(comment.session_judge_id) ?? "Judge",
      body: comment.body,
      videoId: comment.video_id,
    })),
  );

  return {
    session: toSession(sessionRow, videos.length, submittedIds.length),
    judges,
    videos: results,
    themes,
    synthesis,
  };
}

/** Buckets notes under synthesis themes by keyword overlap; leftovers go to "Other notes". */
function groupCommentsByTheme(
  themes: string[],
  notes: { judgeName: string; body: string; videoId: string }[],
) {
  const populated = notes.filter((note) => note.body.trim().length > 0);
  const buckets = themes.map((theme) => ({ theme, notes: [] as typeof populated }));
  const other: typeof populated = [];

  const keywords = themes.map((theme) =>
    theme
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((word) => word.length > 4),
  );

  for (const note of populated) {
    const body = note.body.toLowerCase();
    const index = keywords.findIndex((words) => words.some((word) => body.includes(word)));
    if (index >= 0) buckets[index]!.notes.push(note);
    else other.push(note);
  }

  const result = buckets.filter((bucket) => bucket.notes.length > 0);
  if (other.length) result.push({ theme: "Other notes", notes: other });
  return result;
}

/* ------------------------------- regeneration ------------------------------ */

/**
 * Applies an approved revision as a DIFF against the video's existing
 * generation_spec — replace/adjust the named elements, keep everything else.
 * A new ad_videos row is written with parent_video_id set and version + 1, so
 * the lineage stays intact and the original spec remains the source of truth.
 */
export async function applyRevision(
  client: Client,
  userId: string,
  sessionId: string,
  videoId: string,
) {
  const { data: synthesisRow, error: synthesisError } = await client
    .from("feedback_syntheses")
    .select("revision_directives")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (synthesisError) throw new Error(synthesisError.message);
  const directives = (synthesisRow?.revision_directives ?? []) as RevisionDirective[];
  const directive = directives.find((item) => item.videoId === videoId);
  if (!directive) throw new Error("No proposed revision for that video.");

  const { data: videoRow, error: videoError } = await client
    .from("ad_videos")
    .select(VIDEO_SELECT)
    .eq("id", videoId)
    .eq("session_id", sessionId)
    .maybeSingle();
  if (videoError) throw new Error(videoError.message);
  if (!videoRow) throw new Error("Video not found.");
  const video = toAdVideo(videoRow);

  const nextSpec: GenerationSpec = { ...video.generationSpec, revisionOf: video.id };
  const applied: NonNullable<GenerationSpec["appliedChanges"]> = [];
  for (const change of directive.changes) {
    if (change.action === "keep" || !change.to) {
      applied.push({ element: change.element, action: "keep" });
      continue;
    }
    const key = change.element as keyof GenerationSpec;
    if (key === "hashtags" || key === "appliedChanges" || key === "revisionOf") continue;
    (nextSpec as Record<string, unknown>)[key] = change.to;
    applied.push({ element: change.element, action: change.action, to: change.to });
  }
  nextSpec.appliedChanges = applied;

  const { data: inserted, error: insertError } = await client
    .from("ad_videos")
    .insert({
      session_id: sessionId,
      remix_id: video.remixId,
      concept_title: video.conceptTitle,
      hook_text: typeof nextSpec.hook === "string" ? nextSpec.hook : video.hookText,
      generation_spec: nextSpec as never,
      parent_video_id: video.id,
      version: video.version + 1,
      display_order: video.displayOrder,
      // playback_id / playback_url stay null until the render pipeline fills them.
    })
    .select(VIDEO_SELECT)
    .single();
  if (insertError) throw new Error(insertError.message);

  await markDirective(client, sessionId, videoId, "approved", directives);
  return toAdVideo(inserted);
}

export async function markDirective(
  client: Client,
  sessionId: string,
  videoId: string,
  status: "approved" | "dismissed" | "proposed",
  known?: RevisionDirective[],
) {
  let directives = known;
  if (!directives) {
    const { data } = await client
      .from("feedback_syntheses")
      .select("revision_directives")
      .eq("session_id", sessionId)
      .maybeSingle();
    directives = (data?.revision_directives ?? []) as RevisionDirective[];
  }
  const next = directives.map((item) =>
    item.videoId === videoId ? { ...item, status } : item,
  );
  const { error } = await client
    .from("feedback_syntheses")
    .update({ revision_directives: next as never })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return next;
}

/** Edit a proposed directive before approving it (founder stays in control). */
export async function editDirective(
  client: Client,
  sessionId: string,
  videoId: string,
  changes: RevisionDirective["changes"],
) {
  const { data } = await client
    .from("feedback_syntheses")
    .select("revision_directives")
    .eq("session_id", sessionId)
    .maybeSingle();
  const directives = (data?.revision_directives ?? []) as RevisionDirective[];
  const next = directives.map((item) =>
    item.videoId === videoId ? { ...item, changes, status: "proposed" as const } : item,
  );
  const { error } = await client
    .from("feedback_syntheses")
    .update({ revision_directives: next as never })
    .eq("session_id", sessionId);
  if (error) throw new Error(error.message);
  return next;
}

/** Judges still in "invited" state past the halfway mark — reminder targets. */
export async function listReminderTargets(client: Client, userId: string, sessionId: string) {
  const results = await getReviewResults(client, userId, sessionId);
  const created = new Date(results.session.createdAt).getTime();
  const deadline = new Date(results.session.deadlineAt).getTime();
  const halfway = created + (deadline - created) / 2;
  const due = Date.now() >= halfway;
  return {
    due,
    judges: results.judges.filter((judge) => judge.status === "invited"),
  };
}
