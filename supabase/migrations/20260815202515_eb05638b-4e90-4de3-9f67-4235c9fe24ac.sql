-- Terac: human expert review layer between ad generation and delivery.

CREATE TABLE public.review_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'complete', 'expired')),
  public_token text NOT NULL UNIQUE,
  quorum integer NOT NULL DEFAULT 3 CHECK (quorum >= 1),
  deadline_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.review_sessions TO authenticated;
GRANT ALL ON public.review_sessions TO service_role;
ALTER TABLE public.review_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_sessions_owner_all ON public.review_sessions
FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX review_sessions_owner_idx ON public.review_sessions (user_id, created_at DESC);

CREATE TABLE public.ad_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.review_sessions(id) ON DELETE CASCADE,
  remix_id uuid REFERENCES public.company_remixes(id) ON DELETE SET NULL,
  playback_id text,
  playback_url text,
  thumbnail_url text,
  concept_title text NOT NULL DEFAULT '',
  hook_text text NOT NULL DEFAULT '',
  generation_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_video_id uuid REFERENCES public.ad_videos(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  display_order integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ad_videos TO authenticated;
GRANT ALL ON public.ad_videos TO service_role;
ALTER TABLE public.ad_videos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ad_videos_owner_all ON public.ad_videos
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.review_sessions s WHERE s.id = ad_videos.session_id AND s.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.review_sessions s WHERE s.id = ad_videos.session_id AND s.user_id = auth.uid()));
CREATE INDEX ad_videos_session_idx ON public.ad_videos (session_id, display_order);

CREATE TABLE public.judges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL,
  email text NOT NULL,
  expertise_tags text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, email)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.judges TO authenticated;
GRANT ALL ON public.judges TO service_role;
ALTER TABLE public.judges ENABLE ROW LEVEL SECURITY;
CREATE POLICY judges_owner_all ON public.judges
FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE TABLE public.session_judges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.review_sessions(id) ON DELETE CASCADE,
  judge_id uuid NOT NULL REFERENCES public.judges(id) ON DELETE CASCADE,
  invite_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited', 'opened', 'submitted')),
  video_order uuid[] NOT NULL DEFAULT '{}',
  overall_note text NOT NULL DEFAULT '',
  opened_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, judge_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_judges TO authenticated;
GRANT ALL ON public.session_judges TO service_role;
ALTER TABLE public.session_judges ENABLE ROW LEVEL SECURITY;
CREATE POLICY session_judges_owner_all ON public.session_judges
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.review_sessions s WHERE s.id = session_judges.session_id AND s.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.review_sessions s WHERE s.id = session_judges.session_id AND s.user_id = auth.uid()));
CREATE INDEX session_judges_session_idx ON public.session_judges (session_id);

CREATE TABLE public.video_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_judge_id uuid NOT NULL REFERENCES public.session_judges(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.ad_videos(id) ON DELETE CASCADE,
  is_pick boolean NOT NULL DEFAULT false,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_judge_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_votes TO authenticated;
GRANT ALL ON public.video_votes TO service_role;
ALTER TABLE public.video_votes ENABLE ROW LEVEL SECURITY;
-- Brands see votes only from judges who have submitted.
CREATE POLICY video_votes_owner_read_submitted ON public.video_votes
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.session_judges sj
  JOIN public.review_sessions s ON s.id = sj.session_id
  WHERE sj.id = video_votes.session_judge_id AND s.user_id = auth.uid() AND sj.status = 'submitted'
));

CREATE TABLE public.video_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_judge_id uuid NOT NULL REFERENCES public.session_judges(id) ON DELETE CASCADE,
  video_id uuid NOT NULL REFERENCES public.ad_videos(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  dimension_scores jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_judge_id, video_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_comments TO authenticated;
GRANT ALL ON public.video_comments TO service_role;
ALTER TABLE public.video_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY video_comments_owner_read_submitted ON public.video_comments
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.session_judges sj
  JOIN public.review_sessions s ON s.id = sj.session_id
  WHERE sj.id = video_comments.session_judge_id AND s.user_id = auth.uid() AND sj.status = 'submitted'
));

CREATE TABLE public.feedback_syntheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.review_sessions(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  consensus_themes text[] NOT NULL DEFAULT '{}',
  video_verdicts jsonb NOT NULL DEFAULT '[]'::jsonb,
  revision_directives jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_syntheses TO authenticated;
GRANT ALL ON public.feedback_syntheses TO service_role;
ALTER TABLE public.feedback_syntheses ENABLE ROW LEVEL SECURITY;
CREATE POLICY feedback_syntheses_owner_all ON public.feedback_syntheses
FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.review_sessions s WHERE s.id = feedback_syntheses.session_id AND s.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.review_sessions s WHERE s.id = feedback_syntheses.session_id AND s.user_id = auth.uid()));