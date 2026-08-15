import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { upsertKnowledge } from "./knowledge.server";

type Client = SupabaseClient<Database>;

/** Refreshes one company's knowledge entry from its current profile + latest insight. */
export async function indexCompanyKnowledge(
  client: Client,
  userId: string,
  companyId: string,
): Promise<void> {
  const { data, error } = await client
    .from("companies")
    .select("id, name, owner_name, bio, mission, categories(name)")
    .eq("id", companyId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error || !data) return;

  const company = data as unknown as {
    id: string;
    name: string;
    owner_name: string;
    bio: string;
    mission: string;
    categories: { name: string } | null;
  };

  const { data: insight } = await client
    .from("company_insights")
    .select("summary, positioning, tone, keywords, ad_themes")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

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
