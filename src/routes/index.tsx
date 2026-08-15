import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listCategories, listCompanies } from "@/lib/companies.functions";
import { listTrendingNow } from "@/lib/trends.functions";
import { CompanyCard } from "@/components/CompanyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-serif text-2xl font-semibold">The marketplace didn't load</h1>
      <p className="mt-2 text-sm text-muted-foreground">Please refresh to try again.</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-serif text-2xl font-semibold">Not found</h1>
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

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <section className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Viral ad remixing for early-stage brands
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
          Cut through the noise. Remix the ads that are already winning.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Vira tracks the posts trending across social right now, maps every trend to the category
          your company serves, and rewrites them around your own mission and positioning — so you
          can ship your first campaign without an agency.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/auth">Start remixing</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Trending right now
          </h2>
          <p className="text-sm text-muted-foreground">
            Live trends, mapped to consumer categories
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.trends.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trends loaded yet.</p>
          ) : (
            data.trends.map((trend) => (
              <Card key={trend.trendKey} className="h-full">
                <CardContent className="flex h-full flex-col gap-3 py-5">
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
                    {trend.hashtags.slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="secondary">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-auto text-xs text-muted-foreground">
                    {compact.format(trend.views)} views · {compact.format(trend.likes)} likes
                  </p>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </section>

      <section className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-serif text-2xl font-semibold tracking-tight text-foreground">
            Browse the directory
          </h2>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search brands, owners, missions, categories"
            className="w-full sm:w-72"
            aria-label="Search companies"
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {data.categories.map((category) => (
            <Link key={category.id} to="/categories/$slug" params={{ slug: category.slug }}>
              <Badge variant="outline" className="cursor-pointer hover:bg-secondary">
                {category.name}
              </Badge>
            </Link>
          ))}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No companies match yet. Be the first to list your brand.
            </p>
          ) : (
            companies.map((company) => <CompanyCard key={company.id} company={company} />)
          )}
        </div>
      </section>
    </div>
  );
}
