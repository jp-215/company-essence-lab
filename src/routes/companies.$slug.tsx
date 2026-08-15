import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { getCompany } from "@/lib/companies.functions";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export const Route = createFileRoute("/companies/$slug")({
  loader: async ({ params }) => {
    const result = await getCompany({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.company.name ?? "Company";
    const description =
      loaderData?.insight?.summary ??
      loaderData?.company.bio ??
      "A consumer-product brand on the Vira marketplace.";
    const title = `${name} — purpose identity | Vira`;
    return {
      meta: [
        { title },
        { name: "description", content: description.slice(0, 155) },
        { property: "og:title", content: title },
        { property: "og:description", content: description.slice(0, 155) },
        { property: "og:type", content: "profile" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-serif text-2xl font-semibold">This profile didn't load</h1>
      <p className="mt-2 text-sm text-muted-foreground">Please try again in a moment.</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-serif text-2xl font-semibold">Company not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
        Back to the marketplace
      </Link>
    </div>
  ),
  component: CompanyProfile,
});

function CompanyProfile() {
  const { company, insight } = Route.useLoaderData();

  return (
    <article className="mx-auto w-full max-w-4xl px-4 py-12">
      <header className="flex flex-wrap items-start gap-5">
        <BrandLogo name={company.name} logoUrl={company.logoUrl} className="size-20" />
        <div className="min-w-64 flex-1">
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
            {company.name}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link
              to="/categories/$slug"
              params={{ slug: company.categorySlug }}
              className="underline-offset-4 hover:underline"
            >
              <Badge variant="secondary">{company.categoryName}</Badge>
            </Link>
            <span>Owner: {company.ownerName}</span>
            {company.website ? (
              <a
                href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
                target="_blank"
                rel="noreferrer noopener"
                className="underline underline-offset-4"
              >
                Visit website
              </a>
            ) : null}
          </div>
        </div>
      </header>

      <Separator className="my-8" />

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-6 md:col-span-2">
          <section>
            <h2 className="font-serif text-lg font-semibold text-foreground">About</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {company.bio}
            </p>
          </section>
          <section>
            <h2 className="font-serif text-lg font-semibold text-foreground">Mission</h2>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {company.mission}
            </p>
          </section>

          {insight?.status === "done" ? (
            <section className="space-y-4">
              <h2 className="font-serif text-lg font-semibold text-foreground">
                Purpose identity from public signals
              </h2>
              {insight.summary ? (
                <p className="text-sm leading-relaxed text-muted-foreground">{insight.summary}</p>
              ) : null}
              {insight.positioning ? (
                <p className="text-sm text-foreground">
                  <span className="font-medium">Positioning: </span>
                  {insight.positioning}
                </p>
              ) : null}
              {insight.adThemes.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium text-foreground">Advertising themes</h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {insight.adThemes.map((theme) => (
                      <li key={theme}>{theme}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {insight.sources.length > 0 ? (
                <div>
                  <h3 className="text-sm font-medium text-foreground">Sources</h3>
                  <ul className="mt-2 space-y-1 text-sm">
                    {insight.sources.map((source) => (
                      <li key={source.url}>
                        <a
                          href={source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="text-muted-foreground underline underline-offset-4"
                        >
                          {source.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Brand signals for this company haven't been published yet.
            </p>
          )}
        </div>

        <aside className="space-y-4">
          {insight?.tone ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Brand tone</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{insight.tone}</CardContent>
            </Card>
          ) : null}

          {insight && insight.keywords.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Keywords</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {insight.keywords.map((keyword) => (
                  <Badge key={keyword} variant="outline">
                    {keyword}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {insight && insight.brandColors.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Brand palette</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {insight.brandColors.map((color) => (
                  <span
                    key={color}
                    className="size-8 rounded-md border border-border"
                    style={{ backgroundColor: color }}
                    title={color}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </article>
  );
}
