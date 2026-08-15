/**
 * Terac — Flow C, part 2: regeneration.
 *
 * The founder approves (or edits, or dismisses) a proposed revision before any
 * compute is spent. Approving replays the directive onto the ORIGINAL
 * generation_spec and writes a new ad_videos row with parent_video_id set and
 * version incremented, so the full lineage survives and only what changed needs
 * re-reviewing.
 *
 * No model is called here. The diffed spec *is* the recipe — that is what makes
 * v2 provably a descendant of v1 rather than a fresh generation that drifted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import {
  applyDirectives,
  describeDirective,
  generationSpecSchema,
  revisionDirectiveSchema,
  type GenerationSpec,
  type RevisionDirective,
} from "./spec";
import { createAsset } from "./video-provider.server";
import { terac } from "./terac-db";

type Client = SupabaseClient<Database>;

export type RegenerationPreview = {
  videoId: string;
  conceptTitle: string;
  verdict: RevisionDirective["verdict"];
  rationale: string;
  changes: string[];
  rejected: string[];
  willChange: boolean;
};

/** What the founder sees before approving. Runs the real diff, applies nothing. */
export async function previewRegeneration(
  base: Client,
  userId: string,
  directive: RevisionDirective,
): Promise<RegenerationPreview> {
  const { video, spec } = await loadOwnedVideo(base, userId, directive.video_id);
  const result = applyDirectives(spec, directive);

  return {
    videoId: video.id,
    conceptTitle: video.concept_title,
    verdict: directive.verdict,
    rationale: directive.rationale,
    changes: describeDirective({ ...directive, ops: result.applied }),
    rejected: result.rejected.map((r) => r.why),
    willChange: result.changed,
  };
}

export type RegenerationResult = {
  newVideoId: string;
  version: number;
  parentVideoId: string;
  applied: number;
  rejected: string[];
};

export async function regenerateVideo(
  base: Client,
  userId: string,
  input: { directive: unknown },
): Promise<RegenerationResult> {
  const client = terac(base);

  const directive = revisionDirectiveSchema.parse(input.directive);
  const { video, spec } = await loadOwnedVideo(base, userId, directive.video_id);

  const result = applyDirectives(spec, directive);
  if (!result.changed) {
    throw new Error(
      result.rejected.length
        ? `Nothing could be applied: ${result.rejected[0]?.why}`
        : "This revision would not change anything.",
    );
  }

  const nextSpec: GenerationSpec = result.spec;
  const asset = await createAsset(null);

  const { data: created, error } = await client
    .from("ad_videos")
    .insert({
      session_id: video.session_id,
      concept_title: nextSpec.concept.title || video.concept_title,
      hook_text: nextSpec.hook.text || video.hook_text,
      generation_spec: nextSpec as unknown as never,
      parent_video_id: video.id,
      version: video.version + 1,
      display_order: video.display_order,
      playback_id: asset.playbackId,
      thumbnail_url: asset.thumbnailUrl,
      media_status: asset.mediaStatus,
      media_provider: asset.provider,
      remix_id: video.remix_id,
    })
    .select("id, version")
    .single();
  if (error) throw new Error(error.message);

  // synthesized -> actioned. Ignored when the session is already actioned.
  const { data: session } = await client
    .from("review_sessions")
    .select("id, status")
    .eq("id", video.session_id)
    .maybeSingle();
  if (session?.status === "synthesized") {
    const { error: advanceError } = await client.rpc("terac_advance_session", {
      _session_id: video.session_id,
      _to: "actioned",
    });
    if (advanceError) throw new Error(advanceError.message);
  }

  return {
    newVideoId: created.id,
    version: created.version,
    parentVideoId: video.id,
    applied: result.applied.filter((op) => op.op !== "keep").length,
    rejected: result.rejected.map((r) => r.why),
  };
}

async function loadOwnedVideo(base: Client, userId: string, videoId: string) {
  const client = terac(base);

  const { data: video, error } = await client
    .from("ad_videos")
    .select("*, review_sessions!inner(user_id)")
    .eq("id", videoId)
    .single();
  if (error) throw new Error(error.message);

  const owner = (video.review_sessions as unknown as { user_id: string } | null)?.user_id;
  if (owner !== userId) throw new Error("Video not found.");

  const parsed = generationSpecSchema.safeParse(video.generation_spec);
  if (!parsed.success) {
    throw new Error("This video's generation spec is unreadable, so it cannot be revised safely.");
  }

  return { video, spec: parsed.data };
}

/** Version tree for one concept lineage, oldest first. */
export async function loadLineage(base: Client, userId: string, videoId: string) {
  const client = terac(base);
  const { video } = await loadOwnedVideo(base, userId, videoId);

  const { data: all } = await client
    .from("ad_videos")
    .select("id, parent_video_id, version, concept_title, hook_text, created_at")
    .eq("session_id", video.session_id);

  const chain: typeof all = [];
  let cursor = video.id;
  const byId = new Map((all ?? []).map((v) => [v.id, v] as const));

  while (cursor) {
    const node = byId.get(cursor);
    if (!node) break;
    chain.unshift(node);
    cursor = node.parent_video_id ?? "";
  }

  let tip = video.id;
  for (;;) {
    const child = (all ?? []).find((v) => v.parent_video_id === tip);
    if (!child) break;
    chain.push(child);
    tip = child.id;
  }

  return chain.filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
}
