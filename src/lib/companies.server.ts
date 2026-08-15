import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createPublicClient } from "./supabase-public.server";
import {
  LOGO_BUCKET,
  type CategoryDTO,
  type CompanyCardDTO,
  type CompanyDetailDTO,
  type InsightDTO,
} from "./company-types";

type Client = SupabaseClient<Database>;

const COMPANY_SELECT =
  "id, name, slug, bio, mission, website, owner_name, logo_url, created_at, categories(name, slug)";

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  bio: string;
  mission: string;
  website: string | null;
  owner_name: string;
  logo_url: string | null;
  created_at: string;
  categories: { name: string; slug: string } | null;
};

export async function signLogo(client: Client, path: string | null): Promise<string | null> {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  const { data } = await client.storage.from(LOGO_BUCKET).createSignedUrl(path, 60 * 60 * 6);
  return data?.signedUrl ?? null;
}

export async function signLogos(
  client: Client,
  paths: (string | null)[],
): Promise<(string | null)[]> {
  return Promise.all(paths.map((path) => signLogo(client, path)));
}

function toCard(row: CompanyRow, logoUrl: string | null): CompanyCardDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio,
    ownerName: row.owner_name,
    categoryName: row.categories?.name ?? "Uncategorized",
    categorySlug: row.categories?.slug ?? "",
    logoUrl,
    website: row.website,
  };
}

export async function fetchCategories(): Promise<CategoryDTO[]> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("categories")
    .select("id, name, slug, description")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function fetchCompanies(input: {
  categorySlug?: string | undefined;
  search?: string | undefined;
  limit?: number | undefined;
}): Promise<CompanyCardDTO[]> {
  const client = createPublicClient();
  let query = client
    .from("companies")
    .select(COMPANY_SELECT)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(input.limit ?? 60);

  if (input.categorySlug) query = query.eq("categories.slug", input.categorySlug);
  if (input.search) query = query.ilike("name", `%${input.search}%`);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as CompanyRow[]).filter((row) =>
    input.categorySlug ? row.categories?.slug === input.categorySlug : true,
  );
  const logos = await signLogos(client, rows.map((row) => row.logo_url));
  return rows.map((row, index) => toCard(row, logos[index] ?? null));
}

export function mapInsight(row: {
  id: string;
  status: string;
  error: string | null;
  summary: string | null;
  positioning: string | null;
  tone: string | null;
  keywords: string[];
  ad_themes: string[];
  brand_colors: string[];
  sources: unknown;
  updated_at: string;
}): InsightDTO {
  return {
    id: row.id,
    status: row.status as InsightDTO["status"],
    error: row.error,
    summary: row.summary,
    positioning: row.positioning,
    tone: row.tone,
    keywords: row.keywords ?? [],
    adThemes: row.ad_themes ?? [],
    brandColors: row.brand_colors ?? [],
    sources: Array.isArray(row.sources) ? (row.sources as InsightDTO["sources"]) : [],
    updatedAt: row.updated_at,
  };
}

export async function fetchCompanyBySlug(
  slug: string,
): Promise<{ company: CompanyDetailDTO; insight: InsightDTO | null } | null> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("companies")
    .select(COMPANY_SELECT)
    .eq("status", "published")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as unknown as CompanyRow;
  const logoUrl = await signLogo(client, row.logo_url);

  const { data: insightRow } = await client
    .from("company_insights")
    .select(
      "id, status, error, summary, positioning, tone, keywords, ad_themes, brand_colors, sources, updated_at",
    )
    .eq("company_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    company: { ...toCard(row, logoUrl), mission: row.mission, createdAt: row.created_at },
    insight: insightRow ? mapInsight(insightRow) : null,
  };
}

export async function fetchCategoryBySlug(slug: string): Promise<CategoryDTO | null> {
  const client = createPublicClient();
  const { data, error } = await client
    .from("categories")
    .select("id, name, slug, description")
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}
