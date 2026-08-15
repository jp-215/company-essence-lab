export type PrescriptDTO = {
  /** Primary identifier key, e.g. VIRA-PS-042 — the join key between categories and prescripts. */
  prescriptKey: string;
  title: string;
  platform: string;
  format: string;
  angle: string;
  hook: string;
  rationale: string;
  script: string;
  cta: string;
  trendScore: number;
  relevanceRank: number;
};

export type RemixDTO = {
  id: string;
  companyId: string;
  prescriptKey: string;
  platform: string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  differentiator: string;
  createdAt: string;
};
