import { createPublicClient } from "./supabase-public.server";

export type PublicImageAsset = {
  imageKey: string;
  platform: string;
  sourceUrl: string;
  imageUrl: string;
  thumbnailUrl: string;
  author: string;
  authorHandle: string;
  title: string;
  caption: string;
  hashtags: string[];
  likes: number;
  comments: number;
  buzzScore: number;
  postedAt: string | null;
};

const COLUMNS =
  "image_key, platform, source_url, image_url, thumbnail_url, author, author_handle, title, caption, hashtags, likes, comments, buzz_score, posted_at";

/** Public ImageBase feed of still assets, optionally scoped to a category slug. */
export async function fetchImageAssets(input: {
  categorySlug?: string | undefined;
  limit?: number | undefined;
}): Promise<PublicImageAsset[]> {
  const client = createPublicClient();
  const limit = Math.min(Math.max(input.limit ?? 24, 1), 60);

  let imageKeys: string[] | null = null;

  if (input.categorySlug) {
    const { data: category } = await client
      .from("categories")
      .select("id")
      .eq("slug", input.categorySlug)
      .maybeSingle();
    if (!category) return [];

    const { data: mapped, error: mappedError } = await client
      .from("category_image_assets")
      .select("image_key")
      .eq("category_id", category.id)
      .order("relevance_rank", { ascending: true })
      .limit(limit * 3);
    if (mappedError) throw new Error(mappedError.message);
    imageKeys = (mapped ?? []).map((row) => row.image_key);
    if (!imageKeys.length) return [];
  }

  let query = client.from("image_assets").select(COLUMNS).order("buzz_score", { ascending: false });
  if (imageKeys) query = query.in("image_key", imageKeys);

  const { data, error } = await query.limit(limit);
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    imageKey: row.image_key,
    platform: row.platform,
    sourceUrl: row.source_url,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    author: row.author,
    authorHandle: row.author_handle,
    title: row.title,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    likes: Number(row.likes ?? 0),
    comments: Number(row.comments ?? 0),
    buzzScore: Number(row.buzz_score ?? 0),
    postedAt: row.posted_at,
  }));
}
