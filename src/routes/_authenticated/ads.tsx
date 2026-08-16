import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { listMyCompanies } from "@/lib/owner.functions";
import { listCompanyRemixes } from "@/lib/remix.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AdPipeline } from "@/components/AdPipeline";
import { VideoStudio } from "@/components/VideoStudio";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/ads")({
  head: () => ({
    meta: [
      { title: "Create ads — Vira" },
      {
        name: "description",
        content:
          "Your remixed ad concepts, generated from the trends winning in your category right now.",
      },
      { property: "og:title", content: "Create ads — Vira" },
      {
        property: "og:description",
        content: "Vira turns viral trends into ad concepts for your product.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CreateAdsPage,
});

function CreateAdsPage() {
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchRemixes = useServerFn(listCompanyRemixes);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const companies = useQuery({ queryKey: ["my-companies"], queryFn: () => fetchCompanies() });

  useEffect(() => {
    if (!companyId && companies.data?.length) setCompanyId(companies.data[0]!.id);
  }, [companies.data, companyId]);

  const remixes = useQuery({
    queryKey: ["remixes", companyId],
    queryFn: () => fetchRemixes({ data: { companyId: companyId! } }),
    enabled: Boolean(companyId),
  });

  const company = companies.data?.find((item) => item.id === companyId) ?? null;

  return (
    <div className="bg-background">
      <div className="mx-auto w-full max-w-5xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Create ads · from what is trending in your category
        </p>

        <h1 className="mt-6 font-serif text-5xl font-bold leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          {company ? `We're on it, ${company.name}.` : "Let's make your ads."}
        </h1>

        {companies.isLoading ? (
          <Skeleton className="mt-8 h-14 w-full max-w-md" />
        ) : !companies.data?.length ? (
          <Card className="mt-8 max-w-lg">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="text-sm text-muted-foreground">
                List a product first — ads are built from your brand and its category.
              </p>
              <Button asChild size="sm">
                <Link to="/studio/new">List a company</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Vira is analyzing the viral {company?.categoryName.toLowerCase()} ads against your
              product and your mission. You don't have to wait here.
            </p>

            <div className="mt-8 max-w-md space-y-2">
              <label
                htmlFor="ads-product-select"
                className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
              >
                Your product
              </label>
              <Select value={companyId ?? ""} onValueChange={(value) => setCompanyId(value)}>
                <SelectTrigger
                  id="ads-product-select"
                  className="h-14 w-full rounded-xl border-border bg-card text-base"
                >
                  <SelectValue placeholder="Select a product" />
                </SelectTrigger>
                <SelectContent>
                  {companies.data.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} — {item.categoryName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {company ? (
              <AdPipeline companyId={company.id} companyName={company.name} />
            ) : null}

            <p className="mt-10 font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
              Your concepts land here
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Each concept below started as a trend you remixed in the studio — Vira rewrote the
              hook, script and caption around your product. Newest first.
            </p>

            {remixes.isLoading ? (
              <div className="mt-6 grid gap-6 sm:grid-cols-3">
                {[0, 1, 2].map((key) => (
                  <Skeleton key={key} className="h-80 w-full rounded-2xl" />
                ))}
              </div>
            ) : !remixes.data?.length ? (
              <>
                <div className="mt-6 grid gap-6 sm:grid-cols-3">
                  {[0, 1, 2].map((key) => (
                    <div
                      key={key}
                      className="aspect-[3/4] rounded-2xl border border-dashed border-border bg-secondary"
                    />
                  ))}
                </div>
                <div className="mt-10 flex flex-wrap items-center justify-between gap-6">
                  <p className="max-w-[16rem] text-sm text-muted-foreground">
                    Pick a trend and Vira writes your version of it.
                  </p>
                  <Button
                    asChild
                    className="h-16 rounded-2xl px-8 text-base font-semibold bg-foreground text-background hover:bg-foreground/90"
                  >
                    <Link to="/remix">
                      See what's working in {company?.categoryName ?? "your category"} →
                    </Link>
                  </Button>
                </div>
              </>
            ) : (
              <>
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
                <div className="mt-10">
                  <Button
                    asChild
                    className="h-14 rounded-2xl px-8 text-base font-semibold bg-foreground text-background hover:bg-foreground/90"
                  >
                    <Link to="/remix">
                      See what's working in {company?.categoryName ?? "your category"} →
                    </Link>
                  </Button>
                </div>
              </>
            )}
            {company ? (
              <VideoStudio companyId={company.id} companyName={company.name} />
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
