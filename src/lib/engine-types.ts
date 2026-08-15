/** Types mirroring the vira-engine OpenAPI contract (https://vira.ideaplaces.com/docs). */

export type EngineLane = {
  name: string;
  brief: string;
  voice_note: string;
  look: string;
};

export type EngineScore = {
  total?: number | null;
  verdict?: string | null;
  notes?: string | null;
};

export type EngineVideo = {
  id: string;
  job_id?: string | null;
  company_slug: string;
  product: string;
  lane: string;
  mode: string;
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  duration_s: number;
  mp4_url: string;
  score?: EngineScore | null;
  disposition?: string | null;
  drop_reason?: string | null;
  created_at?: string | null;
};

export type EngineJobStatus = "queued" | "running" | "done" | "failed";

export type EngineJob = {
  job_id: string;
  status: EngineJobStatus;
  progress_note: string;
  video_id?: string | null;
  error?: string | null;
  company_slug?: string | null;
  lane?: string | null;
  mode?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type EngineJobAccepted = {
  job_id: string;
  status: EngineJobStatus;
  poll: string;
  estimated_seconds: number;
};

export type EngineEvent = {
  seq: number;
  ts: string;
  job_id: string;
  stage: string;
  message: string;
  level: string;
};

export type EngineCompany = {
  id?: string | null;
  slug: string;
  name: string;
  category: string;
  bio: string;
  mission: string;
  website?: string | null;
  video_count?: number | null;
};

export function engineScoreTotal(score?: EngineScore | null): number | null {
  return typeof score?.total === "number" ? score.total : null;
}
