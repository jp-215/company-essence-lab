import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { listMyCompanies } from "@/lib/owner.functions";
import {
  generateRemix,
  listCompanyPrescripts,
  listCompanyRemixes,
} from "@/lib/remix.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/remix")({
  head: () => ({
    meta: [
      { title: "Remix studio — Vira" },
      {
        name: "description",
        content:
          "Remix trending ad prescripts mapped to your category into shoot-ready ads for your brand.",
      },
      { property: "og:title", content: "Remix studio — Vira" },
      {
        property: "og:description",
        content: "Turn trending ad formats into your own version in one click.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RemixStudio,
});

function RemixStudio() {
  const queryClient = useQueryClient();
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchPrescripts = useServerFn(listCompanyPrescripts);
  const fetchRemixes = useServerFn(listCompanyRemixes);
  const runRemix = useServerFn(generateRemix);

  const [companyId, setCompanyId] = useState<string | null>(null);

  const companies = useQuery({ queryKey: ["my-companies"], queryFn: () => fetchCompanies() });

  useEffect(() => {
    if (!companyId && companies.data?.length) {
      setCompanyId(companies.data[0]!.id);
    }
  }, [companies.data, companyId]);

  const prescripts = useQuery({
    queryKey: ["prescripts", companyId],
    queryFn: () => fetchPrescripts({ data: { companyId: companyId!, limit: 24 } }),
    enabled: Boolean(companyId),
  });

  const remixes = useQuery({
    queryKey: ["remixes", companyId],
    queryFn: () => fetchRemixes({ data: { companyId: companyId! } }),
    enabled: Boolean(companyId),
  });

  const remixMutation = useMutation({
    mutationFn: (prescriptKey: string) => runRemix({ data: { companyId: companyId!, prescriptKey } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["remixes", companyId] });
      toast.success("Your version is ready.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Remix failed."),
  });

  const selectedCompany = companies.data?.find((company) => company.id === companyId) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <header className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Remix studio</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-foreground">
          Trending ad formats, rewritten as yours
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Vira keeps a library of 100 prescripts — the ad structures winning right now on TikTok,
          Instagram, YouTube and Facebook. Each one is mapped to the categories it performs in, so
          you only see the formats that fit the category your brand serves. Pick one and Vira
          rewrites it around your mission, positioning and proof.
        </p>
      </header>

      {companies.isLoading ? (
        <Skeleton className="mt-8 h-24 w-full" />
      ) : !companies.data?.length ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              List a company first — the mapping runs off the category it serves.
            </p>
            <Button asChild size="sm">
              <Link to="/studio/new">List a company</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-8 flex flex-wrap gap-2">
            {companies.data.map((company) => (
              <Button
                key={company.id}
                variant={company.id === companyId ? "default" : "outline"}
                size="sm"
                onClick={() => setCompanyId(company.id)}
              >
                {company.name}
              </Button>
            ))}
          </div>

          {selectedCompany ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Mapped through category:{" "}
              <span className="font-medium text-foreground">{selectedCompany.categoryName}</span>
            </p>
          ) : null}

          <section className="mt-10">
            <h2 className="font-serif text-2xl font-semibold tracking-tight">
              Prescripts mapped to your category
            </h2>
            {prescripts.isLoading ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-52 w-full" />
                ))}
              </div>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(prescripts.data ?? []).map((prescript) => (
                  <Card key={prescript.prescriptKey} className="flex h-full flex-col">
                    <CardContent className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {prescript.prescriptKey}
                        </span>
                        <Badge variant="outline">{prescript.platform}</Badge>
                      </div>
                      <h3 className="font-medium leading-snug text-foreground">{prescript.title}</h3>
                      <p className="text-sm italic text-muted-foreground">“{prescript.hook}”</p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {prescript.rationale}
                      </p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        <span className="text-xs text-muted-foreground">
                          Trend {Math.round(prescript.trendScore * 100)}
                        </span>
                        <Button
                          size="sm"
                          disabled={remixMutation.isPending}
                          onClick={() => remixMutation.mutate(prescript.prescriptKey)}
                        >
                          {remixMutation.isPending &&
                          remixMutation.variables === prescript.prescriptKey
                            ? "Remixing…"
                            : "Remix for us"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>

          <section className="mt-14">
            <h2 className="font-serif text-2xl font-semibold tracking-tight">Your remixes</h2>
            {remixes.isLoading ? (
              <Skeleton className="mt-4 h-40 w-full" />
            ) : !remixes.data?.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No remixes yet. Pick a prescript above to generate your first ad.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {remixes.data.map((remix) => (
                  <Card key={remix.id}>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {remix.prescriptKey}
                        </span>
                        <Badge variant="outline">{remix.platform}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(remix.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="font-serif text-lg font-semibold leading-snug">{remix.hook}</p>
                      <pre className="whitespace-pre-wrap rounded-md bg-secondary/60 p-4 text-sm leading-relaxed text-foreground">
                        {remix.script}
                      </pre>
                      {remix.caption ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Caption: </span>
                          {remix.caption}
                        </p>
                      ) : null}
                      {remix.differentiator ? (
                        <p className="text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">Why it differentiates: </span>
                          {remix.differentiator}
                        </p>
                      ) : null}
                      {remix.hashtags.length ? (
                        <div className="flex flex-wrap gap-2">
                          {remix.hashtags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              #{tag}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
