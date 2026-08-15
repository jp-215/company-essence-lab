import { createPublicClient } from "./supabase-public.server";

export type PublicWom = {
  womKey: string;
  platform: string;
  sourceUrl: string;
  author: string;
  authorHandle: string;
  title: string;
  content: string;
  hashtags: string[];
  topic: string;
  theme: string;
  sentiment: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  engagementRate: number;
  buzzScore: number;
  postedAt: string | null;
  categoryName: string | null;
};

/** Public X/Twitter word-of-mouth feed, optionally scoped to a category slug. */
export async function fetchWordOfMouth(input: {
  categorySlug?: string | undefined;
  limit?: number | undefined;
}): Promise<PublicWom[]> {
  const client = createPublicClient();
  const limit = Math.min(Math.max(input.limit ?? 12, 1), 60);

  let womKeys: string[] | null = null;
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
      .from("category_word_of_mouth")
      .select("wom_key")
      .eq("category_id", category.id)
      .order("relevance_rank", { ascending: true })
      .limit(limit * 3);
    if (mappedError) throw new Error(mappedError.message);
    womKeys = (mapped ?? []).map((row) => row.wom_key);
    if (!womKeys.length) return [];
  }

  let query = client
    .from("word_of_mouth")
    .select(
      "wom_key, platform, source_url, author, author_handle, title, content, hashtags, topic, theme, sentiment, views, likes, replies, reposts, engagement_rate, buzz_score, posted_at",
    )
    .order("buzz_score", { ascending: false })
    .limit(limit);
  if (womKeys) query = query.in("wom_key", womKeys);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    womKey: row.wom_key,
    platform: row.platform,
    sourceUrl: row.source_url,
    author: row.author,
    authorHandle: row.author_handle,
    title: row.title,
    content: row.content,
    hashtags: row.hashtags ?? [],
    topic: row.topic,
    theme: row.theme,
    sentiment: row.sentiment,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    replies: Number(row.replies ?? 0),
    reposts: Number(row.reposts ?? 0),
    engagementRate: Number(row.engagement_rate ?? 0),
    buzzScore: Number(row.buzz_score ?? 0),
    postedAt: row.posted_at,
    categoryName,
  }));
}
