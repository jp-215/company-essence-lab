import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { deleteCompany, listMyCompanies } from "@/lib/owner.functions";
import { runEnrichment } from "@/lib/enrich.functions";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
            Your companies
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One owner, many companies. Each company keeps its own purpose identity.
          </p>
        </div>
        <Button asChild>
          <Link to="/studio/new">Add a company</Link>
        </Button>
      </div>

      <div className="mt-8 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : (data ?? []).length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                No listings yet. Complete the company sign-up to appear on the marketplace.
              </p>
              <Button asChild className="mt-4">
                <Link to="/studio/new">Start company sign-up</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          (data ?? []).map((company) => (
            <Card key={company.id}>
              <CardContent className="flex flex-wrap items-center gap-4 py-5">
                <BrandLogo name={company.name} logoUrl={company.logoUrl} />
                <div className="min-w-48 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium text-foreground">{company.name}</h2>
                    <Badge variant="secondary">{company.categoryName}</Badge>
                    {company.insightStatus ? (
                      <Badge variant={company.insightStatus === "failed" ? "destructive" : "outline"}>
                        {statusCopy[company.insightStatus] ?? company.insightStatus}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Not enriched</Badge>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{company.bio}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => enrichMutation.mutate(company.id)}
                    disabled={enrichMutation.isPending}
                  >
                    {enrichMutation.isPending && enrichMutation.variables === company.id
                      ? "Scraping…"
                      : "Run enrichment"}
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/studio/$id" params={{ id: company.id }}>
                      Edit
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/companies/$slug" params={{ slug: company.slug }}>
                      View
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => deleteMutation.mutate(company.id)}
                    disabled={deleteMutation.isPending}
                  >
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
