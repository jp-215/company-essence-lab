/**
 * Trend mapping protocol: company -> category (company.category_id) -> category_trends
 * -> trends, joined on trend_key (the trend primary identifier key).
 */
export type TrendDTO = {
  /** Primary identifier key, e.g. VIRA-TR-0421. */
  trendKey: string;
  platform: string;
  title: string;
  caption: string;
  hashtags: string[];
  format: string;
  sourceUrl: string;
  author: string;
  views: number;
  likes: number;
  engagementRate: number;
  trendScore: number;
  relevanceRank: number;
  /** Extra display metadata (present on newer read paths). */
  music?: string;
  comments?: number;
  shares?: number;
  postedAt?: string | null;
};

export type RemixDTO = {
  id: string;
  companyId: string;
  trendKey: string;
  trendTitle: string;
  sourceUrl: string;
  platform: string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  differentiator: string;
  createdAt: string;
};
