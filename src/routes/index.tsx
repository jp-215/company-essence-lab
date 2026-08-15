import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";

import { listCategories, listCompanies } from "@/lib/companies.functions";
import { CompanyCard } from "@/components/CompanyCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const marketplaceQuery = queryOptions({
  queryKey: ["marketplace"],
  queryFn: async () => {
    const [categories, companies] = await Promise.all([listCategories(), listCompanies({})]);
    return { categories, companies };
  },
});

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(marketplaceQuery),
  head: () => ({
    meta: [
      { title: "GTM Hackathons — Consumer brand purpose identities" },
      {
        name: "description",
        content:
          "A marketplace of consumer-product companies with purpose identities built from trending advertising signals across the web.",
      },
      { property: "og:title", content: "GTM Hackathons — Consumer brand purpose identities" },
      {
        property: "og:description",
        content:
          "Browse consumer brands, their missions, and the advertising themes powering their go-to-market.",
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

function Home() {
  const { data } = useSuspenseQuery(marketplaceQuery);
  const [search, setSearch] = useState("");

  const query = search.trim().toLowerCase();
  const companies = query
    ? data.companies.filter(
        (company) =>
          company.name.toLowerCase().includes(query) ||
          company.bio.toLowerCase().includes(query) ||
          company.categoryName.toLowerCase().includes(query),
      )
    : data.companies;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <section className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
          Consumer products marketplace
        </p>
        <h1 className="mt-3 font-serif text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
          Every brand has a purpose. We read it from their advertising.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          GTM Hackathons collects trending advertising signals from across the web and turns them
          into a purpose identity for each consumer-product company: positioning, tone, keywords and
          the ad themes they actually run on.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/auth">List your company</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/auth">Sign in</Link>
          </Button>
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
            placeholder="Search brands, categories, keywords"
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
