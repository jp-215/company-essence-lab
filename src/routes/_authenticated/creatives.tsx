import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { listMyCompanies } from "@/lib/owner.functions";
import { listImageCreatives } from "@/lib/image-remix.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/creatives")({
  head: () => ({
    meta: [
      { title: "Image creatives — Vira" },
      {
        name: "description",
        content:
          "Branded still ads remixed from scraped Instagram creatives, with the on-image copy read by OCR and rewritten for your brand.",
      },
      { property: "og:title", content: "Image creatives — Vira" },
      {
        property: "og:description",
        content: "Vira remixes trending Instagram creatives into branded still ads.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreativesPage,
});

function CreativesPage() {
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchCreatives = useServerFn(listImageCreatives);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const companies = useQuery({ queryKey: ["my-companies"], queryFn: () => fetchCompanies() });

  useEffect(() => {
    if (!companyId && companies.data?.length) setCompanyId(companies.data[0]!.id);
  }, [companies.data, companyId]);

  const creatives = useQuery({
    queryKey: ["image-creatives", companyId],
    queryFn: () => fetchCreatives({ data: { companyId: companyId!, limit: 40 } }),
    enabled: Boolean(companyId),
    refetchInterval: 30_000,
  });

  const ready = (creatives.data ?? []).filter((item) => item.imageUrl);
  const failures = (creatives.data ?? []).filter((item) => !item.imageUrl);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            ImageBase · OCR remix
          </p>
          <h1 className="mt-3 font-serif text-4xl font-bold tracking-tight text-foreground">
            Your image creatives
          </h1>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every scraped creative you remix is re-rendered for your brand — we read the on-image
            copy with OCR, rewrite it in your voice, and paint a new still ad.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {companies.data && companies.data.length > 1 ? (
              <Select value={companyId ?? ""} onValueChange={setCompanyId}>
                <SelectTrigger className="h-11 w-64 rounded-xl">
                  <SelectValue placeholder="Pick a product" />
                </SelectTrigger>
                <SelectContent>
                  {companies.data.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <Link to="/remix">Remix more assets</Link>
            </Button>
            <Button asChild variant="ghost" className="h-11 rounded-xl">
              <Link to="/ads">Create video ads</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {creatives.isLoading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="h-80 rounded-2xl" />
            ))}
          </div>
        ) : !ready.length && !failures.length ? (
          <Card className="rounded-2xl">
            <CardContent className="p-10 text-center">
              <p className="font-serif text-2xl font-bold text-foreground">No creatives yet</p>
              <p className="mx-auto mt-3 max-w-md text-muted-foreground">
                Head to the Remix studio, open the ImageBase tab, pick up to six scraped assets and
                hit “Remix images”.
              </p>
              <Button asChild className="mt-6 h-11 rounded-xl">
                <Link to="/remix">Open Remix studio</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ready.map((item) => (
              <Card key={item.id} className="overflow-hidden rounded-2xl">
                <img
                  src={item.imageUrl!}
                  alt={item.headline || "Remixed brand creative"}
                  loading="lazy"
                  className="aspect-[4/5] w-full bg-muted object-cover"
                />
                <CardContent className="space-y-3 p-5">
                  <p className="font-serif text-lg font-bold leading-snug text-foreground">
                    {item.headline || "Untitled concept"}
                  </p>
                  {item.caption ? (
                    <p className="text-sm text-muted-foreground">{item.caption}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-[10px] uppercase">
                      {item.provider}
                    </Badge>
                    {item.sourceOcrText ? (
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        OCR read
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <a
                      href={item.imageUrl!}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium underline underline-offset-4"
                    >
                      Open full size
                    </a>
                    {item.sourceUrl ? (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground underline underline-offset-4"
                      >
                        Reference post
                      </a>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {failures.length ? (
          <section className="mt-10">
            <h2 className="font-serif text-xl font-bold text-foreground">Needs another pass</h2>
            <div className="mt-4 space-y-3">
              {failures.map((item) => (
                <Card key={item.id} className="rounded-2xl">
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <div>
                      <p className="font-medium text-foreground">
                        {item.headline || item.imageKey}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {item.error ?? "The render did not return an image."}
                      </p>
                    </div>
                    <Button asChild variant="outline" className="rounded-xl">
                      <Link to="/remix">Try again</Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
