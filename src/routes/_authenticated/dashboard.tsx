import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { deleteCompany, listMyCompanies } from "@/lib/owner.functions";
import { runEnrichment } from "@/lib/enrich.functions";
import { getRecommendations } from "@/lib/recommendations.functions";
import { getTrendIndexStatus } from "@/lib/trend-embeddings.functions";
import { BrandLogo } from "@/components/BrandLogo";
import { TrendPreview } from "@/components/TrendPreview";
import { Eyebrow, Lead, PageShell, PageTitle, Panel } from "@/components/Page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Brand dashboard — Vira" },
      {
        name: "description",
        content: "Manage your company listings and run advertising-signal enrichment.",
      },
      { property: "og:title", content: "Brand dashboard — Vira" },
      { property: "og:description", content: "Manage listings and brand enrichment." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

const statusCopy: Record<string, string> = {
  queued: "Signals queued",
  running: "Reading brand…",
  done: "Signals ready",
  failed: "Signals failed",
};

const solid =
  "rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60";
const outline =
  "rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-ring";
const quiet =
  "rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground";

function Dashboard() {
  const queryClient = useQueryClient();
  const fetchCompanies = useServerFn(listMyCompanies);
  const enrich = useServerFn(runEnrichment);
  const removeCompany = useServerFn(deleteCompany);

  const { data, isLoading } = useQuery({
    queryKey: ["my-companies"],
    queryFn: () => fetchCompanies(),
  });

  const fetchRecommendations = useServerFn(getRecommendations);
  const fetchIndexStatus = useServerFn(getTrendIndexStatus);
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId && data?.length) setFocusId(data[0]!.id);
  }, [data, focusId]);

  const trends = useQuery({
    queryKey: ["dashboard-trends", focusId],
    queryFn: () => fetchRecommendations({ data: { companyId: focusId!, limit: 6 } }),
    enabled: !!focusId,
  });

  const indexStatus = useQuery({
    queryKey: ["trend-index-status"],
    queryFn: () => fetchIndexStatus(),
  });

  const focusCompany = data?.find((company) => company.id === focusId) ?? null;
  const semanticCount = (trends.data ?? []).filter((t) => t.matchType === "semantic").length;



  const enrichMutation = useMutation({
    mutationFn: (companyId: string) => enrich({ data: { companyId } }),
    onSuccess: (insight) => {
      void queryClient.invalidateQueries({ queryKey: ["my-companies"] });
      if (insight.status === "failed") {
        toast.error(insight.error ?? "Enrichment failed.");
      } else {
        toast.success("Brand signals refreshed.");
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Enrichment failed."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeCompany({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-companies"] });
      toast.success("Listing removed.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Delete failed."),
  });

  return (
    <PageShell>
      <Eyebrow>Brand dashboard</Eyebrow>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <PageTitle>Your companies</PageTitle>
          <Lead className="mt-4">
            One owner, many companies. Each company keeps its own purpose identity.
          </Lead>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link to="/remix" className={outline}>
            Remix studio
          </Link>
          <Link to="/studio/new" className={solid}>
            List a company
          </Link>
        </div>
      </div>

      <div className="mt-12 space-y-6">
        {isLoading ? (
          <>
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
          </>
        ) : (data ?? []).length === 0 ? (
          <Panel className="p-12 text-center">
            <p className="text-base text-muted-foreground">
              No listings yet. Complete the company sign-up to appear on the marketplace.
            </p>
            <Link to="/studio/new" className={cn(solid, "mt-6 inline-block")}>
              List a company
            </Link>
          </Panel>
        ) : (
          (data ?? []).map((company) => (
            <Panel key={company.id} className="flex flex-wrap items-center gap-6 p-6">
              <BrandLogo name={company.name} logoUrl={company.logoUrl} />
              <div className="min-w-56 flex-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                    {company.name}
                  </h2>
                  <span className="rounded-full bg-secondary px-4 py-1.5 text-sm text-foreground">
                    {company.categoryName}
                  </span>
                  <span
                    className={cn(
                      "rounded-full border px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em]",
                      company.insightStatus === "failed"
                        ? "border-destructive text-destructive"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    {company.insightStatus
                      ? (statusCopy[company.insightStatus] ?? company.insightStatus)
                      : "Not enriched"}
                  </span>
                </div>
                <p className="mt-3 text-base text-muted-foreground">{company.bio}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Refresh brand signals re-reads this brand&apos;s website and public ad copy, then
                  rewrites its positioning, tone and keywords — the profile every remix is built on.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={cn(solid, "min-w-[196px] text-center")}
                  onClick={() => enrichMutation.mutate(company.id)}
                  disabled={enrichMutation.isPending}
                  title="Re-scrapes the brand's site and public ads, then updates positioning, tone and keywords used for remixes."
                >
                  {enrichMutation.isPending && enrichMutation.variables === company.id
                    ? "Reading the brand…"
                    : "Refresh brand signals"}
                </button>

                <Link to="/ads" className={outline}>
                  Create ads
                </Link>
                <Link to="/studio/$id" params={{ id: company.id }} className={outline}>
                  Edit
                </Link>
                <Link to="/companies/$slug" params={{ slug: company.slug }} className={quiet}>
                  View
                </Link>
                <button
                  type="button"
                  className={cn(quiet, "text-destructive hover:text-destructive")}
                  onClick={() => deleteMutation.mutate(company.id)}
                  disabled={deleteMutation.isPending}
                >
                  Delete
                </button>
              </div>
            </Panel>
          ))
        )}
      </div>

      {data?.length ? (
        <section className="mt-16">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4 sm:flex sm:justify-between">
            <div className="min-w-0">
              <Eyebrow>Trends matched to you</Eyebrow>
              <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground">
                {focusCompany ? focusCompany.name : "Your brand"} feed
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Pulled live from the retrieval index: each brand profile is embedded as a 1536-dim
                vector and matched by cosine similarity against every scraped post, then blended
                with virality. Category mapping is only the fallback.
              </p>
            </div>
            <Link to="/remix" className={outline}>
              Open remix studio
            </Link>
          </div>

          {data.length > 1 ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {data.map((company) => (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => setFocusId(company.id)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm transition-colors",
                    company.id === focusId
                      ? "border-foreground bg-foreground text-background"
                      : "border-border bg-card text-muted-foreground hover:border-ring",
                  )}
                >
                  {company.name}
                </button>
              ))}
            </div>
          ) : null}

          <Panel className="mt-6 grid gap-6 p-6 sm:grid-cols-3">
            <RagStat
              label="Semantic matches"
              value={`${semanticCount}/${(trends.data ?? []).length || 0}`}
              note="Vector hits vs. category fallback in this feed"
            />
            <RagStat
              label="Index coverage"
              value={
                indexStatus.data ? (indexStatus.data.remaining === 0 ? "Complete" : "Backfilling") : "…"
              }
              note={
                indexStatus.data
                  ? `${indexStatus.data.remaining} posts awaiting embeddings`
                  : "Checking retrieval index"
              }
            />
            <RagStat
              label="Ranking blend"
              value="0.8 / 0.2"
              note="Cosine similarity weighted against trend heat"
            />
          </Panel>

          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {trends.isLoading ? (
              <>
                <Skeleton className="h-72 w-full rounded-2xl" />
                <Skeleton className="h-72 w-full rounded-2xl" />
                <Skeleton className="h-72 w-full rounded-2xl" />
              </>
            ) : (trends.data ?? []).length === 0 ? (
              <Panel className="p-8 sm:col-span-2 lg:col-span-3">
                <p className="text-sm text-muted-foreground">
                  No trends matched yet. Refresh brand signals so the retrieval index can embed this
                  brand&apos;s profile.
                </p>
              </Panel>
            ) : (
              (trends.data ?? []).map((trend) => (
                <Panel key={trend.trendKey} className="overflow-hidden p-0">
                  <TrendPreview
                    sourceUrl={trend.sourceUrl}
                    platform={trend.platform}
                    title={trend.title}
                    className="aspect-[4/3] w-full"
                  />
                  <div className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      <span className="rounded-full border border-border px-3 py-1">
                        {trend.matchType === "semantic"
                          ? `${Math.round(trend.similarity * 100)}% match`
                          : "Category match"}
                      </span>
                      <span className="rounded-full border border-border px-3 py-1">
                        {trend.format}
                      </span>
                    </div>
                    <p className="line-clamp-3 text-sm text-foreground">{trend.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {compact.format(trend.views)} views · {compact.format(trend.likes)} likes ·
                      heat {Math.round(trend.trendScore)}
                    </p>
                  </div>
                </Panel>
              ))
            )}
          </div>
        </section>
      ) : null}

    </PageShell>
  );
}

function RagStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-serif text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
