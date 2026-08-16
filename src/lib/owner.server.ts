import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { signLogo, signLogos } from "./companies.server";
import { slugify, type OwnerCompanyDTO } from "./company-types";

type Client = SupabaseClient<Database>;

const OWNER_SELECT =
  "id, name, slug, bio, mission, website, owner_name, logo_url, status, category_id, categories(name, slug)";

type OwnerRow = {
  id: string;
  name: string;
  slug: string;
  bio: string;
  mission: string;
  website: string | null;
  owner_name: string;
  logo_url: string | null;
  status: string;
  category_id: string;
  categories: { name: string; slug: string } | null;
};

function toOwnerDTO(
  row: OwnerRow,
  logoUrl: string | null,
  insightStatus: OwnerCompanyDTO["insightStatus"],
): OwnerCompanyDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    bio: row.bio,
    mission: row.mission,
    website: row.website,
    ownerName: row.owner_name,
    categoryId: row.category_id,
    categoryName: row.categories?.name ?? "Uncategorized",
    categorySlug: row.categories?.slug ?? "",
    logoPath: row.logo_url,
    logoUrl,
    status: row.status === "draft" ? "draft" : "published",
    insightStatus,
  };
}

export async function listOwnedCompanies(
  client: Client,
  userId: string,
): Promise<OwnerCompanyDTO[]> {
  const { data, error } = await client
    .from("companies")
    .select(OWNER_SELECT)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as OwnerRow[];
  if (rows.length === 0) return [];

  const { data: insights } = await client
    .from("company_insights")
    .select("company_id, status, created_at")
    .in(
      "company_id",
      rows.map((row) => row.id),
    )
    .order("created_at", { ascending: false });

  const latest = new Map<string, OwnerCompanyDTO["insightStatus"]>();
  for (const insight of insights ?? []) {
    if (!latest.has(insight.company_id)) {
      latest.set(insight.company_id, insight.status as OwnerCompanyDTO["insightStatus"]);
    }
  }

  const logos = await signLogos(
    client,
    rows.map((row) => row.logo_url),
  );
  return rows.map((row, index) =>
    toOwnerDTO(row, logos[index] ?? null, latest.get(row.id) ?? null),
  );
}

export async function getOwnedCompany(
  client: Client,
  userId: string,
  id: string,
): Promise<OwnerCompanyDTO | null> {
  const { data, error } = await client
    .from("companies")
    .select(OWNER_SELECT)
    .eq("owner_id", userId)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as unknown as OwnerRow;
  return toOwnerDTO(row, await signLogo(client, row.logo_url), null);
}

async function uniqueSlug(client: Client, name: string, ignoreId?: string): Promise<string> {
  const base = slugify(name) || "company";
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    let query = client.from("companies").select("id").eq("slug", candidate);
    if (ignoreId) query = query.neq("id", ignoreId);
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export type CompanyInput = {
  name: string;
  ownerName: string;
  categoryId: string;
  bio: string;
  mission: string;
  website?: string | null | undefined;
  logoPath?: string | null | undefined;
};

function friendlyError(message: string): string {
  if (message.includes("companies_name_unique_idx")) {
    return "A company with that name already exists on the marketplace.";
  }
  return message;
}

export async function insertCompany(
  client: Client,
  userId: string,
  input: CompanyInput,
): Promise<{ id: string; slug: string }> {
  const slug = await uniqueSlug(client, input.name);
  const { data, error } = await client
    .from("companies")
    .insert({
      owner_id: userId,
      category_id: input.categoryId,
      name: input.name.trim(),
      slug,
      owner_name: input.ownerName.trim(),
      bio: input.bio.trim(),
      mission: input.mission.trim(),
      website: input.website?.trim() || null,
      logo_url: input.logoPath ?? null,
      status: "published",
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(friendlyError(error.message));
  return data;
}

export async function updateCompanyRow(
  client: Client,
  userId: string,
  id: string,
  input: CompanyInput,
): Promise<{ id: string; slug: string }> {
  const existing = await getOwnedCompany(client, userId, id);
  if (!existing) throw new Error("Company not found.");
  const slug =
    existing.name.trim().toLowerCase() === input.name.trim().toLowerCase()
      ? existing.slug
      : await uniqueSlug(client, input.name, id);

  const { data, error } = await client
    .from("companies")
    .update({
      category_id: input.categoryId,
      name: input.name.trim(),
      slug,
      owner_name: input.ownerName.trim(),
      bio: input.bio.trim(),
      mission: input.mission.trim(),
      website: input.website?.trim() || null,
      logo_url: input.logoPath ?? null,
    })
    .eq("id", id)
    .eq("owner_id", userId)
    .select("id, slug")
    .single();
  if (error) throw new Error(friendlyError(error.message));
  return data;
}

export async function deleteCompanyRow(client: Client, userId: string, id: string): Promise<void> {
  const { error } = await client.from("companies").delete().eq("id", id).eq("owner_id", userId);
  if (error) throw new Error(error.message);
}
