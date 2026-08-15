/**
 * Apify-backed trend ingestion for Vira.
 *
 * Scrapes trending short-form video content per category and normalises it into
 * public.trends + public.category_trends (see docs/SCHEMA.md).
 */

const GATEWAY_URL = "https://connector-gateway.lovable.dev/apify";
const ACTOR_ID = "clockworks~tiktok-scraper";

export type RawTrendItem = Record<string, unknown>;

export type NormalizedTrend = {
  trend_key: string;
  platform: string;
  source_url: string;
  author: string;
  title: string;
  caption: string;
  hashtags: string[];
  music: string;
  format: string;
  query: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number;
  trend_score: number;
  posted_at: string | null;
  raw: RawTrendItem;
};

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Rough format classification so remixes know what kind of shoot this is. */
export function classifyFormat(caption: string, hashtags: string[]): string {
  const text = `${caption} ${hashtags.join(" ")}`.toLowerCase();
  if (/unbox|haul|came in|package/.test(text)) return "Unboxing / haul";
  if (/grwm|get ready|routine/.test(text)) return "GRWM routine";
  if (/review|honest|tried|worth it/.test(text)) return "Review / testimonial";
  if (/how to|tutorial|hack|tip/.test(text)) return "Tutorial / hack";
  if (/pov|storytime|day in the life|vlog/.test(text)) return "POV / storytime";
  if (/before|after|transformation|glow up/.test(text)) return "Before / after";
  if (/sale|deal|discount|drop|launch/.test(text)) return "Offer / launch";
  if (/behind the scenes|small business|packing orders/.test(text))
    return "Behind the scenes";
  return "UGC social proof";
}

/** 0-100 heat score blending reach and engagement, decayed by age. */
export function scoreTrend(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  postedAt: string | null,
): { engagement_rate: number; trend_score: number } {
  const engagement = views > 0 ? (likes + comments * 2 + shares * 3) / views : 0;
  const reach = Math.log10(Math.max(views, 1)) / 8; // ~1.0 at 100M views
  const ageDays = postedAt
    ? Math.max(0, (Date.now() - new Date(postedAt).getTime()) / 86_400_000)
    : 90;
  const freshness = Math.exp(-ageDays / 120);
  const score = (reach * 0.5 + Math.min(engagement, 0.25) * 2 + freshness * 0.25) * 100;
  return {
    engagement_rate: Number(engagement.toFixed(5)),
    trend_score: Number(Math.min(100, Math.max(0, score)).toFixed(2)),
  };
}

export function normalizeTrend(item: RawTrendItem, query: string): NormalizedTrend | null {
  const id = str(item["id"]) || str(item["webVideoUrl"]);
  if (!id) return null;

  const author =
    str((item["authorMeta"] as Record<string, unknown> | undefined)?.["name"]) ||
    str(item["authorName"]);
  const caption = str(item["text"]) || str(item["desc"]);
  const hashtags = Array.isArray(item["hashtags"])
    ? (item["hashtags"] as Array<Record<string, unknown>>)
        .map((h) => str(h["name"]))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const views = num(item["playCount"]);
  const likes = num(item["diggCount"]);
  const comments = num(item["commentCount"]);
  const shares = num(item["shareCount"]);
  const postedAt = str(item["createTimeISO"]) || null;
  const { engagement_rate, trend_score } = scoreTrend(views, likes, comments, shares, postedAt);

  return {
    trend_key: `VIRA-TR-${id}`,
    platform: "tiktok",
    source_url: str(item["webVideoUrl"]),
    author,
    title: caption.split("\n")[0]?.slice(0, 140) ?? "",
    caption,
    hashtags,
    music: str((item["musicMeta"] as Record<string, unknown> | undefined)?.["musicName"]),
    format: classifyFormat(caption, hashtags),
    query,
    views,
    likes,
    comments,
    shares,
    engagement_rate,
    trend_score,
    posted_at: postedAt,
    raw: {
      id,
      author,
      videoUrl: str(item["webVideoUrl"]),
      coverUrl: str((item["videoMeta"] as Record<string, unknown> | undefined)?.["coverUrl"]),
      duration: num((item["videoMeta"] as Record<string, unknown> | undefined)?.["duration"]),
    },
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

/** Starts an async Actor run for one set of search queries. Returns the run id. */
export async function startTrendScrape(
  queries: string[],
  resultsPerPage: number,
): Promise<{ runId: string; defaultDatasetId: string }> {
  const response = await fetch(`${GATEWAY_URL}/acts/${ACTOR_ID}/runs`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      searchQueries: queries,
      resultsPerPage,
      searchSection: "/video",
      excludePinnedPosts: false,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
      proxyCountryCode: "None",
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Apify run start failed [${response.status}]: ${errorBody}`);
    throw new Error(`Apify run start failed [${response.status}]: ${errorBody}`);
  }
  const payload = (await response.json()) as {
    data: { id: string; defaultDatasetId: string };
  };
  return { runId: payload.data.id, defaultDatasetId: payload.data.defaultDatasetId };
}

export async function getRunStatus(runId: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/actor-runs/${runId}`, {
    headers: gatewayHeaders(),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify run status failed [${response.status}]: ${errorBody}`);
  }
  const payload = (await response.json()) as { data: { status: string } };
  return payload.data.status;
}

export async function fetchDatasetItems(
  datasetId: string,
  offset = 0,
  limit = 500,
): Promise<RawTrendItem[]> {
  const response = await fetch(
    `${GATEWAY_URL}/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`,
    { headers: gatewayHeaders() },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify dataset read failed [${response.status}]: ${errorBody}`);
  }
  return (await response.json()) as RawTrendItem[];
}
