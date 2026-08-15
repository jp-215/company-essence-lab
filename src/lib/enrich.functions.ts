import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import { mapInsight } from "./companies.server";
import { analyzeBrand, scrapeSite, type SiteSnapshot } from "./enrich.server";
import { upsertKnowledge } from "./knowledge.server";

const INSIGHT_SELECT =
  "id, status, error, summary, positioning, tone, keywords, ad_themes, brand_colors, sources, updated_at";

export const getMyInsight = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("company_insights")
      .select(INSIGHT_SELECT)
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row ? mapInsight(row) : null;
  });

export const runEnrichment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, name, owner_name, bio, mission, website, categories(name)")
      .eq("id", data.companyId)
      .eq("owner_id", userId)
      .maybeSingle();
    if (companyError) throw new Error(companyError.message);
    if (!company) throw new Error("Company not found.");

    const { data: existing } = await supabase
      .from("company_insights")
      .select("id")
      .eq("company_id", company.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let insightId = existing?.id ?? null;
    if (insightId) {
      await supabase
        .from("company_insights")
        .update({ status: "running", error: null })
        .eq("id", insightId);
    } else {
      const { data: created, error: createError } = await supabase
        .from("company_insights")
        .insert({ company_id: company.id, status: "running" })
        .select("id")
        .single();
      if (createError) throw new Error(createError.message);
      insightId = created.id;
    }

    const categoryName =
      (company as unknown as { categories: { name: string } | null }).categories?.name ??
      "Consumer products";

    try {
      let site: SiteSnapshot | null = null;
      if (company.website) {
        site = await scrapeSite(company.website);
      }

      const analysis = await analyzeBrand({
        name: company.name,
        bio: company.bio,
        mission: company.mission,
        category: categoryName,
        site,
      });

      const sources = site
        ? [{ title: site.title || site.url, url: site.url }, ...site.links.slice(0, 5)]
        : [];

      const { data: row, error: updateError } = await supabase
        .from("company_insights")
        .update({
          status: "done",
          error: null,
          summary: analysis.summary,
          positioning: analysis.positioning,
          tone: analysis.tone,
          keywords: analysis.keywords,
          ad_themes: analysis.adThemes,
          brand_colors: site?.colors ?? [],
          sources,
          raw: site ? { title: site.title, description: site.description, url: site.url } : null,
        })
        .eq("id", insightId)
        .select(INSIGHT_SELECT)
        .single();
      if (updateError) throw new Error(updateError.message);

      await upsertKnowledge(supabase, {
        companyId: company.id,
        ownerId: userId,
        companyName: company.name,
        ownerName: (company as unknown as { owner_name?: string }).owner_name ?? "",
        categoryName,
        bio: company.bio,
        mission: company.mission,
        positioning: analysis.positioning,
        tone: analysis.tone,
        summary: analysis.summary,
        keywords: analysis.keywords,
        adThemes: analysis.adThemes,
      });

      return mapInsight(row);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Enrichment failed.";
      const { data: row } = await supabase
        .from("company_insights")
        .update({ status: "failed", error: message })
        .eq("id", insightId)
        .select(INSIGHT_SELECT)
        .single();
      if (row) return mapInsight(row);
      throw new Error(message);
    }
  });
