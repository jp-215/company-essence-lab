/**
 * Terac — the founder-facing results view.
 *
 * Comments are grouped by THEME, not by judge. "Four judges all said the first
 * two seconds are weak" is a decision; "here is what Priya said, here is what
 * Marcus said" is a transcript.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import {
  DIMENSIONS,
  DIMENSION_LABELS,
  generationSpecSchema,
  revisionDirectivesSchema,
  type Dimension,
  type RevisionDirective,
} from "./spec";
import { tallySession, type BallotRow, type VideoTally } from "./tally";
import { loadBallots } from "./synthesis.server";
import { terac, type SessionStatus } from "./terac-db";

type Client = SupabaseClient<Database>;

export type ThemeGroup = {
  theme: string;
  dimension: Dimension | "general";
  comments: { judgeName: string; body: string; videoTitle: string }[];
};

export type RankedVideo = {
  id: string;
  conceptTitle: string;
  hookText: string;
  version: number;
  parentVideoId: string | null;
  playbackId: string | null;
  thumbnailUrl: string | null;
  mediaStatus: string;
  tally: VideoTally;
};

export type SessionResults = {
  id: string;
  title: string;
  status: SessionStatus;
  quorum: number;
  deadlineAt: string;
  submitted: number;
  invited: number;
  videos: RankedVideo[];
  themes: ThemeGroup[];
  synthesis: {
    summary: string;
    consensusThemes: string[];
    directives: RevisionDirective[];
    engine: string;
    createdAt: string;
  } | null;
};

/**
 * A comment's theme is the dimension that judge rated weak on that video. When
 * a judge flagged several, the comment lands under each — the same sentence
 * genuinely is evidence for more than one theme.
 */
function groupByTheme(ballots: BallotRow[], titles: Map<string, string>): ThemeGroup[] {
  const groups = new Map<Dimension | "general", ThemeGroup>();

  const ensure = (key: Dimension | "general"): ThemeGroup => {
    const existing = groups.get(key);
    if (existing) return existing;
    const created: ThemeGroup = {
      theme: key === "general" ? "General notes" : `${DIMENSION_LABELS[key]} concerns`,
      dimension: key,
      comments: [],
    };
    groups.set(key, created);
    return created;
  };

  for (const ballot of ballots) {
    const body = ballot.body.trim();
    if (!body) continue;

    const weak = DIMENSIONS.filter((d) => ballot.dimensionScores[d] === "weak");
    const entry = {
      judgeName: ballot.judgeName,
      body,
      videoTitle: titles.get(ballot.videoId) ?? "Concept",
    };

    if (weak.length === 0) {
      ensure("general").comments.push(entry);
      continue;
    }
    for (const dimension of weak) ensure(dimension).comments.push(entry);
  }

  return Array.from(groups.values()).sort((a, b) => b.comments.length - a.comments.length);
}

export async function loadSessionResults(
  base: Client,
  userId: string,
  sessionId: string,
): Promise<SessionResults> {
  const client = terac(base);

  const { data: session, error } = await client
    .from("review_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!session) throw new Error("Session not found.");

  const { data: videoRows } = await client
    .from("ad_videos")
    .select("*")
    .eq("session_id", sessionId)
    .order("display_order", { ascending: true })
    .order("version", { ascending: true });

  const { ballots } = await loadBallots(base, sessionId);
  const ids = (videoRows ?? []).map((v) => v.id);
  const tallies = tallySession(ids, ballots);
  const titles = new Map((videoRows ?? []).map((v) => [v.id, v.concept_title] as const));

  const videos: RankedVideo[] = tallies.map((tally) => {
    const row = (videoRows ?? []).find((v) => v.id === tally.videoId)!;
    return {
      id: row.id,
      conceptTitle: row.concept_title,
      hookText: row.hook_text,
      version: row.version,
      parentVideoId: row.parent_video_id,
      playbackId: row.playback_id,
      thumbnailUrl: row.thumbnail_url,
      mediaStatus: row.media_status,
      tally,
    };
  });

  const { data: assignments } = await client
    .from("session_judges")
    .select("status")
    .eq("session_id", sessionId);

  const { data: synthesisRow } = await client
    .from("feedback_syntheses")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const parsedDirectives = synthesisRow
    ? revisionDirectivesSchema.safeParse(synthesisRow.revision_directives)
    : null;

  return {
    id: session.id,
    title: session.title,
    status: session.status,
    quorum: session.quorum,
    deadlineAt: session.deadline_at,
    submitted: (assignments ?? []).filter((a) => a.status === "submitted").length,
    invited: assignments?.length ?? 0,
    videos,
    themes: groupByTheme(ballots, titles),
    synthesis: synthesisRow
      ? {
          summary: synthesisRow.summary,
          consensusThemes: synthesisRow.consensus_themes,
          directives: parsedDirectives?.success ? parsedDirectives.data : [],
          engine: synthesisRow.engine,
          createdAt: synthesisRow.created_at,
        }
      : null,
  };
}

/** Full spec for one video — powers the storyboard view and the diff preview. */
export async function loadVideoSpec(base: Client, userId: string, videoId: string) {
  const client = terac(base);
  const { data, error } = await client
    .from("ad_videos")
    .select("*, review_sessions!inner(user_id)")
    .eq("id", videoId)
    .single();
  if (error) throw new Error(error.message);
  if ((data.review_sessions as unknown as { user_id: string } | null)?.user_id !== userId) {
    throw new Error("Video not found.");
  }
  const parsed = generationSpecSchema.safeParse(data.generation_spec);
  return {
    id: data.id,
    conceptTitle: data.concept_title,
    version: data.version,
    spec: parsed.success ? parsed.data : null,
  };
}
