/**
 * Apify-backed Instagram ingestion for Vira's ImageBase.
 *
 * Hashtag search results are normalised into public.image_assets (platform =
 * "instagram") plus public.category_image_assets, capped at IMAGE_MAX_ITEMS.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/apify";
const ACTOR_ID = "apify~instagram-hashtag-scraper";

export type RawInstagramItem = Record<string, unknown>;

export type NormalizedImageAsset = {
  image_key: string;
  platform: string;
  source_url: string;
  image_url: string;
  thumbnail_url: string;
  author: string;
  author_handle: string;
  title: string;
  caption: string;
  hashtags: string[];
  format: string;
  query: string;
  likes: number;
  comments: number;
  engagement_rate: number;
  buzz_score: number;
  posted_at: string | null;
  raw: Record<string, unknown>;
};

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function tags(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((tag): tag is string => typeof tag === "string") : [];
}

export function normalizeInstagram(
  item: RawInstagramItem,
  query: string,
): NormalizedImageAsset | null {
  const shortCode = str(item["shortCode"]) || str(item["id"]);
  const imageUrl = str(item["displayUrl"]) || str(item["thumbnailUrl"]);
  if (!shortCode || !imageUrl) return null;

  const caption = str(item["caption"]).replace(/\s+/g, " ").trim();
  const likes = num(item["likesCount"]);
  const comments = num(item["commentsCount"]);

  const rawDate = str(item["timestamp"]);
  const parsed = rawDate ? new Date(rawDate) : null;
  const postedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;

  const ageDays = postedAt
    ? Math.max(0, (Date.now() - new Date(postedAt).getTime()) / 86_400_000)
    : 120;
  const freshness = Math.exp(-ageDays / 180);
  const reach = Math.log10(Math.max(likes + comments * 4, 1)) / 6;
  const buzz = Math.min(100, Math.max(0, (reach * 0.7 + freshness * 0.3) * 100));
  const engagement = likes > 0 ? Math.min((likes + comments * 3) / Math.max(likes * 3, 1), 1) : 0;

  return {
    image_key: `VIRA-IMG-IG-${shortCode}`,
    platform: "instagram",
    source_url: str(item["url"]) || `https://www.instagram.com/p/${shortCode}/`,
    image_url: imageUrl,
    thumbnail_url: str(item["thumbnailUrl"]) || imageUrl,
    author: str(item["ownerFullName"]) || str(item["ownerUsername"]),
    author_handle: str(item["ownerUsername"]),
    title: (caption.split(/[.!?\n]/)[0] || query).slice(0, 140),
    caption,
    hashtags: tags(item["hashtags"]).slice(0, 12),
    format: str(item["type"]).toLowerCase() === "video" ? "video" : "image",
    query,
    likes,
    comments,
    engagement_rate: Number(engagement.toFixed(5)),
    buzz_score: Number(buzz.toFixed(2)),
    posted_at: postedAt,
    raw: { shortCode, type: str(item["type"]), hashtag: query },
  };
}

function gatewayHeaders() {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const connectionKey = process.env["APIFY_API_KEY"];
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connectionKey) throw new Error("APIFY_API_KEY is not configured");
  return {
    Authorization: `Bearer ${lovableKey}`,
    "X-Connection-Api-Key": connectionKey,
    "Content-Type": "application/json",
  };
}

/** Starts an async Instagram hashtag Actor run. Returns the run + dataset ids. */
export async function startInstagramScrape(
  hashtags: string[],
  resultsLimit: number,
): Promise<{ runId: string; defaultDatasetId: string }> {
  const response = await fetch(`${GATEWAY_URL}/acts/${ACTOR_ID}/runs`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      hashtags,
      resultsLimit,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Apify Instagram run start failed [${response.status}]: ${errorBody}`);
    throw new Error(`Apify Instagram run start failed [${response.status}]: ${errorBody}`);
  }
  const payload = (await response.json()) as { data: { id: string; defaultDatasetId: string } };
  return { runId: payload.data.id, defaultDatasetId: payload.data.defaultDatasetId };
}

export async function getInstagramRunStatus(runId: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/actor-runs/${runId}`, {
    headers: gatewayHeaders(),
  });
  if (!response.ok) {
    throw new Error(`Apify Instagram run status failed [${response.status}]`);
  }
  const payload = (await response.json()) as { data: { status: string } };
  return payload.data.status;
}

export async function fetchInstagramDatasetItems(
  datasetId: string,
  offset = 0,
  limit = 500,
): Promise<RawInstagramItem[]> {
  const response = await fetch(
    `${GATEWAY_URL}/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`,
    { headers: gatewayHeaders() },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify Instagram dataset read failed [${response.status}]: ${errorBody}`);
  }
  return (await response.json()) as RawInstagramItem[];
}
