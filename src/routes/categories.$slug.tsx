import { createFileRoute, Link, notFound } from "@tanstack/react-router";

import { getCategoryPage } from "@/lib/companies.functions";
import { CompanyCard } from "@/components/CompanyCard";

export const Route = createFileRoute("/categories/$slug")({
  loader: async ({ params }) => {
    const result = await getCategoryPage({ data: { slug: params.slug } });
    if (!result) throw notFound();
    return result;
  },
  head: ({ loaderData }) => {
    const name = loaderData?.category.name ?? "Category";
    const title = `${name} brands | Vira`;
    const description =
      loaderData?.category.description ||
      `Browse ${name.toLowerCase()} companies and their purpose identities.`;
    return {
      meta: [
        { title },
        { name: "description", content: description.slice(0, 155) },
        { property: "og:title", content: title },
        { property: "og:description", content: description.slice(0, 155) },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary_large_image" },
      ],
    };
  },
  errorComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-serif text-2xl font-semibold">This category didn't load</h1>
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-serif text-2xl font-semibold">Category not found</h1>
      <Link to="/" className="mt-4 inline-block text-sm underline underline-offset-4">
        Back to the marketplace
      </Link>
    </div>
  ),
  component: CategoryPage,
});

function CategoryPage() {
  const { category, companies } = Route.useLoaderData();

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Category</p>
      <h1 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground">
        {category.name}
      </h1>
      {category.description ? (
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{category.description}</p>
      ) : null}

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No companies listed here yet.</p>
        ) : (
          companies.map((company) => <CompanyCard key={company.id} company={company} />)
        )}
      </div>
    </div>
  );
}
