import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { deleteCompany, listMyCompanies } from "@/lib/owner.functions";
import { runEnrichment } from "@/lib/enrich.functions";
import { BrandLogo } from "@/components/BrandLogo";
import { Eyebrow, Lead, PageShell, PageTitle, Panel } from "@/components/Page";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  queued: "Enrichment queued",
  running: "Enriching…",
  done: "Enriched",
  failed: "Enrichment failed",
};

const solid =
  "rounded-xl bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60";
const outline =
  "rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-ring";
const quiet = "rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground";

function Dashboard() {
  const queryClient = useQueryClient();
  const fetchCompanies = useServerFn(listMyCompanies);
  const enrich = useServerFn(runEnrichment);
  const removeCompany = useServerFn(deleteCompany);

  const { data, isLoading } = useQuery({
    queryKey: ["my-companies"],
    queryFn: () => fetchCompanies(),
  });

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
            Add a company
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
              Start company sign-up
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
                      ? statusCopy[company.insightStatus] ?? company.insightStatus
                      : "Not enriched"}
                  </span>
                </div>
                <p className="mt-3 line-clamp-2 text-base text-muted-foreground">{company.bio}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className={solid}
                  onClick={() => enrichMutation.mutate(company.id)}
                  disabled={enrichMutation.isPending}
                >
                  {enrichMutation.isPending && enrichMutation.variables === company.id
                    ? "Scraping…"
                    : "Run enrichment"}
                </button>
                <Link to="/remix" className={outline}>
                  Remix ads
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
    </PageShell>
  );
}
