import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type {
  DimensionScores,
  PortalDraftDTO,
  PortalSessionDTO,
  PortalVideoDTO,
} from "./terac-types";
import { synthesizeSession } from "./terac-synthesis.server";

/**
 * Judges never authenticate. Every read and write below is scoped by an
 * unexpired invite_token: we resolve the token to exactly one session_judge row
 * and never widen the query beyond that row's session. A judge can therefore
 * never see another judge's votes or comments, before or after submitting.
 */

type TokenContext = {
  sessionJudgeId: string;
  sessionId: string;
  ownerId: string;
  judgeName: string;
  status: "invited" | "opened" | "submitted";
  videoOrder: string[];
  overallNote: string;
  deadlineAt: string;
  sessionStatus: string;
  companyId: string;
};

async function resolveToken(token: string): Promise<TokenContext> {
  const { data, error } = await supabaseAdmin
    .from("session_judges")
    .select(
      "id, session_id, status, video_order, overall_note, judges(name), review_sessions(id, user_id, company_id, status, deadline_at)",
    )
    .eq("invite_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("This review link is not valid.");

  const row = data as unknown as {
    id: string;
    session_id: string;
    status: string;
    video_order: string[] | null;
    overall_note: string;
    judges: { name: string } | null;
    review_sessions: {
      user_id: string;
      company_id: string;
      status: string;
      deadline_at: string;
    } | null;
  };
  if (!row.review_sessions) throw new Error("This review link is not valid.");

  return {
    sessionJudgeId: row.id,
    sessionId: row.session_id,
    ownerId: row.review_sessions.user_id,
    companyId: row.review_sessions.company_id,
    judgeName: row.judges?.name ?? "there",
    status: row.status === "submitted" ? "submitted" : row.status === "opened" ? "opened" : "invited",
    videoOrder: row.video_order ?? [],
    overallNote: row.overall_note ?? "",
    deadlineAt: row.review_sessions.deadline_at,
    sessionStatus: row.review_sessions.status,
  };
}

function isExpired(context: TokenContext): boolean {
  return (
    context.sessionStatus === "expired" || new Date(context.deadlineAt).getTime() < Date.now()
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export async function openReview(token: string): Promise<PortalSessionDTO> {
  const context = await resolveToken(token);

  const [companyRes, videosRes] = await Promise.all([
    supabaseAdmin.from("companies").select("name, bio, mission").eq("id", context.companyId).maybeSingle(),
    supabaseAdmin
      .from("ad_videos")
      .select("id, concept_title, hook_text, playback_url, thumbnail_url, generation_spec, display_order")
      .eq("session_id", context.sessionId)
      .order("display_order"),
  ]);

  const rows = (videosRes.data ?? []) as {
    id: string;
    concept_title: string;
    hook_text: string;
    playback_url: string | null;
    thumbnail_url: string | null;
    generation_spec: { script?: string } | null;
  }[];

  // Order is randomized once per judge, then persisted so reloads are stable.
  let order = context.videoOrder.filter((id) => rows.some((row) => row.id === id));
  const missing = rows.filter((row) => !order.includes(row.id)).map((row) => row.id);
  if (missing.length) order = [...order, ...shuffle(missing)];

  const videos: PortalVideoDTO[] = order.flatMap((id) => {
    const row = rows.find((item) => item.id === id);
    if (!row) return [];
    return [
      {
        id: row.id,
        conceptTitle: row.concept_title,
        hookText: row.hook_text,
        playbackUrl: row.playback_url,
        thumbnailUrl: row.thumbnail_url,
        script: row.generation_spec?.script ?? "",
      },
    ];
  });

  if (context.status === "invited" && !isExpired(context)) {
    await supabaseAdmin
      .from("session_judges")
      .update({ status: "opened", opened_at: new Date().toISOString(), video_order: order })
      .eq("id", context.sessionJudgeId);
  } else if (order.join(",") !== context.videoOrder.join(",")) {
    await supabaseAdmin
      .from("session_judges")
      .update({ video_order: order })
      .eq("id", context.sessionJudgeId);
  }

  const [votesRes, commentsRes] = await Promise.all([
    supabaseAdmin
      .from("video_votes")
      .select("video_id, is_pick")
      .eq("session_judge_id", context.sessionJudgeId),
    supabaseAdmin
      .from("video_comments")
      .select("video_id, body, dimension_scores")
      .eq("session_judge_id", context.sessionJudgeId),
  ]);

  const drafts: PortalDraftDTO[] = videos.map((video) => ({
    videoId: video.id,
    isPick: Boolean((votesRes.data ?? []).find((vote) => vote.video_id === video.id)?.is_pick),
    body: (commentsRes.data ?? []).find((c) => c.video_id === video.id)?.body ?? "",
    scores: ((commentsRes.data ?? []).find((c) => c.video_id === video.id)?.dimension_scores ??
      {}) as DimensionScores,
  }));

  return {
    judgeName: context.judgeName,
    brandName: companyRes.data?.name ?? "This brand",
    oneLiner: (companyRes.data?.bio ?? companyRes.data?.mission ?? "").split(/(?<=\.)\s/)[0] ?? "",
    status: context.status === "invited" && !isExpired(context) ? "opened" : context.status,
    deadlineAt: context.deadlineAt,
    expired: isExpired(context),
    estimatedMinutes: Math.max(1, Math.round(videos.length * 0.8)),
    videos,
    drafts,
    overallNote: context.overallNote,
  };
}

export async function saveJudgeFeedback(input: {
  token: string;
  videoId: string;
  isPick: boolean;
  body: string;
  scores: DimensionScores;
}) {
  const context = await resolveToken(input.token);
  if (context.status === "submitted") throw new Error("You have already submitted this review.");
  if (isExpired(context)) throw new Error("This review has closed.");

  const { count } = await supabaseAdmin
    .from("ad_videos")
    .select("id", { count: "exact", head: true })
    .eq("session_id", context.sessionId)
    .eq("id", input.videoId);
  if (!count) throw new Error("That video is not part of this review.");

  const [voteRes, commentRes] = await Promise.all([
    supabaseAdmin.from("video_votes").upsert(
      {
        session_judge_id: context.sessionJudgeId,
        video_id: input.videoId,
        is_pick: input.isPick,
      },
      { onConflict: "session_judge_id,video_id" },
    ),
    supabaseAdmin.from("video_comments").upsert(
      {
        session_judge_id: context.sessionJudgeId,
        video_id: input.videoId,
        body: input.body,
        dimension_scores: input.scores as never,
      },
      { onConflict: "session_judge_id,video_id" },
    ),
  ]);
  if (voteRes.error) throw new Error(voteRes.error.message);
  if (commentRes.error) throw new Error(commentRes.error.message);
  return { ok: true };
}

export async function submitReview(input: {
  token: string;
  rankedVideoIds: string[];
  overallNote: string;
}) {
  const context = await resolveToken(input.token);
  if (context.status === "submitted") return { ok: true, alreadySubmitted: true };
  if (isExpired(context)) throw new Error("This review has closed.");

  for (const [index, videoId] of input.rankedVideoIds.entries()) {
    await supabaseAdmin
      .from("video_votes")
      .upsert(
        {
          session_judge_id: context.sessionJudgeId,
          video_id: videoId,
          is_pick: true,
          rank: index + 1,
        },
        { onConflict: "session_judge_id,video_id" },
      );
  }

  const { error } = await supabaseAdmin
    .from("session_judges")
    .update({
      status: "submitted",
      submitted_at: new Date().toISOString(),
      overall_note: input.overallNote,
    })
    .eq("id", context.sessionJudgeId);
  if (error) throw new Error(error.message);

  // Closing the round is cheap; the LLM synthesis runs on the founder's side so a
  // judge never waits on it (and can't abort it by closing the tab).
  await maybeCompleteSession(context.sessionId, context.ownerId, { synthesize: false });
  return { ok: true, alreadySubmitted: false };
}

/** Session completes on quorum OR deadline, whichever comes first. */
export async function maybeCompleteSession(
  sessionId: string,
  ownerId: string,
  options: { synthesize?: boolean } = {},
) {
  const { data: session } = await supabaseAdmin
    .from("review_sessions")
    .select("id, status, quorum, deadline_at")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status !== "open") return { completed: false };

  const { count } = await supabaseAdmin
    .from("session_judges")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "submitted");

  const pastDeadline = new Date(session.deadline_at).getTime() < Date.now();
  const quorumMet = (count ?? 0) >= session.quorum;
  if (!quorumMet && !pastDeadline) return { completed: false };

  await supabaseAdmin
    .from("review_sessions")
    .update({ status: "complete", closed_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (options.synthesize !== false) {
    try {
      await synthesizeSession(supabaseAdmin, ownerId, sessionId);
    } catch (error) {
      // The founder can retry synthesis from the results screen.
      console.error("Terac synthesis failed:", error);
    }
  }
  return { completed: true };
}
