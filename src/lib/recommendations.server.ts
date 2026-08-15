import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { TrendDTO } from "./remix-types";
import { embedText } from "./knowledge.server";
import { listMappedTrends } from "./remix.server";

type Client = SupabaseClient<Database>;

export type RecommendedTrendDTO = TrendDTO & {
  similarity: number;
  /** semantic = pgvector match against the company profile; category = category_trends fallback. */
  matchType: "semantic" | "category";
};

/**
 * Content-based recommendations: trends ranked by cosine similarity between the
 * company profile embedding (or a query blended with it) and trend embeddings,
 * with virality as the secondary signal (blend lives in the SQL function).
 * Falls back to the category_trends join when embeddings are missing.
 */
export async function getRecommendedTrends(
  client: Client,
  companyId: string,
  options: { limit?: number | undefined; queryText?: string | undefined } = {},
): Promise<RecommendedTrendDTO[]> {
  const limit = options.limit ?? 8;

  let queryEmbedding: number[] | null = null;
  if (options.queryText?.trim()) {
    const { data: knowledge } = await client
      .from("company_knowledge")
      .select("content")
      .eq("company_id", companyId)
      .maybeSingle();
    queryEmbedding = await embedText(
      `${options.queryText.trim()}\n\nBrand context:\n${(knowledge?.content ?? "").slice(0, 4000)}`,
    );
  }

  const { data, error } = await client.rpc("recommend_company_trends", {
    _company_id: companyId,
    _limit: limit,
    ...(queryEmbedding ? { _query_embedding: JSON.stringify(queryEmbedding) } : {}),
  });
  if (error) throw new Error(error.message);

  const semantic: RecommendedTrendDTO[] = (data ?? []).map((row) => ({
    trendKey: row.trend_key,
    platform: row.platform,
    title: row.title,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    format: row.format,
    sourceUrl: row.source_url,
    author: row.author,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    engagementRate: Number(row.engagement_rate ?? 0),
    trendScore: Number(row.trend_score ?? 0),
    relevanceRank: 1,
    similarity: Number(row.similarity ?? 0),
    matchType: "semantic",
  }));

  if (semantic.length >= limit) return semantic.slice(0, limit);

  const seen = new Set(semantic.map((trend) => trend.trendKey));
  const fallback = await listMappedTrends(client, companyId, limit * 2);
  const topUp: RecommendedTrendDTO[] = fallback
    .filter((trend) => !seen.has(trend.trendKey))
    .slice(0, limit - semantic.length)
    .map((trend) => ({ ...trend, similarity: 0, matchType: "category" }));

  return [...semantic, ...topUp];
}

export async function getTrendByKey(client: Client, trendKey: string): Promise<TrendDTO | null> {
  const { data, error } = await client
    .from("trends")
    .select(
      "trend_key, platform, title, caption, hashtags, format, source_url, author, views, likes, engagement_rate, trend_score",
    )
    .eq("trend_key", trendKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    trendKey: data.trend_key,
    platform: data.platform,
    title: data.title,
    caption: data.caption,
    hashtags: data.hashtags ?? [],
    format: data.format,
    sourceUrl: data.source_url,
    author: data.author,
    views: Number(data.views ?? 0),
    likes: Number(data.likes ?? 0),
    engagementRate: Number(data.engagement_rate ?? 0),
    trendScore: Number(data.trend_score ?? 0),
    relevanceRank: 1,
  };
}

export type RecommendedChatterDTO = {
  womKey: string;
  platform: string;
  sourceUrl: string;
  author: string;
  authorHandle: string;
  title: string;
  content: string;
  topic: string;
  theme: string;
  sentiment: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  buzzScore: number;
};

/**
 * Word-of-mouth chatter mapped to the company's category, ranked by buzz.
 * Pairs with getRecommendedTrends so feeds mix short-form video and chatter.
 */
export async function getRecommendedChatter(
  client: Client,
  companyId: string,
  limit = 6,
): Promise<RecommendedChatterDTO[]> {
  const { data, error } = await client.rpc("company_word_of_mouth", {
    _company_id: companyId,
    _limit: limit,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    womKey: row.wom_key,
    platform: row.platform,
    sourceUrl: row.source_url,
    author: row.author,
    authorHandle: row.author_handle,
    title: row.title,
    content: row.content,
    topic: row.topic,
    theme: row.theme,
    sentiment: row.sentiment,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    replies: Number(row.replies ?? 0),
    reposts: Number(row.reposts ?? 0),
    buzzScore: Number(row.buzz_score ?? 0),
  }));
}
