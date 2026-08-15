/**
 * Apify-backed word-of-mouth ingestion for Vira.
 *
 * Scrapes X/Twitter chatter about advertising, trends and product identity and
 * normalises it into public.word_of_mouth + public.category_word_of_mouth
 * (see docs/SCHEMA.md). Capped at WOM_MAX_ITEMS payloads.
 */
import type { WomTopic } from "./wom-queries";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/apify";
const ACTOR_ID = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest";

export type RawWomItem = Record<string, unknown>;

export type NormalizedWom = {
  wom_key: string;
  platform: string;
  source_url: string;
  author: string;
  author_handle: string;
  author_followers: number;
  title: string;
  content: string;
  hashtags: string[];
  mentions: string[];
  topic: WomTopic;
  theme: string;
  sentiment: string;
  query: string;
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  engagement_rate: number;
  buzz_score: number;
  posted_at: string | null;
  raw: RawWomItem;
};

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** What kind of conversation this is, so remixes know the angle. */
export function classifyTheme(text: string): string {
  const t = text.toLowerCase();
  if (/\bad\b|advert|campaign|commercial|billboard/.test(t)) return "Ad reaction";
  if (/review|honest|tried|worth it|bought/.test(t)) return "Purchase review";
  if (/everyone|viral|trending|blowing up|all over my/.test(t)) return "Trend chatter";
  if (/love|obsessed|favorite|loyal|switched to/.test(t)) return "Brand love";
  if (/hate|disappointed|overrated|scam|waste/.test(t)) return "Complaint";
  if (/packaging|logo|rebrand|identity|aesthetic/.test(t)) return "Brand identity";
  if (/recommend|need this|must have/.test(t)) return "Recommendation";
  return "General mention";
}

export function classifySentiment(text: string): string {
  const t = text.toLowerCase();
  const positive = /love|obsessed|amazing|great|best|perfect|worth it|recommend/.test(t);
  const negative = /hate|awful|terrible|worst|disappointed|overrated|scam|waste|refund/.test(t);
  if (positive && !negative) return "positive";
  if (negative && !positive) return "negative";
  if (positive && negative) return "mixed";
  return "neutral";
}

/** 0-100 buzz score blending reach, engagement and freshness. */
export function scoreWom(
  views: number,
  likes: number,
  replies: number,
  reposts: number,
  quotes: number,
  followers: number,
  postedAt: string | null,
): { engagement_rate: number; buzz_score: number } {
  const denominator = views > 0 ? views : Math.max(followers, 1);
  const engagement = (likes + replies * 2 + reposts * 3 + quotes * 3) / denominator;
  const reach = Math.log10(Math.max(views || followers, 1)) / 8;
  const ageDays = postedAt
    ? Math.max(0, (Date.now() - new Date(postedAt).getTime()) / 86_400_000)
    : 90;
  const freshness = Math.exp(-ageDays / 120);
  const score = (reach * 0.5 + Math.min(engagement, 0.25) * 2 + freshness * 0.25) * 100;
  return {
    engagement_rate: Number(engagement.toFixed(5)),
    buzz_score: Number(Math.min(100, Math.max(0, score)).toFixed(2)),
  };
}

export function normalizeWom(
  item: RawWomItem,
  query: string,
  topic: WomTopic,
): NormalizedWom | null {
  const id = str(item["id"]) || str(item["id_str"]) || str(item["url"]);
  if (!id) return null;

  const content = str(item["text"]) || str(item["full_text"]);
  if (!content) return null;

  const authorObj = (item["author"] as Record<string, unknown> | undefined) ?? {};
  const author = str(authorObj["name"]);
  const handle = str(authorObj["userName"]) || str(authorObj["screen_name"]);
  const followers = num(authorObj["followers"]) || num(authorObj["followers_count"]);

  const entities = (item["entities"] as Record<string, unknown> | undefined) ?? {};
  const hashtags = Array.isArray(entities["hashtags"])
    ? (entities["hashtags"] as Array<Record<string, unknown>>)
        .map((h) => str(h["text"]))
        .filter(Boolean)
        .slice(0, 20)
    : [];
  const mentions = Array.isArray(entities["user_mentions"])
    ? (entities["user_mentions"] as Array<Record<string, unknown>>)
        .map((m) => str(m["screen_name"]))
        .filter(Boolean)
        .slice(0, 20)
    : [];

  const views = num(item["viewCount"]) || num(item["views"]);
  const likes = num(item["likeCount"]) || num(item["favorite_count"]);
  const replies = num(item["replyCount"]) || num(item["reply_count"]);
  const reposts = num(item["retweetCount"]) || num(item["retweet_count"]);
  const quotes = num(item["quoteCount"]) || num(item["quote_count"]);

  const rawDate = str(item["createdAt"]) || str(item["created_at"]);
  const parsed = rawDate ? new Date(rawDate) : null;
  const postedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;

  const { engagement_rate, buzz_score } = scoreWom(
    views,
    likes,
    replies,
    reposts,
    quotes,
    followers,
    postedAt,
  );

  return {
    wom_key: `VIRA-WOM-${id}`,
    platform: "twitter",
    source_url: str(item["url"]) || str(item["twitterUrl"]),
    author,
    author_handle: handle,
    author_followers: followers,
    title: content.split("\n")[0]?.slice(0, 140) ?? "",
    content,
    hashtags,
    mentions,
    topic,
    theme: classifyTheme(`${content} ${hashtags.join(" ")}`),
    sentiment: classifySentiment(content),
    query,
    views,
    likes,
    replies,
    reposts,
    quotes,
    engagement_rate,
    buzz_score,
    posted_at: postedAt,
    raw: {
      id,
      handle,
      url: str(item["url"]) || str(item["twitterUrl"]),
      lang: str(item["lang"]),
      isReply: Boolean(item["isReply"]),
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

/** Starts an async Actor run for one set of search terms. Returns the run id. */
export async function startWomScrape(
  searchTerms: string[],
  maxItems: number,
): Promise<{ runId: string; defaultDatasetId: string }> {
  const response = await fetch(`${GATEWAY_URL}/acts/${ACTOR_ID}/runs`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      searchTerms,
      maxItems,
      sort: "Top",
      tweetLanguage: "en",
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Apify WOM run start failed [${response.status}]: ${errorBody}`);
    throw new Error(`Apify WOM run start failed [${response.status}]: ${errorBody}`);
  }
  const payload = (await response.json()) as {
    data: { id: string; defaultDatasetId: string };
  };
  return { runId: payload.data.id, defaultDatasetId: payload.data.defaultDatasetId };
}

export async function getWomRunStatus(runId: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/actor-runs/${runId}`, {
    headers: gatewayHeaders(),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify WOM run status failed [${response.status}]: ${errorBody}`);
  }
  const payload = (await response.json()) as { data: { status: string } };
  return payload.data.status;
}

export async function fetchWomDatasetItems(
  datasetId: string,
  offset = 0,
  limit = 500,
): Promise<RawWomItem[]> {
  const response = await fetch(
    `${GATEWAY_URL}/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`,
    { headers: gatewayHeaders() },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify WOM dataset read failed [${response.status}]: ${errorBody}`);
  }
  return (await response.json()) as RawWomItem[];
}
