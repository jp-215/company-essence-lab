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

/** Deterministic 0..1 noise so a given seed always produces the same shuffle. */
function seededNoise(seed: number, key: string): number {
  let hash = seed * 2654435761;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash ^ key.charCodeAt(i)) * 16777619;
    hash >>>= 0;
  }
  return (hash % 100000) / 100000;
}

/**
 * Rerank a scored candidate pool so the feed feels alive: score is blended with
 * seed-driven noise, then a per-author / per-format cap keeps one creator or one
 * format from swallowing the whole rail.
 */
function diversify<T>(
  candidates: T[],
  opts: {
    limit: number;
    seed: number;
    key: (item: T) => string;
    score: (item: T) => number;
    groups: (item: T) => string[];
    exploration?: number;
    perGroupCap?: number;
  },
): T[] {
  const exploration = opts.exploration ?? 0.45;
  const cap = opts.perGroupCap ?? 2;

  const ranked = [...candidates].sort((a, b) => {
    const aScore = opts.score(a) * (1 - exploration) + seededNoise(opts.seed, opts.key(a)) * exploration;
    const bScore = opts.score(b) * (1 - exploration) + seededNoise(opts.seed, opts.key(b)) * exploration;
    return bScore - aScore;
  });

  const counts = new Map<string, number>();
  const picked: T[] = [];
  const overflow: T[] = [];

  for (const item of ranked) {
    if (picked.length >= opts.limit) break;
    const groups = opts.groups(item).filter(Boolean);
    const blocked = groups.some((group) => (counts.get(group) ?? 0) >= cap);
    if (blocked) {
      overflow.push(item);
      continue;
    }
    groups.forEach((group) => counts.set(group, (counts.get(group) ?? 0) + 1));
    picked.push(item);
  }

  // Top up from the capped leftovers rather than returning a short rail.
  for (const item of overflow) {
    if (picked.length >= opts.limit) break;
    picked.push(item);
  }

  return picked;
}

/**
 * Content-based recommendations: trends ranked by cosine similarity between the
 * company profile embedding (or a query blended with it) and trend embeddings,
 * with virality as the secondary signal (blend lives in the SQL function).
 * Falls back to the category_trends join when embeddings are missing.
 *
 * A wider candidate pool is pulled than requested, then reranked with the seed
 * so repeat visits (or a shuffle) surface a genuinely different mix.
 */
export async function getRecommendedTrends(
  client: Client,
  companyId: string,
  options: { limit?: number | undefined; queryText?: string | undefined; seed?: number | undefined } = {},
): Promise<RecommendedTrendDTO[]> {
  const limit = options.limit ?? 8;
  const seed = options.seed ?? 1;
  const poolSize = Math.min(limit * 5, 60);


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
    _limit: poolSize,
    ...(queryEmbedding ? { _query_embedding: JSON.stringify(queryEmbedding) } : {}),
  });
  if (error) throw new Error(error.message);

  const pool: RecommendedTrendDTO[] = (data ?? []).map((row) => ({
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

  // Widen the pool with category matches so the shuffle has more room to move.
  const seen = new Set(pool.map((trend) => trend.trendKey));
  if (pool.length < poolSize) {
    const fallback = await listMappedTrends(client, companyId, poolSize);
    for (const trend of fallback) {
      if (seen.has(trend.trendKey)) continue;
      seen.add(trend.trendKey);
      pool.push({ ...trend, similarity: 0, matchType: "category" });
    }
  }

  const maxScore = Math.max(1, ...pool.map((t) => t.trendScore));
  return diversify(pool, {
    limit,
    seed,
    key: (trend) => trend.trendKey,
    // Semantic similarity leads; virality keeps merely-adjacent matches honest.
    score: (trend) =>
      (trend.matchType === "semantic" ? trend.similarity : 0.35) * 0.7 +
      (trend.trendScore / maxScore) * 0.3,
    groups: (trend) => [`author:${trend.author}`, `format:${trend.format}`],
  });
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
 * Word-of-mouth chatter mapped to the company's category, ranked by buzz then
 * reranked with the same seeded diversity pass (capped per topic and author) so
 * the chatter half of the feed rotates too.
 */
export async function getRecommendedChatter(
  client: Client,
  companyId: string,
  limit = 6,
  seed = 1,
): Promise<RecommendedChatterDTO[]> {
  const { data, error } = await client.rpc("company_word_of_mouth", {
    _company_id: companyId,
    _limit: Math.min(limit * 5, 60),
  });
  if (error) throw new Error(error.message);


  const pool: RecommendedChatterDTO[] = (data ?? []).map((row) => ({
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

  const maxBuzz = Math.max(1, ...pool.map((row) => row.buzzScore));
  return diversify(pool, {
    limit,
    seed,
    key: (row) => row.womKey,
    score: (row) => row.buzzScore / maxBuzz,
    groups: (row) => [`topic:${row.topic}`, `author:${row.authorHandle || row.author}`],
  });

}
