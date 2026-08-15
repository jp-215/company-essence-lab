import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Client = SupabaseClient<Database>;

export type KnowledgeEntryDTO = {
  companyId: string;
  slug: string;
  companyName: string;
  ownerName: string;
  categoryName: string;
  bio: string;
  mission: string;
  positioning: string;
  tone: string;
  summary: string;
  keywords: string[];
  adThemes: string[];
  isMine: boolean;
  indexed: boolean;
  updatedAt: string;
};

export type SimilarBrandDTO = {
  companyId: string;
  companyName: string;
  slug: string;
  categoryName: string;
  summary: string;
  positioning: string;
  similarity: number;
};

const EMBEDDING_MODEL = "google/gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 1536;

export async function embedText(input: string): Promise<number[] | null> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return null;

  const response = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: input.slice(0, 8000),
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    console.error(`Embedding failed [${response.status}]: ${await response.text()}`);
    return null;
  }

  const payload = (await response.json()) as { data?: { embedding?: number[] }[] };
  const vector = payload.data?.[0]?.embedding;
  return Array.isArray(vector) && vector.length === EMBEDDING_DIMENSIONS ? vector : null;
}

export type KnowledgeSource = {
  companyId: string;
  ownerId: string;
  companyName: string;
  ownerName: string;
  categoryName: string;
  bio: string;
  mission: string;
  positioning?: string | null;
  tone?: string | null;
  summary?: string | null;
  keywords?: string[];
  adThemes?: string[];
};

export function buildKnowledgeText(source: KnowledgeSource): string {
  return [
    `Company: ${source.companyName}`,
    `Owner: ${source.ownerName}`,
    `Category: ${source.categoryName}`,
    `Who they are (bio): ${source.bio}`,
    `Mission / intention: ${source.mission}`,
    source.positioning ? `Positioning: ${source.positioning}` : "",
    source.tone ? `Brand tone: ${source.tone}` : "",
    source.summary ? `Summary: ${source.summary}` : "",
    source.keywords?.length ? `Keywords: ${source.keywords.join(", ")}` : "",
    source.adThemes?.length ? `Ad themes: ${source.adThemes.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Writes (or refreshes) the knowledge-base entry for one company. Never throws. */
export async function upsertKnowledge(client: Client, source: KnowledgeSource): Promise<void> {
  try {
    const content = buildKnowledgeText(source);
    const embedding = await embedText(content);

    const { error } = await client.from("company_knowledge").upsert(
      {
        company_id: source.companyId,
        owner_id: source.ownerId,
        company_name: source.companyName,
        owner_name: source.ownerName,
        category_name: source.categoryName,
        bio: source.bio,
        mission: source.mission,
        positioning: source.positioning ?? "",
        tone: source.tone ?? "",
        summary: source.summary ?? "",
        keywords: source.keywords ?? [],
        ad_themes: source.adThemes ?? [],
        content,
        embedding: embedding ? JSON.stringify(embedding) : null,
      },
      { onConflict: "company_id" },
    );
    if (error) console.error(`Knowledge upsert failed: ${error.message}`);
  } catch (error) {
    console.error("Knowledge upsert threw", error);
  }
}

type KnowledgeRow = {
  company_id: string;
  company_name: string;
  owner_name: string;
  owner_id: string;
  category_name: string;
  bio: string;
  mission: string;
  positioning: string;
  tone: string;
  summary: string;
  keywords: string[];
  ad_themes: string[];
  embedding: string | null;
  updated_at: string;
  companies: { slug: string; status: string } | null;
};

const KNOWLEDGE_SELECT =
  "company_id, company_name, owner_name, owner_id, category_name, bio, mission, positioning, tone, summary, keywords, ad_themes, embedding, updated_at, companies(slug, status)";

function toEntry(row: KnowledgeRow, userId: string): KnowledgeEntryDTO {
  return {
    companyId: row.company_id,
    slug: row.companies?.slug ?? "",
    companyName: row.company_name,
    ownerName: row.owner_name,
    categoryName: row.category_name,
    bio: row.bio,
    mission: row.mission,
    positioning: row.positioning,
    tone: row.tone,
    summary: row.summary,
    keywords: row.keywords ?? [],
    adThemes: row.ad_themes ?? [],
    isMine: row.owner_id === userId,
    indexed: Boolean(row.embedding),
    updatedAt: row.updated_at,
  };
}

export async function listKnowledge(
  client: Client,
  userId: string,
  search?: string,
): Promise<KnowledgeEntryDTO[]> {
  let query = client
    .from("company_knowledge")
    .select(KNOWLEDGE_SELECT)
    .order("company_name")
    .limit(200);

  if (search && search.trim()) {
    const term = search.trim().replace(/[%,]/g, " ");
    query = query.or(
      `company_name.ilike.%${term}%,owner_name.ilike.%${term}%,content.ilike.%${term}%`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as KnowledgeRow[]).map((row) => toEntry(row, userId));
}

export async function semanticSearch(
  client: Client,
  query: string,
  limit = 6,
  excludeCompanyId?: string,
): Promise<SimilarBrandDTO[]> {
  const embedding = await embedText(query);
  if (!embedding) return [];

  const { data, error } = await client.rpc("match_company_knowledge", {
    query_embedding: JSON.stringify(embedding),
    match_count: limit,
    ...(excludeCompanyId ? { exclude_company: excludeCompanyId } : {}),
  });
  if (error) {
    console.error(`Semantic search failed: ${error.message}`);
    return [];
  }

  return (data ?? []).map((row) => ({
    companyId: row.company_id,
    companyName: row.company_name,
    slug: row.slug,
    categoryName: row.category_name,
    summary: row.summary,
    positioning: row.positioning,
    similarity: Number(row.similarity ?? 0),
  }));
}

/** Rebuilds knowledge entries for every company owned by the signed-in user. */
export async function syncOwnedKnowledge(
  client: Client,
  userId: string,
): Promise<{ synced: number }> {
  const { data, error } = await client
    .from("companies")
    .select("id, name, owner_name, bio, mission, categories(name)")
    .eq("owner_id", userId);
  if (error) throw new Error(error.message);

  const companies = (data ?? []) as unknown as {
    id: string;
    name: string;
    owner_name: string;
    bio: string;
    mission: string;
    categories: { name: string } | null;
  }[];
  if (companies.length === 0) return { synced: 0 };

  const { data: insights } = await client
    .from("company_insights")
    .select("company_id, summary, positioning, tone, keywords, ad_themes, created_at")
    .in(
      "company_id",
      companies.map((company) => company.id),
    )
    .order("created_at", { ascending: false });

  const latest = new Map<string, NonNullable<typeof insights>[number]>();
  for (const insight of insights ?? []) {
    if (!latest.has(insight.company_id)) latest.set(insight.company_id, insight);
  }

  for (const company of companies) {
    const insight = latest.get(company.id);
    await upsertKnowledge(client, {
      companyId: company.id,
      ownerId: userId,
      companyName: company.name,
      ownerName: company.owner_name,
      categoryName: company.categories?.name ?? "Consumer products",
      bio: company.bio,
      mission: company.mission,
      positioning: insight?.positioning ?? "",
      tone: insight?.tone ?? "",
      summary: insight?.summary ?? "",
      keywords: insight?.keywords ?? [],
      adThemes: insight?.ad_themes ?? [],
    });
  }

  return { synced: companies.length };
}
