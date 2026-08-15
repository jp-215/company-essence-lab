import { createPublicClient } from "./supabase-public.server";
import type { TrendDTO } from "./remix-types";

export type PublicTrend = Omit<TrendDTO, "relevanceRank"> & { categoryName: string | null };

/** Public trending feed, optionally scoped to a category slug via category_trends. */
export async function fetchTrendingNow(input: {
  categorySlug?: string | undefined;
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
      "trend_key, platform, title, caption, hashtags, format, source_url, author, views, likes, engagement_rate, trend_score",
    )
    .order("trend_score", { ascending: false })
    .limit(limit);
  if (trendKeys) query = query.in("trend_key", trendKeys);

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
    categoryName,
  }));
}
