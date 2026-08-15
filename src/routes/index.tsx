import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listCategories, listCompanies } from "@/lib/companies.functions";
import { listTrendingNow } from "@/lib/trends.functions";
import { CompanyCard } from "@/components/CompanyCard";
import { Eyebrow, Lead, PageShell, PageTitle, SectionTitle, Stat, StatRow } from "@/components/Page";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const marketplaceQuery = queryOptions({
  queryKey: ["marketplace"],
  queryFn: async () => {
    const [categories, companies, trends] = await Promise.all([
      listCategories(),
      listCompanies({}),
      listTrendingNow({ data: { limit: 9 } }),
    ]);
    return { categories, companies, trends };
  },
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(marketplaceQuery),
  head: () => ({
    meta: [
      { title: "Vira — Remix trending ads into your own brand's version" },
      {
        name: "description",
        content:
          "Vira maps thousands of real trending social posts to your category and remixes them into shoot-ready ads, so small brands compete with big ad budgets.",
      },
      { property: "og:title", content: "Vira — Remix trending ads into your own brand's version" },
      {
        property: "og:description",
        content: "Real viral trends, mapped to your category and rewritten in your brand voice.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold tracking-tight">The marketplace didn't load</h1>
      <p className="mt-3 text-base text-muted-foreground">Please refresh to try again.</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-6 py-20 text-center">
      <h1 className="font-serif text-3xl font-bold tracking-tight">Not found</h1>
    </div>
  ),
  component: Home,
});

const compact = new Intl.NumberFormat("en", { notation: "compact" });

function Home() {
  const { data } = useSuspenseQuery(marketplaceQuery);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const companies = query
    ? data.companies.filter(
        (company) =>
          company.name.toLowerCase().includes(query) ||
          company.bio.toLowerCase().includes(query) ||
          company.mission.toLowerCase().includes(query) ||
          company.ownerName.toLowerCase().includes(query) ||
          company.categoryName.toLowerCase().includes(query),
      )
    : data.companies;

  const totalViews = data.trends.reduce((sum, trend) => sum + trend.views, 0);

  return (
    <PageShell>
      <Eyebrow live>Vira marketplace</Eyebrow>

      <div className="mt-8 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div>
          <PageTitle hero>
            Cut through the noise.
            <br />
            Remix the ads already winning
          </PageTitle>
          <Lead className="mt-6">
            Vira tracks the posts trending across social right now, maps every trend to the category
            your company serves, and rewrites them around your own mission and positioning — so you
            can ship your first campaign without an agency.
          </Lead>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            {loading ? null : user ? (
              <>
                <Link
                  to="/remix"
                  className="rounded-xl bg-foreground px-7 py-3.5 text-base font-medium text-background transition-opacity hover:opacity-90"
                >
                  Start remixing
                </Link>
                <Link
                  to="/dashboard"
                  className="rounded-xl border border-border bg-card px-7 py-3.5 text-base font-medium text-foreground transition-colors hover:border-ring"
                >
                  Your dashboard
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="rounded-xl bg-foreground px-7 py-3.5 text-base font-medium text-background transition-opacity hover:opacity-90"
                >
                  Start remixing
                </Link>
                <Link
                  to="/auth"
                  className="rounded-xl border border-border bg-card px-7 py-3.5 text-base font-medium text-foreground transition-colors hover:border-ring"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="lg:pt-6">
          <StatRow className="grid-cols-1">
            <Stat label="Brands listed" value={String(data.companies.length)} />
            <Stat label="Categories mapped" value={String(data.categories.length)} />
            <Stat label="Trending views" value={compact.format(totalViews)} />
          </StatRow>
          <p className="mt-5 text-base text-muted-foreground">
            One owner, many brands. Every listing carries its own purpose identity — owner, bio and
            mission — mapped to the categories it competes in.
          </p>
        </div>
      </div>

      <section className="mt-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle>Trending right now</SectionTitle>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
            Live trends, mapped to consumer categories
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {data.trends.length === 0 ? (
            <p className="text-base text-muted-foreground">No trends loaded yet.</p>
          ) : (
            data.trends.map((trend) => (
              <article
                key={trend.trendKey}
                className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                    {trend.trendKey}
                  </span>
                  <span className="rounded-full bg-secondary px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
                    {trend.platform}
                  </span>
                </div>
                <h3 className="line-clamp-3 text-lg font-medium leading-snug text-foreground">
                  {trend.caption || trend.title}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {trend.format ? (
                    <span className="rounded-md bg-secondary px-3 py-1 text-sm text-foreground">
                      {trend.format}
                    </span>
                  ) : null}
                  {trend.hashtags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-md bg-secondary px-3 py-1 text-sm text-foreground"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
                <p className="mt-auto border-t border-border pt-4 font-mono text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">
                    {compact.format(trend.views)}
                  </span>{" "}
                  views{" "}
                  <span className="font-semibold text-foreground">
                    {compact.format(trend.likes)}
                  </span>{" "}
                  likes
                </p>
              </article>
            ))
          )}
        </div>
      </section>

      <section className="mt-16">
        <div className="flex flex-wrap items-center justify-between gap-6 border-y border-border py-6">
          <SectionTitle>Browse the directory</SectionTitle>
          <div className="relative min-w-[280px] flex-1 sm:max-w-md">
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              /
            </span>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search brands, owners, missions, categories"
              aria-label="Search companies"
              className="h-12 rounded-full border-border bg-card pl-10 text-base"
            />
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {data.categories.map((category) => (
            <Link
              key={category.id}
              to="/categories/$slug"
              params={{ slug: category.slug }}
              className={cn(
                "rounded-full border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground",
                "transition-colors hover:border-ring",
              )}
            >
              {category.name}
            </Link>
          ))}
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {companies.length === 0 ? (
            <p className="text-base text-muted-foreground">
              No companies match yet. Be the first to list your brand.
            </p>
          ) : (
            companies.map((company) => <CompanyCard key={company.id} company={company} />)
          )}
        </div>
      </section>
    </PageShell>
  );
}
