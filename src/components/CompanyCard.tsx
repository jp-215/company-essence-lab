import { Link } from "@tanstack/react-router";
import type { CompanyCardDTO } from "@/lib/company-types";
import { BrandLogo } from "@/components/BrandLogo";

export function CompanyCard({ company }: { company: CompanyCardDTO }) {
  return (
    <article className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-6 transition-colors hover:border-ring">
      <div className="flex items-start gap-4">
        <BrandLogo name={company.name} logoUrl={company.logoUrl} />
        <div className="min-w-0 flex-1">
          <Link
            to="/companies/$slug"
            params={{ slug: company.slug }}
            className="font-serif text-xl font-bold tracking-tight text-foreground underline-offset-4 hover:underline"
          >
            {company.name}
          </Link>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Led by {company.ownerName}
          </p>
        </div>
      </div>

      <Link
        to="/categories/$slug"
        params={{ slug: company.categorySlug }}
        className="inline-flex w-fit items-center rounded-full border border-border bg-secondary px-4 py-1.5 text-sm text-foreground transition-colors hover:border-ring"
      >
        {company.categoryName}
      </Link>

      <p className="line-clamp-3 text-base leading-relaxed text-muted-foreground">{company.bio}</p>

      {company.mission ? (
        <div className="border-t border-border pt-4">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Mission
          </p>
          <p className="mt-1 line-clamp-2 text-base text-foreground">{company.mission}</p>
        </div>
      ) : null}

      {company.website ? (
        <a
          href={company.website.startsWith("http") ? company.website : `https://${company.website}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          {company.website.replace(/^https?:\/\//, "")}
        </a>
      ) : null}
    </article>
  );
}
