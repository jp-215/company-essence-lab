import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { PrescriptDTO, RemixDTO } from "./remix-types";

type Client = SupabaseClient<Database>;

/**
 * Mapping protocol: company -> category (company.category_id) -> category_prescripts
 * -> prescripts, joined on the prescript primary identifier key.
 */
export async function listMappedPrescripts(
  client: Client,
  companyId: string,
  limit = 24,
): Promise<PrescriptDTO[]> {
  const { data, error } = await client.rpc("company_prescripts", {
    _company_id: companyId,
    _limit: limit,
  });
  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    prescriptKey: row.prescript_key,
    title: row.title,
    platform: row.platform,
    format: row.format,
    angle: row.angle,
    hook: row.hook,
    rationale: row.rationale,
    script: row.script,
    cta: row.cta,
    trendScore: Number(row.trend_score ?? 0),
    relevanceRank: Number(row.relevance_rank ?? 1),
  }));
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

  return (data ?? []).map((row) => ({
    id: row.id,
    companyId: row.company_id,
    prescriptKey: row.prescript_key,
    platform: row.platform,
    hook: row.hook,
    script: row.script,
    caption: row.caption,
    hashtags: row.hashtags ?? [],
    differentiator: row.differentiator,
    createdAt: row.created_at,
  }));
}

export type RemixOutput = {
  hook: string;
  script: string;
  caption: string;
  hashtags: string[];
  differentiator: string;
};

const SYSTEM_PROMPT = `You are Vira, a viral-ad remix engine for early-stage B2B and consumer brands.
Given a general-purpose ad prescript plus one brand's identity, rewrite the prescript as a
shoot-ready ad the brand can film today. Differentiate them from bigger competitors: lean on their
mission, category and specific proof, never generic hype. Return ONLY JSON:
{"hook": string (one line, under 90 chars),
 "script": string (timestamped beats, one per line, 25-35 seconds total, includes shot directions),
 "caption": string (platform caption, 1-2 sentences plus CTA),
 "hashtags": string[] (4-8 lowercase tags, no # symbol),
 "differentiator": string (1 sentence: how this ad separates them from category incumbents)}`;

export async function remixPrescript(payload: {
  prescript: PrescriptDTO;
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

  const { prescript, company } = payload;
  const userContent = [
    `Prescript ${prescript.prescriptKey} — ${prescript.title}`,
    `Platform: ${prescript.platform} | Format: ${prescript.format} | Angle: ${prescript.angle}`,
    `Why it works: ${prescript.rationale}`,
    `Original hook: ${prescript.hook}`,
    `Original beats:\n${prescript.script}`,
    `Original CTA: ${prescript.cta}`,
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
    prescriptKey: string;
    platform: string;
    output: RemixOutput;
  },
): Promise<RemixDTO> {
  const { data, error } = await client
    .from("company_remixes")
    .insert({
      company_id: input.companyId,
      owner_id: userId,
      prescript_key: input.prescriptKey,
      platform: input.platform,
      hook: input.output.hook,
      script: input.output.script,
      caption: input.output.caption,
      hashtags: input.output.hashtags,
      differentiator: input.output.differentiator,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  return {
    id: data.id,
    companyId: data.company_id,
    prescriptKey: data.prescript_key,
    platform: data.platform,
    hook: data.hook,
    script: data.script,
    caption: data.caption,
    hashtags: data.hashtags ?? [],
    differentiator: data.differentiator,
    createdAt: data.created_at,
  };
}
