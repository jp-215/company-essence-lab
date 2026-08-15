/**
 * Terac — typed access to the review schema.
 *
 * The review tables (review_sessions, ad_videos, judges, session_judges,
 * video_votes, video_comments, feedback_syntheses) ALREADY EXIST in the live
 * database and are present in the generated types. What the generated types do
 * NOT yet have is:
 *
 *   * the columns added by 20260815210000_terac_review_system.sql
 *     (title, updated_at, media_status, media_provider, reminded_at, is_adhoc, engine)
 *   * public.terac_email_log
 *   * the terac_* SECURITY DEFINER functions
 *   * foreign-key metadata, without which embedded selects lose their types
 *
 * So the seven tables are re-declared here with their real shape plus those
 * columns, rather than intersected with the generated ones (an intersection
 * would also intersect Relationships and break embedded selects).
 *
 * Once Lovable regenerates src/integrations/supabase/types.ts after the
 * migration runs, this file can be deleted and `terac()` dropped — nothing
 * else depends on it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";

export type SessionStatus =
  | "generating"
  | "ready"
  | "sent"
  | "in_review"
  | "complete"
  | "synthesized"
  | "actioned"
  | "closed";

export type JudgeStatus = "invited" | "opened" | "submitted";

export type MediaStatus = "storyboard" | "queued" | "processing" | "ready" | "failed";

/**
 * postgrest-js resolves embedded selects (`*, judges(name)`) from this metadata,
 * so the foreign keys have to be declared or those queries lose their types.
 * Mirrors the shape the Supabase generator emits.
 */
type Rel = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

type Row<T, R extends readonly Rel[] = []> = {
  Row: T;
  Insert: Partial<T>;
  Update: Partial<T>;
  Relationships: R;
};

type FkTo<Col extends string, Table extends string> = {
  foreignKeyName: `fk_${Col}`;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Table;
  referencedColumns: ["id"];
};

export type ReviewSessionRow = {
  id: string;
  user_id: string;
  company_id: string;
  /** added by 20260815210000 */
  title: string;
  status: SessionStatus;
  public_token: string;
  quorum: number;
  deadline_at: string;
  reminded_at: string | null;
  created_at: string;
  /** added by 20260815210000 */
  updated_at: string;
  closed_at: string | null;
};

export type AdVideoRow = {
  id: string;
  session_id: string;
  playback_id: string | null;
  playback_url: string | null;
  thumbnail_url: string | null;
  concept_title: string;
  hook_text: string;
  generation_spec: Json;
  parent_video_id: string | null;
  version: number;
  display_order: number;
  remix_id: string | null;
  /** added by 20260815210000 */
  media_status: MediaStatus;
  /** added by 20260815210000 */
  media_provider: string | null;
  created_at: string;
};

export type JudgeRow = {
  id: string;
  owner_id: string;
  name: string;
  email: string;
  expertise_tags: string[];
  active: boolean;
  created_at: string;
};

export type SessionJudgeRow = {
  id: string;
  session_id: string;
  judge_id: string;
  invite_token: string;
  status: JudgeStatus;
  overall_note: string;
  /** Per-judge presentation order, persisted so a reopen does not reshuffle. */
  video_order: string[];
  opened_at: string | null;
  submitted_at: string | null;
  created_at: string;
  /** added by 20260815210000 */
  reminded_at: string | null;
  /** added by 20260815210000 */
  is_adhoc: boolean;
};

export type VideoVoteRow = {
  id: string;
  session_judge_id: string;
  video_id: string;
  is_pick: boolean;
  rank: number | null;
  created_at: string;
  /** added by 20260815210000 */
  updated_at: string;
};

export type VideoCommentRow = {
  id: string;
  session_judge_id: string;
  video_id: string;
  body: string;
  dimension_scores: Json;
  created_at: string;
  /** added by 20260815210000 */
  updated_at: string;
};

export type FeedbackSynthesisRow = {
  id: string;
  session_id: string;
  summary: string;
  consensus_themes: string[];
  revision_directives: Json;
  video_verdicts: Json;
  /** added by 20260815210000 */
  engine: string;
  created_at: string;
};

export type TeracEmailLogRow = {
  id: string;
  session_id: string | null;
  session_judge_id: string | null;
  kind: "invite" | "reminder" | "session_complete";
  to_email: string;
  subject: string;
  body: string;
  driver: string;
  provider_id: string | null;
  error: string | null;
  created_at: string;
};

type ReplacedTables =
  | "review_sessions"
  | "ad_videos"
  | "judges"
  | "session_judges"
  | "video_votes"
  | "video_comments"
  | "feedback_syntheses";

export type TeracDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<Database["public"]["Tables"], ReplacedTables> & {
      review_sessions: Row<ReviewSessionRow, [FkTo<"company_id", "companies">]>;
      ad_videos: Row<
        AdVideoRow,
        [FkTo<"session_id", "review_sessions">, FkTo<"remix_id", "company_remixes">]
      >;
      judges: Row<JudgeRow>;
      session_judges: Row<
        SessionJudgeRow,
        [FkTo<"session_id", "review_sessions">, FkTo<"judge_id", "judges">]
      >;
      video_votes: Row<
        VideoVoteRow,
        [FkTo<"session_judge_id", "session_judges">, FkTo<"video_id", "ad_videos">]
      >;
      video_comments: Row<
        VideoCommentRow,
        [FkTo<"session_judge_id", "session_judges">, FkTo<"video_id", "ad_videos">]
      >;
      feedback_syntheses: Row<FeedbackSynthesisRow, [FkTo<"session_id", "review_sessions">]>;
      terac_email_log: Row<
        TeracEmailLogRow,
        [FkTo<"session_id", "review_sessions">, FkTo<"session_judge_id", "session_judges">]
      >;
    };
    Functions: Database["public"]["Functions"] & {
      terac_open_session: { Args: { _token: string }; Returns: Json };
      terac_save_ballot: {
        Args: {
          _token: string;
          _video_id: string;
          _is_pick: boolean;
          _body: string;
          _dimension_scores: Json;
        };
        Returns: Json;
      };
      terac_submit_ballot: {
        Args: { _token: string; _ranks: Json; _overall_note: string };
        Returns: Json;
      };
      terac_claim_session: {
        Args: { _public_token: string; _name: string; _email: string };
        Returns: Json;
      };
      terac_advance_session: { Args: { _session_id: string; _to: string }; Returns: string };
      terac_maybe_complete: { Args: { _session_id: string }; Returns: string };
      terac_sweep_deadlines: { Args: Record<string, never>; Returns: number };
    };
  };
};

export type TeracClient = SupabaseClient<TeracDatabase>;

/** Applies the Terac table/function types to an existing client. */
export function terac(client: SupabaseClient<Database>): TeracClient {
  return client as unknown as TeracClient;
}
