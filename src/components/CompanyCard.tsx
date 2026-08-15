import { Link } from "@tanstack/react-router";
import type { CompanyCardDTO } from "@/lib/company-types";
import { BrandLogo } from "@/components/BrandLogo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export function CompanyCard({ company }: { company: CompanyCardDTO }) {
  return (
    <Card className="transition-colors hover:border-foreground/25">
      <CardContent className="flex gap-4 py-5">
        <BrandLogo name={company.name} logoUrl={company.logoUrl} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/companies/$slug"
              params={{ slug: company.slug }}
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              {company.name}
            </Link>
            <Badge variant="secondary">{company.categoryName}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Led by {company.ownerName}</p>
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{company.bio}</p>
        </div>
      </CardContent>
    </Card>
  );
}
