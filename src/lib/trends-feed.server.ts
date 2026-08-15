import { createPublicClient } from "./supabase-public.server";
import type { TrendDTO } from "./remix-types";

export type PublicTrend = Omit<TrendDTO, "relevanceRank"> & { categoryName: string | null };

/** Public trending feed, optionally scoped to a category slug and/or hashtag. */
export async function fetchTrendingNow(input: {
  categorySlug?: string | undefined;
  hashtag?: string | undefined;
  limit?: number | undefined;
}): Promise<PublicTrend[]> {
  const client = createPublicClient();
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 60);

  let trendKeys: string[] | null = null;
  let categoryName: string | null = null;

  if (input.categorySlug) {
    const { data: category } = await client
      .from("categories")
      .select("id, name")
      .eq("slug", input.categorySlug)
      .maybeSingle();
    if (!category) return [];
    categoryName = category.name;

    const { data: mapped, error: mappedError } = await client
      .from("category_trends")
      .select("trend_key")
      .eq("category_id", category.id)
      .order("relevance_rank", { ascending: true })
      .limit(limit * 3);
    if (mappedError) throw new Error(mappedError.message);
    trendKeys = (mapped ?? []).map((row) => row.trend_key);
    if (!trendKeys.length) return [];
  }

  let query = client
    .from("trends")
    .select(
      "trend_key, platform, title, caption, hashtags, music, format, source_url, author, views, likes, comments, shares, engagement_rate, trend_score, posted_at",
    )
    .is("duplicate_of", null)
    .order("trend_score", { ascending: false })
    .limit(limit);
  if (trendKeys) query = query.in("trend_key", trendKeys);
  if (input.hashtag) query = query.contains("hashtags", [input.hashtag]);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
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
    music: row.music ?? "",
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    postedAt: row.posted_at ?? null,
    categoryName,
  }));
}

export type TrendingHashtag = { tag: string; uses: number };

/**
 * Top hashtags across the hottest canonical trends and chatter — powers the
 * "trending tags" chip rail. Aggregated in TS (a few hundred rows).
 */
export async function fetchTrendingHashtags(limit = 18): Promise<TrendingHashtag[]> {
  const client = createPublicClient();
  const [{ data: trendRows }, { data: womRows }] = await Promise.all([
    client
      .from("trends")
      .select("hashtags")
      .is("duplicate_of", null)
      .order("trend_score", { ascending: false })
      .limit(300),
    client
      .from("word_of_mouth")
      .select("hashtags")
      .is("duplicate_of", null)
      .order("buzz_score", { ascending: false })
      .limit(200),
  ]);

  const counts = new Map<string, number>();
  for (const row of [...(trendRows ?? []), ...(womRows ?? [])]) {
    for (const raw of row.hashtags ?? []) {
      const tag = raw.replace(/^#/, "").trim().toLowerCase();
      if (!tag || tag.length > 40) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .filter(([, uses]) => uses >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, uses]) => ({ tag, uses }));
}
