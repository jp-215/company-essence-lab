/**
 * Terac — the human expert review layer between generation and delivery.
 * Client-safe types and constants shared by the brand app and the judge portal.
 */

export const REVIEW_DIMENSIONS = [
  { key: "hook_strength", label: "Hook strength" },
  { key: "pacing", label: "Pacing" },
  { key: "product_clarity", label: "Product clarity" },
  { key: "visual_quality", label: "Visual quality" },
  { key: "cta", label: "CTA" },
  { key: "brand_fit", label: "Brand fit" },
] as const;

export type DimensionKey = (typeof REVIEW_DIMENSIONS)[number]["key"];
export type DimensionScore = "weak" | "okay" | "strong";
export type DimensionScores = { [K in DimensionKey]?: DimensionScore | undefined };

export const DIMENSION_SCORES: DimensionScore[] = ["weak", "okay", "strong"];

/** One element of a video's generation spec — revisions are diffs against these. */
export type GenerationSpec = {
  trendKey?: string;
  hook?: string;
  script?: string;
  caption?: string;
  hashtags?: string[];
  differentiator?: string;
  platform?: string;
  /** Set once a revision has been applied, so lineage is readable. */
  revisionOf?: string;
  appliedChanges?: {
    element: string;
    action: "replace" | "adjust" | "keep";
    to?: string | undefined;
  }[];
};

export type AdVideoDTO = {
  id: string;
  sessionId: string;
  remixId: string | null;
  playbackId: string | null;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  conceptTitle: string;
  hookText: string;
  generationSpec: GenerationSpec;
  parentVideoId: string | null;
  version: number;
  displayOrder: number;
};

export type SessionJudgeDTO = {
  id: string;
  judgeId: string;
  name: string;
  email: string;
  expertiseTags: string[];
  status: "invited" | "opened" | "submitted";
  inviteToken: string;
  openedAt: string | null;
  submittedAt: string | null;
};

export type ReviewSessionDTO = {
  id: string;
  companyId: string;
  companyName: string;
  status: "open" | "complete" | "expired";
  publicToken: string;
  quorum: number;
  deadlineAt: string;
  createdAt: string;
  closedAt: string | null;
  videoCount: number;
  submittedCount: number;
};

export type VideoResultDTO = {
  video: AdVideoDTO;
  picks: number;
  averageRank: number | null;
  /** Aggregated dimension signal: share of judges rating each dimension weak/okay/strong. */
  dimensionTally: Record<string, { weak: number; okay: number; strong: number }>;
  comments: { judgeName: string; body: string; scores: DimensionScores }[];
};

export type RevisionDirective = {
  videoId: string;
  /** Plain-English rationale a founder can read in one breath. */
  rationale: string;
  changes: {
    element: string;
    action: "replace" | "adjust" | "keep";
    from?: string | undefined;
    to?: string | undefined;
  }[];
  status?: "proposed" | "approved" | "dismissed";
};

export type SynthesisDTO = {
  summary: string;
  consensusThemes: string[];
  videoVerdicts: { videoId: string; verdict: string; standing: "strong" | "mixed" | "weak" }[];
  revisionDirectives: RevisionDirective[];
  createdAt: string;
};

export type ReviewResultsDTO = {
  session: ReviewSessionDTO;
  judges: SessionJudgeDTO[];
  videos: VideoResultDTO[];
  /** Comments grouped by theme rather than by judge. */
  themes: { theme: string; notes: { judgeName: string; body: string; videoId: string }[] }[];
  synthesis: SynthesisDTO | null;
};

/* ---------------------------------- portal --------------------------------- */

export type PortalVideoDTO = {
  id: string;
  conceptTitle: string;
  hookText: string;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  script: string;
};

export type PortalDraftDTO = {
  videoId: string;
  isPick: boolean;
  body: string;
  scores: DimensionScores;
};

export type PortalSessionDTO = {
  judgeName: string;
  brandName: string;
  oneLiner: string;
  status: "invited" | "opened" | "submitted";
  deadlineAt: string;
  expired: boolean;
  estimatedMinutes: number;
  /** Randomized per judge and stable across reloads. */
  videos: PortalVideoDTO[];
  drafts: PortalDraftDTO[];
  overallNote: string;
};
