/**
 * Terac — Flow B server side: the judge portal.
 *
 * Every call here goes through a SECURITY DEFINER RPC that takes the invite
 * token and resolves its own scope. The anon key has no table grants on any
 * Terac table, so there is no path by which a judge reads a session their token
 * does not belong to, or another judge's ballot — before or after submitting.
 */
import { createPublicClient } from "../supabase-public.server";
import { dimensionScoresSchema, type DimensionScores } from "./spec";
import { terac } from "./terac-db";

export type PortalVideo = {
  id: string;
  concept_title: string;
  hook_text: string;
  playback_id: string | null;
  thumbnail_url: string | null;
  media_status: string;
  version: number;
  beats:
    { id: string; start_s: number; end_s: number; purpose: string; direction: string }[] | null;
  cta: { text: string; placement: string } | null;
  ballot: {
    is_pick: boolean;
    rank: number | null;
    body: string;
    dimension_scores: DimensionScores;
  };
};

export type PortalPayload = {
  session: {
    id: string;
    title: string;
    status: string;
    deadline_at: string;
    video_count: number;
  };
  brand: { name: string; bio: string; mission: string; logo_url: string | null; category: string };
  judge: {
    session_judge_id: string;
    name: string;
    status: string;
    overall_note: string;
    submitted_at: string | null;
  };
  videos: PortalVideo[];
};

function client() {
  return terac(createPublicClient());
}

export async function openSession(token: string): Promise<PortalPayload> {
  const { data, error } = await client().rpc("terac_open_session", { _token: token });
  if (error) throw new Error(error.message);
  return data as unknown as PortalPayload;
}

export async function saveBallot(input: {
  token: string;
  videoId: string;
  isPick: boolean;
  body: string;
  dimensionScores: DimensionScores;
}): Promise<void> {
  const scores = dimensionScoresSchema.parse(input.dimensionScores ?? {});
  const { error } = await client().rpc("terac_save_ballot", {
    _token: input.token,
    _video_id: input.videoId,
    _is_pick: input.isPick,
    _body: input.body,
    _dimension_scores: scores as unknown as never,
  });
  if (error) throw new Error(error.message);
}

export async function submitBallot(input: {
  token: string;
  ranks: { video_id: string; rank: number }[];
  overallNote: string;
}): Promise<{ submitted: boolean; session_status: string }> {
  const { data, error } = await client().rpc("terac_submit_ballot", {
    _token: input.token,
    _ranks: input.ranks as unknown as never,
    _overall_note: input.overallNote,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { submitted: boolean; session_status: string };
}

/** Bare session token with no judge token — mint one for an ad-hoc reviewer. */
export async function claimSession(input: {
  publicToken: string;
  name: string;
  email: string;
}): Promise<{ invite_token: string }> {
  const { data, error } = await client().rpc("terac_claim_session", {
    _public_token: input.publicToken,
    _name: input.name,
    _email: input.email,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { invite_token: string };
}
