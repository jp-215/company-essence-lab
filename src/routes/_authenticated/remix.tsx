import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { listMyCompanies } from "@/lib/owner.functions";
import { generateRemix, listCompanyRemixes, listCompanyTrends } from "@/lib/remix.functions";
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
          "Remix real trending posts mapped to your category into shoot-ready ads for your brand.",
      },
      { property: "og:title", content: "Remix studio — Vira" },
      {
        property: "og:description",
        content: "Turn live viral trends into your own version in one click.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RemixStudio,
});

const compact = new Intl.NumberFormat("en", { notation: "compact" });

function RemixStudio() {
  const queryClient = useQueryClient();
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchTrends = useServerFn(listCompanyTrends);
  const fetchRemixes = useServerFn(listCompanyRemixes);
  const runRemix = useServerFn(generateRemix);

  const [companyId, setCompanyId] = useState<string | null>(null);

  const companies = useQuery({ queryKey: ["my-companies"], queryFn: () => fetchCompanies() });

  useEffect(() => {
    if (!companyId && companies.data?.length) {
      setCompanyId(companies.data[0]!.id);
    }
  }, [companies.data, companyId]);

  const trends = useQuery({
    queryKey: ["company-trends", companyId],
    queryFn: () => fetchTrends({ data: { companyId: companyId!, limit: 24 } }),
    enabled: Boolean(companyId),
  });

  const remixes = useQuery({
    queryKey: ["remixes", companyId],
    queryFn: () => fetchRemixes({ data: { companyId: companyId! } }),
    enabled: Boolean(companyId),
  });

  const remixMutation = useMutation({
    mutationFn: (trendKey: string) => runRemix({ data: { companyId: companyId!, trendKey } }),
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
          Live trends, rewritten as yours
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Vira tracks ~3,000 real posts trending across social right now. Each one is mapped to the
          categories it performs in, so you only see trends that fit the category your brand serves.
          Pick one and Vira rewrites it around your mission, positioning and proof.
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
              Trends mapped to your category
            </h2>
            {trends.isLoading ? (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-52 w-full" />
                ))}
              </div>
            ) : !trends.data?.length ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No trends mapped to this category yet.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {trends.data.map((trend) => (
                  <Card key={trend.trendKey} className="flex h-full flex-col">
                    <CardContent className="flex flex-1 flex-col gap-3 p-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {trend.trendKey}
                        </span>
                        <Badge variant="outline">{trend.platform}</Badge>
                      </div>
                      <h3 className="line-clamp-2 font-medium leading-snug text-foreground">
                        {trend.title || trend.caption.slice(0, 70)}
                      </h3>
                      <p className="line-clamp-3 text-sm text-muted-foreground">{trend.caption}</p>
                      <div className="flex flex-wrap gap-2">
                        {trend.format ? <Badge variant="secondary">{trend.format}</Badge> : null}
                        {trend.hashtags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {compact.format(trend.views)} views · {compact.format(trend.likes)} likes
                        {trend.author ? ` · @${trend.author}` : ""}
                      </p>
                      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                        {trend.sourceUrl ? (
                          <a
                            href={trend.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                          >
                            View original
                          </a>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Trend {Math.round(trend.trendScore)}
                          </span>
                        )}
                        <Button
                          size="sm"
                          disabled={remixMutation.isPending}
                          onClick={() => remixMutation.mutate(trend.trendKey)}
                        >
                          {remixMutation.isPending && remixMutation.variables === trend.trendKey
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
                No remixes yet. Pick a trend above to generate your first ad.
              </p>
            ) : (
              <div className="mt-4 space-y-4">
                {remixes.data.map((remix) => (
                  <Card key={remix.id}>
                    <CardContent className="space-y-3 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                          {remix.trendKey}
                        </span>
                        <Badge variant="outline">{remix.platform}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(remix.createdAt).toLocaleString()}
                        </span>
                      </div>
                      {remix.trendTitle ? (
                        <p className="text-xs text-muted-foreground">
                          Remixed from: {remix.trendTitle}
                          {remix.sourceUrl ? (
                            <>
                              {" · "}
                              <a
                                href={remix.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline underline-offset-4"
                              >
                                original
                              </a>
                            </>
                          ) : null}
                        </p>
                      ) : null}
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
