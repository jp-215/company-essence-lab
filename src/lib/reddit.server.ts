/**
 * Apify-backed Reddit word-of-mouth ingestion for Vira.
 *
 * Replaces the X/Twitter scrape: Reddit search results are normalised into
 * public.word_of_mouth (platform = "reddit") + public.category_word_of_mouth,
 * capped at REDDIT_MAX_ITEMS payloads.
 */
import type { WomTopic } from "./wom-queries";
import { classifySentiment, classifyTheme, type NormalizedWom } from "./wom.server";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/apify";
const ACTOR_ID = "trudax~reddit-scraper-lite";

export const REDDIT_MAX_ITEMS = 1000;

export type RawRedditItem = Record<string, unknown>;

function num(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Reddit RSS bodies carry HTML entities and a boilerplate "submitted by" tail. */
function cleanBody(raw: string): string {
  return raw
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/submitted by\s*\/u\/\S+\s*\[link\]\s*\[comments\]/gi, "")
    .replace(/\[link\]|\[comments\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip Twitter-only search operators so the query works as Reddit search. */
export function toRedditQuery(query: string): string {
  return query.replace(/-?filter:\S+/gi, "").replace(/\s+/g, " ").trim();
}

export function normalizeReddit(
  item: RawRedditItem,
  query: string,
  topic: WomTopic,
): NormalizedWom | null {
  const id = str(item["id"]) || str(item["parsedId"]) || str(item["url"]);
  if (!id) return null;

  const title = str(item["title"]);
  const body = cleanBody(str(item["body"]));
  const content = body || title;
  if (!content) return null;

  const community = str(item["communityName"]) || str(item["parsedCommunityName"]);
  const upVotes = num(item["upVotes"]) || num(item["score"]);
  const comments = num(item["numberOfComments"]) || num(item["numComments"]);

  const rawDate = str(item["createdAt"]) || str(item["created"]);
  const parsed = rawDate ? new Date(rawDate) : null;
  const postedAt = parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;

  const ageDays = postedAt
    ? Math.max(0, (Date.now() - new Date(postedAt).getTime()) / 86_400_000)
    : 90;
  const freshness = Math.exp(-ageDays / 120);
  const reach = Math.log10(Math.max(upVotes + comments * 3, 1)) / 5;
  const depth = Math.min(content.length / 900, 1);
  const engagement = upVotes > 0 ? (upVotes + comments * 2) / Math.max(upVotes * 3, 1) : 0;
  const buzz = Math.min(100, Math.max(0, (reach * 0.4 + freshness * 0.4 + depth * 0.2) * 100));

  return {
    wom_key: `VIRA-WOM-RD-${str(item["parsedId"]) || id}`,
    platform: "reddit",
    source_url: str(item["url"]),
    author: str(item["username"]),
    author_handle: community,
    author_followers: 0,
    title: (title || content).slice(0, 140),
    content,
    hashtags: community ? [community.replace(/^r\//, "")] : [],
    mentions: [],
    topic,
    theme: classifyTheme(`${title} ${content}`),
    sentiment: classifySentiment(`${title} ${content}`),
    query,
    views: 0,
    likes: upVotes,
    replies: comments,
    reposts: 0,
    quotes: 0,
    engagement_rate: Number(Math.min(engagement, 1).toFixed(5)),
    buzz_score: Number(buzz.toFixed(2)),
    posted_at: postedAt,
    raw: {
      id,
      community,
      url: str(item["url"]),
      dataType: str(item["dataType"]),
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

/** Starts an async Reddit Actor run for one search term. Returns the run id. */
export async function startRedditScrape(
  searches: string[],
  maxItems: number,
): Promise<{ runId: string; defaultDatasetId: string }> {
  const response = await fetch(`${GATEWAY_URL}/acts/${ACTOR_ID}/runs`, {
    method: "POST",
    headers: gatewayHeaders(),
    body: JSON.stringify({
      searches: searches.map(toRedditQuery),
      type: "posts",
      sort: "top",
      time: "year",
      maxItems,
      maxPostCount: maxItems,
      skipComments: true,
      skipUserPosts: true,
      searchPosts: true,
      searchComments: false,
      searchCommunities: false,
      searchUsers: false,
    }),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Apify Reddit run start failed [${response.status}]: ${errorBody}`);
    throw new Error(`Apify Reddit run start failed [${response.status}]: ${errorBody}`);
  }
  const payload = (await response.json()) as {
    data: { id: string; defaultDatasetId: string };
  };
  return { runId: payload.data.id, defaultDatasetId: payload.data.defaultDatasetId };
}

export async function getRedditRunStatus(runId: string): Promise<string> {
  const response = await fetch(`${GATEWAY_URL}/actor-runs/${runId}`, {
    headers: gatewayHeaders(),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify Reddit run status failed [${response.status}]: ${errorBody}`);
  }
  const payload = (await response.json()) as { data: { status: string } };
  return payload.data.status;
}

export async function fetchRedditDatasetItems(
  datasetId: string,
  offset = 0,
  limit = 500,
): Promise<RawRedditItem[]> {
  const response = await fetch(
    `${GATEWAY_URL}/datasets/${datasetId}/items?clean=true&offset=${offset}&limit=${limit}`,
    { headers: gatewayHeaders() },
  );
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Apify Reddit dataset read failed [${response.status}]: ${errorBody}`);
  }
  return (await response.json()) as RawRedditItem[];
}
