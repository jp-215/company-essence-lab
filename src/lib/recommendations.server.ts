import crypto from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { TrendDTO } from "./remix-types";
import { embedText } from "./knowledge.server";
import { listMappedTrends } from "./remix.server";
import {
  getRecentlyShownKeys,
  getSocialProof,
  logInteractionsInBackground,
} from "./interactions.server";

type Client = SupabaseClient<Database>;

import { RANK_WEIGHTS } from "./rank-constants";

export type RecommendedTrendDTO = TrendDTO & {
  similarity: number;
  /** SQL combined_score (similarity + virality percentiles) in 0..1. */
  combinedScore: number;
  /** Collaborative score normalized 0..1 across the current pool. */
  cfNorm: number;
  /** Distinct brands that remixed this item. */
  remixCount: number;
  /**
   * semantic = pgvector match against the company profile;
   * community = surfaced because similar brands engaged with it;
   * category = category_trends fallback (no embeddings available).
   */
  matchType: "semantic" | "community" | "category";
};

/** Deterministic 0..1 noise so a given seed always produces the same shuffle. */
function seededNoise(seed: number, key: string): number {
  // FNV-1a over the key, seed-mixed. Math.imul keeps the multiply in 32-bit
  // space — plain `*` overflows 2^53 and degrades into a linear lattice.
  let hash = Math.imul(seed ^ 0x811c9dc5, 2654435761) >>> 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = Math.imul(hash ^ key.charCodeAt(i), 16777619) >>> 0;
  }
  return (hash % 100000) / 100000;
}

/**
 * Rerank a scored candidate pool so the feed feels alive: score is blended with
 * seed-driven noise, a demote multiplier pushes recently-shown items down, and
 * a per-author / per-format / per-sound cap keeps one creator from swallowing
 * the whole rail.
 */
function diversify<T>(
  candidates: T[],
  opts: {
    limit: number;
    seed: number;
    key: (item: T) => string;
    score: (item: T) => number;
    groups: (item: T) => string[];
    demote?: (item: T) => number;
    exploration?: number;
    perGroupCap?: number;
  },
): T[] {
  const exploration = opts.exploration ?? RANK_WEIGHTS.exploration;
  const cap = opts.perGroupCap ?? 2;
  const demote = opts.demote ?? (() => 1);

  const blended = (item: T) =>
    (opts.score(item) * (1 - exploration) + seededNoise(opts.seed, opts.key(item)) * exploration) *
    demote(item);

  const ranked = [...candidates].sort((a, b) => blended(b) - blended(a));

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

type CommunitySignal = { score: number; remixers: number };

/** Peer activity from similar brands; empty map on cold start or local dev. */
async function fetchCommunitySignals(companyId: string): Promise<Map<string, CommunitySignal>> {
  const signals = new Map<string, CommunitySignal>();
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.rpc("recommend_community_trends", {
      _company_id: companyId,
      _limit: 40,
      _days: 30,
    });
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      signals.set(row.trend_key, {
        score: Number(row.community_score ?? 0),
        remixers: Number(row.remixer_count ?? 0),
      });
    }
  } catch (error) {
    console.error("Community signals unavailable", error);
  }
  return signals;
}

type V2Row = Database["public"]["Functions"]["recommend_company_trends_v2"]["Returns"][number];

function toRecommended(row: V2Row): RecommendedTrendDTO {
  return {
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
    music: row.music ?? "",
    comments: Number(row.comments ?? 0),
    shares: Number(row.shares ?? 0),
    postedAt: row.posted_at ?? null,
    similarity: Number(row.similarity ?? 0),
    combinedScore: Number(row.combined_score ?? 0),
    cfNorm: 0,
    remixCount: 0,
    matchType: "semantic",
  };
}

/**
 * Content-based recommendations with a collaborative layer and per-visit
 * dynamism:
 *  - the SQL v2 RPC pulls a wide pool (deduped, recently-shown excluded),
 *    percentile-balances similarity vs live virality, and does a seeded
 *    weighted draw — a new seed is a genuinely new mix;
 *  - peer activity ("brands like yours remixed this") boosts and injects items;
 *  - diversify() adds exploration noise and per-author/format/sound caps;
 *  - impressions are logged fire-and-forget so the next visit rotates.
 * Falls back to the category_trends join when embeddings are missing.
 */
export async function getRecommendedTrends(
  client: Client,
  companyId: string,
  options: {
    limit?: number | undefined;
    queryText?: string | undefined;
    seed?: number | undefined;
    surface?: string | undefined;
    ownerId?: string | undefined;
    logImpressions?: boolean | undefined;
  } = {},
): Promise<RecommendedTrendDTO[]> {
  const limit = options.limit ?? 8;
  const seed = options.seed ?? crypto.randomInt(1_000_000);
  const surface = options.surface ?? "trends";
  const sampleSize = Math.min(limit * 4, 50);
  const poolSize = Math.min(Math.max(limit * 10, 60), 200);

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

  const [recentKeys, community] = await Promise.all([
    getRecentlyShownKeys(companyId, surface),
    fetchCommunitySignals(companyId),
  ]);
  const recentSet = new Set(recentKeys);

  const callV2 = async (excludeKeys: string[]) => {
    const { data, error } = await client.rpc("recommend_company_trends_v2", {
      _company_id: companyId,
      _limit: sampleSize,
      _seed: seed,
      _pool: poolSize,
      ...(queryEmbedding ? { _query_embedding: JSON.stringify(queryEmbedding) } : {}),
      ...(excludeKeys.length ? { _exclude_keys: excludeKeys } : {}),
    });
    if (error) throw new Error(error.message);
    return (data ?? []).map(toRecommended);
  };

  // Exclude recently-shown items outright; if that starves the pool, retry
  // without exclusions and let the demote multiplier handle rotation instead.
  let pool = await callV2(recentKeys);
  if (pool.length < limit && recentKeys.length) {
    pool = await callV2([]);
  }

  const seen = new Set(pool.map((trend) => trend.trendKey));

  // Inject community picks that the semantic pool missed.
  const missingCommunityKeys = [...community.keys()]
    .filter((key) => !seen.has(key) && key.startsWith("VIRA-TR-"))
    .slice(0, 8);
  if (missingCommunityKeys.length) {
    const { data: rows } = await client
      .from("trends")
      .select(
        "trend_key, platform, title, caption, hashtags, music, format, source_url, author, views, likes, comments, shares, engagement_rate, trend_score, posted_at",
      )
      .in("trend_key", missingCommunityKeys)
      .is("duplicate_of", null);
    for (const row of rows ?? []) {
      seen.add(row.trend_key);
      pool.push({
        ...toRecommended({ ...row, similarity: 0, combined_score: 0 } as V2Row),
        matchType: "community",
      });
    }
  }

  // Category fallback tops up genuinely short pools (no embeddings / cold DB).
  if (pool.length < limit * 2) {
    const fallback = await listMappedTrends(client, companyId, limit * 3);
    for (const trend of fallback) {
      if (seen.has(trend.trendKey)) continue;
      seen.add(trend.trendKey);
      pool.push({
        ...trend,
        similarity: 0,
        combinedScore: 0,
        cfNorm: 0,
        remixCount: 0,
        matchType: "category",
      });
    }
  }

  // Normalize collaborative scores across the pool and attach them.
  const maxCf = Math.max(1e-9, ...[...community.values()].map((signal) => signal.score));
  for (const trend of pool) {
    const signal = community.get(trend.trendKey);
    if (signal) {
      trend.cfNorm = signal.score / maxCf;
      trend.remixCount = Math.max(trend.remixCount, signal.remixers);
    }
  }

  const picked = diversify(pool, {
    limit,
    seed,
    key: (trend) => trend.trendKey,
    score: (trend) => {
      const base =
        trend.matchType === "semantic"
          ? trend.combinedScore
          : trend.matchType === "community"
            ? RANK_WEIGHTS.communityBase
            : RANK_WEIGHTS.categoryFloor;
      return Math.min(1, base * (1 - RANK_WEIGHTS.cf) + trend.cfNorm * RANK_WEIGHTS.cf);
    },
    groups: (trend) => [
      `author:${trend.author}`,
      `format:${trend.format}`,
      trend.music ? `music:${trend.music}` : "",
    ],
    demote: (trend) => (recentSet.has(trend.trendKey) ? RANK_WEIGHTS.seenDemote : 1),
  });

  // Social proof for the final picks (one round trip; merged over CF counts).
  const proof = await getSocialProof(picked.map((trend) => trend.trendKey));
  for (const trend of picked) {
    const counts = proof.get(trend.trendKey);
    if (counts) trend.remixCount = Math.max(trend.remixCount, counts.remixCount);
  }

  if (options.logImpressions !== false && options.ownerId) {
    logInteractionsInBackground(
      picked.map((trend) => ({
        companyId,
        ownerId: options.ownerId!,
        trendKey: trend.trendKey,
        action: "impression",
        surface,
      })),
    );
  }

  return picked;
}

export async function getTrendByKey(client: Client, trendKey: string): Promise<TrendDTO | null> {
  const { data, error } = await client
    .from("trends")
    .select(
      "trend_key, platform, title, caption, hashtags, music, format, source_url, author, views, likes, comments, shares, engagement_rate, trend_score, posted_at",
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
    music: data.music ?? "",
    comments: Number(data.comments ?? 0),
    shares: Number(data.shares ?? 0),
    postedAt: data.posted_at ?? null,
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
  hashtags: string[];
  views: number;
  likes: number;
  replies: number;
  reposts: number;
  buzzScore: number;
  postedAt: string | null;
  similarity: number;
  matchType: "semantic" | "category";
};

/**
 * Word-of-mouth chatter: semantic + buzz seeded sampling when embeddings exist
 * (company_word_of_mouth_v2), category-join fallback otherwise. Same rotation
 * and impression logging as trends.
 */
export async function getRecommendedChatter(
  client: Client,
  companyId: string,
  limit = 6,
  seed?: number,
  options: { surface?: string | undefined; ownerId?: string | undefined } = {},
): Promise<RecommendedChatterDTO[]> {
  const effectiveSeed = seed ?? crypto.randomInt(1_000_000);
  const surface = options.surface ?? "trends";
  const recentKeys = await getRecentlyShownKeys(companyId, surface);
  const recentSet = new Set(recentKeys);

  let pool: RecommendedChatterDTO[] = [];

  const { data: v2, error: v2Error } = await client.rpc("company_word_of_mouth_v2", {
    _company_id: companyId,
    _limit: Math.min(limit * 4, 50),
    _seed: effectiveSeed,
    _pool: Math.min(Math.max(limit * 10, 60), 200),
    ...(recentKeys.length ? { _exclude_keys: recentKeys } : {}),
  });
  if (v2Error) {
    console.error(`Chatter v2 failed: ${v2Error.message}`);
  } else {
    pool = (v2 ?? []).map((row) => ({
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
      hashtags: row.hashtags ?? [],
      views: Number(row.views ?? 0),
      likes: Number(row.likes ?? 0),
      replies: Number(row.replies ?? 0),
      reposts: Number(row.reposts ?? 0),
      buzzScore: Number(row.buzz_score ?? 0),
      postedAt: row.posted_at ?? null,
      similarity: Number(row.similarity ?? 0),
      matchType: "semantic",
    }));
  }

  // Fallback: category join (wom embeddings not backfilled yet, or no company embedding).
  if (pool.length < limit) {
    const { data, error } = await client.rpc("company_word_of_mouth", {
      _company_id: companyId,
      _limit: Math.min(limit * 5, 60),
    });
    if (error) throw new Error(error.message);
    const seen = new Set(pool.map((row) => row.womKey));
    for (const row of data ?? []) {
      if (seen.has(row.wom_key)) continue;
      pool.push({
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
        hashtags: row.hashtags ?? [],
        views: Number(row.views ?? 0),
        likes: Number(row.likes ?? 0),
        replies: Number(row.replies ?? 0),
        reposts: Number(row.reposts ?? 0),
        buzzScore: Number(row.buzz_score ?? 0),
        postedAt: row.posted_at ?? null,
        similarity: 0,
        matchType: "category",
      });
    }
  }

  const maxBuzz = Math.max(1, ...pool.map((row) => row.buzzScore));
  const picked = diversify(pool, {
    limit,
    seed: effectiveSeed,
    key: (row) => row.womKey,
    score: (row) =>
      row.matchType === "semantic"
        ? 0.5 * row.similarity + 0.5 * (row.buzzScore / maxBuzz)
        : row.buzzScore / maxBuzz,
    groups: (row) => [`topic:${row.topic}`, `author:${row.authorHandle || row.author}`],
    demote: (row) => (recentSet.has(row.womKey) ? RANK_WEIGHTS.seenDemote : 1),
  });

  if (options.ownerId) {
    logInteractionsInBackground(
      picked.map((row) => ({
        companyId,
        ownerId: options.ownerId!,
        trendKey: row.womKey,
        action: "impression",
        surface,
      })),
    );
  }

  return picked;
}
