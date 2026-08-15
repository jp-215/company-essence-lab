import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { RemixDTO, TrendDTO } from "./remix-types";

type Client = SupabaseClient<Database>;

/**
 * Mapping protocol: company -> category (company.category_id) -> category_trends
 * -> trends, joined on the trend primary identifier key.
 */
export async function listMappedTrends(
  client: Client,
  companyId: string,
  limit = 24,
): Promise<TrendDTO[]> {
  const { data, error } = await client.rpc("company_trends", {
    _company_id: companyId,
    _limit: limit,
  });
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
    relevanceRank: Number(row.relevance_rank ?? 1),
  }));
}

function toRemix(row: {
  id: string;
  company_id: string;
  trend_key: string | null;
  trend_title: string;
  source_url: string;
  platform: string;
  hook: string;
  script: string;
  caption: string;
  hashtags: string[] | null;
  differentiator: string;
  created_at: string;
}): RemixDTO {
  return {
    id: row.id,
    companyId: row.company_id,
    trendKey: row.trend_key ?? "",
    trendTitle: row.trend_title,
    sourceUrl: row.source_url,
    platform: row.platform,
    hook: row.hook,
    script: row.script,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    differentiator: row.differentiator,
    createdAt: row.created_at,
  };
}

export async function listRemixes(
  client: Client,
  companyId: string,
  userId: string,
): Promise<RemixDTO[]> {
  const { data, error } = await client
    .from("company_remixes")
    .select("*")
    .eq("company_id", companyId)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);

  return (data ?? []).map(toRemix);
}

export type RemixOutput = {
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  differentiator: string;
};

const SYSTEM_PROMPT = `You are Vira, a viral-ad remix engine for early-stage consumer brands.
Given a REAL trending social post plus one brand's identity, rewrite that trend as a shoot-ready ad
the brand can film today. Keep the structural mechanic of the trend (hook style, pacing, format),
but replace the substance with the brand's mission, category and specific proof. Never generic hype.
Return ONLY JSON:
{"hook": string (one line, under 90 chars),
 "script": string (timestamped beats, one per line, 25-35 seconds total, includes shot directions),
 "caption": string (platform caption, 1-2 sentences plus CTA),
 "hashtags": string[] (4-8 lowercase tags, no # symbol),
 "differentiator": string (1 sentence: how this ad separates them from category incumbents)}`;

export async function remixTrend(payload: {
  trend: TrendDTO;
  company: {
    name: string;
    category: string;
    bio: string;
    mission: string;
    positioning?: string | null;
    tone?: string | null;
    keywords?: string[];
    adThemes?: string[];
  };
}): Promise<RemixOutput> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const { trend, company } = payload;
  const userContent = [
    `Trend ${trend.trendKey} — ${trend.title || trend.caption.slice(0, 80)}`,
    `Platform: ${trend.platform} | Format: ${trend.format} | Creator: ${trend.author}`,
    `Caption: ${trend.caption}`,
    trend.hashtags.length ? `Hashtags: ${trend.hashtags.join(", ")}` : "",
    `Traction: ${trend.views} views, ${trend.likes} likes, engagement ${trend.engagementRate}`,
    trend.sourceUrl ? `Source: ${trend.sourceUrl}` : "",
    "---",
    `Brand: ${company.name}`,
    `Category served: ${company.category}`,
    `Bio: ${company.bio}`,
    `Mission: ${company.mission}`,
    company.positioning ? `Positioning: ${company.positioning}` : "",
    company.tone ? `Tone: ${company.tone}` : "",
    company.keywords?.length ? `Keywords: ${company.keywords.join(", ")}` : "",
    company.adThemes?.length ? `Existing ad themes: ${company.adThemes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`AI gateway failed [${response.status}]: ${body}`);
    throw new Error(`Remix failed [${response.status}].`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = (data.choices?.[0]?.message?.content ?? "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The remix came back unreadable. Try again.");

  const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<RemixOutput>;
  const str = (value: unknown): string => (typeof value === "string" ? value : "");
  return {
    hook: str(parsed.hook),
    script: str(parsed.script),
    caption: str(parsed.caption),
    hashtags: Array.isArray(parsed.hashtags)
      ? parsed.hashtags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.replace(/^#/, "").trim())
          .filter(Boolean)
          .slice(0, 8)
      : [],
    differentiator: str(parsed.differentiator),
  };
}

export async function loadCompanyContext(client: Client, userId: string, companyId: string) {
  const { data, error } = await client
    .from("companies")
    .select("id, name, bio, mission, category_id, categories(name)")
    .eq("id", companyId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Company not found.");

  const { data: insight } = await client
    .from("company_insights")
    .select("positioning, tone, keywords, ad_themes")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    name: data.name,
    bio: data.bio,
    mission: data.mission,
    category: (data.categories as { name: string } | null)?.name ?? "Consumer products",
    positioning: insight?.positioning ?? null,
    tone: insight?.tone ?? null,
    keywords: insight?.keywords ?? [],
    adThemes: insight?.ad_themes ?? [],
  };
}

export async function saveRemix(
  client: Client,
  userId: string,
  input: {
    companyId: string;
    trend: TrendDTO;
    output: RemixOutput;
  },
): Promise<RemixDTO> {
  const { data, error } = await client
    .from("company_remixes")
    .insert({
      company_id: input.companyId,
      owner_id: userId,
      trend_key: input.trend.trendKey,
      trend_title: input.trend.title || input.trend.caption.slice(0, 120),
      source_url: input.trend.sourceUrl,
      platform: input.trend.platform,
      hook: input.output.hook,
      script: input.output.script,
      caption: input.output.caption,
      hashtags: input.output.hashtags,
      differentiator: input.output.differentiator,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return toRemix(data);
}

/**
 * Word-of-mouth rows can be remixed too. They are mapped onto the TrendDTO
 * shape so the same prompt/pipeline handles Reddit chatter and TikTok clips.
 */
export async function getWomAsTrend(client: Client, womKey: string): Promise<TrendDTO | null> {
  const { data, error } = await client
    .from("word_of_mouth")
    .select(
      "wom_key, platform, title, content, hashtags, theme, source_url, author, views, likes, engagement_rate, buzz_score",
    )
    .eq("wom_key", womKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    trendKey: data.wom_key,
    platform: data.platform,
    title: data.title,
    caption: data.content,
    hashtags: data.hashtags ?? [],
    format: data.theme || "word of mouth",
    sourceUrl: data.source_url,
    author: data.author,
    views: Number(data.views ?? 0),
    likes: Number(data.likes ?? 0),
    engagementRate: Number(data.engagement_rate ?? 0),
    trendScore: Number(data.buzz_score ?? 0),
    relevanceRank: 1,
  };
}

/**
 * Same insert as saveRemix, but chatter sources are stored with a null
 * trend_key because that column is a foreign key into `trends`.
 */
export async function saveSourcedRemix(
  client: Client,
  userId: string,
  input: {
    companyId: string;
    kind: "video" | "chatter";
    trend: TrendDTO;
    output: RemixOutput;
  },
): Promise<RemixDTO> {
  const { data, error } = await client
    .from("company_remixes")
    .insert({
      company_id: input.companyId,
      owner_id: userId,
      trend_key: input.kind === "video" ? input.trend.trendKey : null,
      trend_title: input.trend.title || input.trend.caption.slice(0, 120),
      source_url: input.trend.sourceUrl,
      platform: input.trend.platform,
      hook: input.output.hook,
      script: input.output.script,
      caption: input.output.caption,
      hashtags: input.output.hashtags,
      differentiator: input.output.differentiator,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toRemix(data);
}
