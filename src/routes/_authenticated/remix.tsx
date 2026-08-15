import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Play } from "lucide-react";
import { toast } from "sonner";

import { listMyCompanies } from "@/lib/owner.functions";
import { generateRemix, listCompanyRemixes, listCompanyTrends } from "@/lib/remix.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
type SortKey = "views" | "likes" | "newest";

function RemixStudio() {
  const queryClient = useQueryClient();
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchTrends = useServerFn(listCompanyTrends);
  const fetchRemixes = useServerFn(listCompanyRemixes);
  const runRemix = useServerFn(generateRemix);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("views");

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
  const all = trends.data ?? [];

  const platforms = useMemo(() => {
    const counts = new Map<string, number>();
    for (const trend of all) {
      counts.set(trend.platform, (counts.get(trend.platform) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [all]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = all.filter((trend) => {
      if (platform !== "all" && trend.platform !== platform) return false;
      if (!term) return true;
      return [trend.caption, trend.title, trend.author, ...trend.hashtags]
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
    return filtered.sort((a, b) => {
      if (sort === "likes") return b.likes - a.likes;
      if (sort === "newest") return b.relevanceRank - a.relevanceRank;
      return b.views - a.views;
    });
  }, [all, platform, search, sort]);

  const totalViews = all.reduce((sum, trend) => sum + trend.views, 0);

  return (
    <div className="bg-background">
      <div className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="flex items-center gap-4 font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
          <span>Remix studio</span>
          <span className="h-px w-10 bg-border" />
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-foreground" />
            Live feed
          </span>
        </div>

        <div className="mt-8 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
          <div>
            <h1 className="font-serif text-5xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
              Live trends,
              <br />
              rewritten as yours
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Vira tracks the posts trending across social right now, mapped to the categories your
              brand actually competes in. Pick one and Vira rewrites it around your mission,
              positioning and proof.
            </p>
          </div>

          <div className="lg:pt-6">
            <div className="grid grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card">
              <Stat label="Posts tracked" value="2,981" />
              <Stat label="Mapped to you" value={String(all.length)} />
              <Stat label="Combined views" value={compact.format(totalViews)} />
            </div>

            {companies.data?.length ? (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {companies.data.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setCompanyId(company.id)}
                    aria-pressed={company.id === companyId}
                    className={cn(
                      "rounded-full px-5 py-2 text-sm font-medium transition-colors",
                      company.id === companyId
                        ? "bg-foreground text-background"
                        : "border border-border bg-card text-foreground hover:border-ring",
                    )}
                  >
                    {company.name}
                  </button>
                ))}
                {selectedCompany ? (
                  <p className="text-sm text-muted-foreground">
                    Mapped through category{" "}
                    <span className="font-semibold text-foreground">
                      {selectedCompany.categoryName}
                    </span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {companies.isLoading ? (
          <Skeleton className="mt-12 h-24 w-full" />
        ) : !companies.data?.length ? (
          <Card className="mt-12">
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
            <div className="mt-14 flex flex-wrap items-center justify-between gap-6 border-y border-border py-6">
              <div className="flex flex-wrap items-center gap-3">
                <FilterPill
                  active={platform === "all"}
                  label="All platforms"
                  count={all.length}
                  onClick={() => setPlatform("all")}
                />
                {platforms.map(([name, count]) => (
                  <FilterPill
                    key={name}
                    active={platform === name}
                    label={name}
                    count={count}
                    onClick={() => setPlatform(name)}
                  />
                ))}
              </div>

              <div className="flex flex-1 flex-wrap items-center justify-end gap-6">
                <div className="relative min-w-[260px] flex-1">
                  <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                    /
                  </span>
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search captions, tags, creators"
                    aria-label="Search trends"
                    className="h-12 rounded-full border-border bg-card pl-10 text-base"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    Sort
                  </span>
                  {(["views", "likes", "newest"] as SortKey[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSort(key)}
                      aria-pressed={sort === key}
                      className={cn(
                        "text-base capitalize transition-colors",
                        sort === key
                          ? "font-semibold text-foreground underline underline-offset-4"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {key}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <section className="mt-12">
              <div className="flex items-end justify-between gap-4">
                <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground">
                  Trends mapped to your category
                </h2>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {visible.length} of {all.length} trends
                </p>
              </div>

              {trends.isLoading ? (
                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {[0, 1, 2, 3].map((key) => (
                    <Skeleton key={key} className="h-[560px] w-full rounded-2xl" />
                  ))}
                </div>
              ) : !visible.length ? (
                <p className="mt-6 text-sm text-muted-foreground">
                  No trends match this filter yet.
                </p>
              ) : (
                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {visible.map((trend) => (
                    <article
                      key={trend.trendKey}
                      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
                    >
                      <div className="relative flex aspect-[3/4] flex-col items-center justify-center bg-secondary">
                        <span className="absolute left-4 top-4 rounded-full bg-card px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
                          {trend.platform}
                        </span>
                        <span className="absolute right-4 top-4 rounded-full bg-foreground px-3 py-1 font-mono text-[10px] text-background">
                          {Math.round(trend.trendScore)}
                        </span>
                        {trend.sourceUrl ? (
                          <a
                            href={trend.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="Watch the original post"
                            className="flex size-14 items-center justify-center rounded-full border border-border bg-card transition-colors hover:border-ring"
                          >
                            <Play className="size-5 text-foreground" />
                          </a>
                        ) : (
                          <span className="flex size-14 items-center justify-center rounded-full border border-border bg-card">
                            <Play className="size-5 text-foreground" />
                          </span>
                        )}
                        <span className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {trend.sourceUrl ? "Watch original" : "Video thumbnail"}
                        </span>
                        {trend.format ? (
                          <span className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm text-foreground">
                            <span className="size-1.5 rounded-full bg-foreground" />
                            {trend.format}
                          </span>
                        ) : null}
                      </div>


                      <div className="flex flex-1 flex-col gap-4 border-t border-border p-5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                            {trend.trendKey}
                          </span>
                          <span className="font-mono text-[10px] text-muted-foreground">
                            #{trend.relevanceRank}
                          </span>
                        </div>

                        <h3 className="line-clamp-3 text-lg font-medium leading-snug text-foreground">
                          {trend.caption || trend.title}
                        </h3>

                        {trend.hashtags.length ? (
                          <div className="flex flex-wrap gap-2">
                            {trend.hashtags.slice(0, 4).map((tag) => (
                              <Badge key={tag} variant="secondary" className="rounded-md font-normal">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        ) : null}

                        <div className="mt-auto space-y-4 border-t border-border pt-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-xs text-muted-foreground">
                            <span>
                              <span className="font-semibold text-foreground">
                                {compact.format(trend.views)}
                              </span>{" "}
                              views{" "}
                              <span className="font-semibold text-foreground">
                                {compact.format(trend.likes)}
                              </span>{" "}
                              likes
                            </span>
                            {trend.author ? <span>@{trend.author}</span> : null}
                          </div>
                          <Button
                            className="h-12 w-full rounded-xl bg-foreground text-base text-background hover:bg-foreground/90"
                            disabled={remixMutation.isPending}
                            onClick={() => remixMutation.mutate(trend.trendKey)}
                          >
                            {remixMutation.isPending && remixMutation.variables === trend.trendKey
                              ? "Remixing…"
                              : "Remix for you"}
                          </Button>

                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-16">
              <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground">
                Your remixes
              </h2>
              {remixes.isLoading ? (
                <Skeleton className="mt-4 h-40 w-full" />
              ) : !remixes.data?.length ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No remixes yet. Pick a trend above to generate your first ad.
                </p>
              ) : (
                <div className="mt-6 space-y-4">
                  {remixes.data.map((remix) => (
                    <Card key={remix.id} className="rounded-2xl">
                      <CardContent className="space-y-3 p-6">
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
                        <p className="font-serif text-xl font-semibold leading-snug">{remix.hook}</p>
                        <pre className="whitespace-pre-wrap rounded-xl bg-secondary p-4 text-sm leading-relaxed text-foreground">
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
                            <span className="font-medium text-foreground">
                              Why it differentiates:{" "}
                            </span>
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-6">
      <p className="font-serif text-4xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "border border-border bg-card text-foreground hover:border-ring",
      )}
    >
      {label}
      <span className={cn("font-mono text-xs", active ? "opacity-70" : "text-muted-foreground")}>
        {count}
      </span>
    </button>
  );
}
