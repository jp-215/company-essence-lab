import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { TrendPreview } from "@/components/TrendPreview";
import { toast } from "sonner";

import { listMyCompanies } from "@/lib/owner.functions";
import {
  generateImageRemixBatch,
  generateRemix,
  listCompanyRemixes,
  listCompanyTrends,
} from "@/lib/remix.functions";
import { listImageAssets } from "@/lib/images.functions";
import { getRecommendations } from "@/lib/recommendations.functions";
import { startVideoRender } from "@/lib/engine.functions";
import { logTrendInteractions } from "@/lib/interactions.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
type FeedMode = "foryou" | "browse" | "images";

function RemixStudio() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchTrends = useServerFn(listCompanyTrends);
  const fetchRecommendations = useServerFn(getRecommendations);
  const fetchRemixes = useServerFn(listCompanyRemixes);
  const runRemix = useServerFn(generateRemix);
  const logTaps = useServerFn(logTrendInteractions);
  const startRender = useServerFn(startVideoRender);
  const fetchImages = useServerFn(listImageAssets);
  const runImageRemix = useServerFn(generateImageRemixBatch);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [productOpen, setProductOpen] = useState(false);
  const [mode, setMode] = useState<FeedMode>("foryou");
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const [platform, setPlatform] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("views");
  // Up to six pieces of platform content ride along as influence for one render.
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  // ImageBase picks are tracked separately: they remix through OCR, not captions.
  const [selectedImages, setSelectedImages] = useState<Map<string, string>>(new Map());

  const totalPicked = selected.size + selectedImages.size;

  const toggleSelectedImage = (imageKey: string, line: string) => {
    setSelectedImages((current) => {
      const next = new Map(current);
      if (next.has(imageKey)) {
        next.delete(imageKey);
        return next;
      }
      if (selected.size + next.size >= 6) {
        toast.info("Six is the max influence set for one video.");
        return current;
      }
      next.set(imageKey, line);
      return next;
    });
  };

  const toggleSelected = (trendKey: string, line: string) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(trendKey)) {
        next.delete(trendKey);
        return next;
      }
      if (next.size + selectedImages.size >= 6) {
        toast.info("Six is the max influence set for one video.");
        return current;
      }
      next.set(trendKey, line);
      return next;
    });
  };


  const companies = useQuery({ queryKey: ["my-companies"], queryFn: () => fetchCompanies() });
  const selectedCompanySlug =
    companies.data?.find((company) => company.id === companyId)?.categorySlug || undefined;

  useEffect(() => {
    if (!companyId && companies.data?.length) {
      setCompanyId(companies.data[0]!.id);
    }
  }, [companies.data, companyId]);

  const trends = useQuery({
    queryKey: ["company-trends", companyId],
    queryFn: () => fetchTrends({ data: { companyId: companyId!, limit: 24 } }),
    enabled: Boolean(companyId) && mode === "browse",
  });

  const recommended = useQuery({
    queryKey: ["remix-recommendations", companyId, seed],
    queryFn: () =>
      fetchRecommendations({
        data: { companyId: companyId!, limit: 24, seed, surface: "remix" },
      }),
    enabled: Boolean(companyId) && mode === "foryou",
  });

  const images = useQuery({
    queryKey: ["remix-images", selectedCompanySlug],
    queryFn: () => fetchImages({ data: { categorySlug: selectedCompanySlug, limit: 36 } }),
    enabled: mode === "images" && Boolean(companyId),
  });

  const remixes = useQuery({
    queryKey: ["remixes", companyId],
    queryFn: () => fetchRemixes({ data: { companyId: companyId! } }),
    enabled: Boolean(companyId),
  });

  const remixMutation = useMutation({
    mutationFn: (trendKey: string) => {
      // Tap telemetry feeds the collaborative layer; fire-and-forget.
      void logTaps({
        data: { companyId: companyId!, surface: "remix", action: "tap", trendKeys: [trendKey] },
      }).catch(() => undefined);
      return runRemix({ data: { companyId: companyId!, trendKey } });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["remixes", companyId] });
      toast.success("Your version is ready — opening Create ads.");
      void navigate({ to: "/ads" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Remix failed."),
  });

  const imageRemixMutation = useMutation({
    mutationFn: () =>
      runImageRemix({
        data: { companyId: companyId!, imageKeys: [...selectedImages.keys()] },
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["remixes", companyId] });
      if (!result.created.length) {
        toast.error("Those assets could not be remixed. Try different images.");
        return;
      }
      toast.success(`${result.created.length} image remixes ready — opening Create ads.`);
      setSelectedImages(new Map());
      void navigate({ to: "/ads" });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Image remix failed."),
  });

  const videoMutation = useMutation({
    mutationFn: () => {
      const trendKeys = [...selected.keys()];
      const influences = [...selected.values(), ...selectedImages.values()];
      void logTaps({
        data: { companyId: companyId!, surface: "remix", action: "remix", trendKeys },
      }).catch(() => undefined);
      return startRender({
        data: {
          companyId: companyId!,
          lane: "founder-story",
          mode: "fast",
          product: selectedCompany?.name,
          influences: influences.map((line) => line.slice(0, 300)),
        },
      });
    },
    onSuccess: (accepted) => {
      toast.success(`Rendering your video — about ${accepted.estimated_seconds}s.`);
      setSelected(new Map());
      setSelectedImages(new Map());
      void navigate({ to: "/ads" });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Render failed."),
  });



  const selectedCompany = companies.data?.find((company) => company.id === companyId) ?? null;
  const all = (mode === "foryou" ? recommended.data : trends.data) ?? [];
  const feedLoading = mode === "foryou" ? recommended.isLoading : trends.isLoading;

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
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4 font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
            <span>Remix studio</span>
            <span className="h-px w-10 bg-border" />
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-foreground" />
              Live feed
            </span>
          </div>
          <Button
            asChild
            className="h-14 rounded-2xl bg-foreground px-8 text-base font-semibold text-background hover:bg-foreground/90"
          >
            <Link to="/ads">
              Create ads
              {remixes.data?.length ? ` (${remixes.data.length})` : ""} →
            </Link>
          </Button>
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
              <div className="mt-5 space-y-2">
                <label
                  htmlFor="product-select"
                  className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
                >
                  Your product
                </label>
                <Select
                  value={companyId ?? ""}
                  // Controlled open state: force the listbox closed on selection so the
                  // popover never lingers and blocks clicks on the platform filter tabs.
                  open={productOpen}
                  onOpenChange={setProductOpen}
                  onValueChange={(value) => {
                    setCompanyId(value);
                    setProductOpen(false);
                  }}
                >
                  <SelectTrigger
                    id="product-select"
                    className="h-14 w-full rounded-xl border-border bg-card text-base"
                  >
                    <SelectValue placeholder="Select a product" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.data.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name} — {company.categoryName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                  active={mode === "foryou"}
                  label="For you"
                  count={mode === "foryou" ? all.length : 24}
                  onClick={() => setMode("foryou")}
                />
                <FilterPill
                  active={mode === "browse"}
                  label="Browse all"
                  count={mode === "browse" ? all.length : 24}
                  onClick={() => setMode("browse")}
                />
                <FilterPill
                  active={mode === "images"}
                  label="ImageBase"
                  count={mode === "images" ? (images.data?.length ?? 0) : 36}
                  onClick={() => setMode("images")}
                />
                {mode === "foryou" ? (
                  <button
                    type="button"
                    onClick={() => setSeed(Math.floor(Math.random() * 1_000_000))}
                    disabled={recommended.isFetching}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-base font-medium text-foreground transition-colors hover:border-ring disabled:opacity-60"
                  >
                    {recommended.isFetching ? "Mixing…" : "Shuffle"}
                  </button>
                ) : null}
                <span className="h-6 w-px bg-border" />
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

            {mode === "images" ? (
              <section className="mt-12">
                <div className="flex items-end justify-between gap-4">
                  <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground">
                    ImageBase assets for your category
                  </h2>
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                    {images.data?.length ?? 0} assets
                  </p>
                </div>
                <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                  Pick up to six scraped creatives. Vira reads the on-image copy with OCR and
                  rewrites it for {selectedCompany?.name ?? "your product"} — then turns the set into
                  a video.
                </p>

                {images.isLoading ? (
                  <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((key) => (
                      <Skeleton key={key} className="h-[420px] w-full rounded-2xl" />
                    ))}
                  </div>
                ) : !images.data?.length ? (
                  <p className="mt-6 text-sm text-muted-foreground">
                    No ImageBase assets for this category yet.
                  </p>
                ) : (
                  <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {images.data.map((asset) => (
                      <article
                        key={asset.imageKey}
                        className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
                      >
                        <TrendPreview
                          sourceUrl={asset.sourceUrl}
                          platform={asset.platform}
                          title={asset.title || asset.caption}
                          imageUrl={asset.imageUrl}
                          className="aspect-[4/5] border-b border-border"
                        />
                        <div className="flex flex-1 flex-col gap-3 p-5">
                          <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                            {asset.authorHandle ? `@${asset.authorHandle}` : asset.platform}
                          </span>
                          <p className="line-clamp-3 text-sm leading-relaxed text-foreground">
                            {asset.caption || asset.title}
                          </p>
                          <div className="mt-auto pt-3">
                            <Button
                              variant={selectedImages.has(asset.imageKey) ? "default" : "outline"}
                              className="h-12 w-full rounded-xl text-sm"
                              aria-pressed={selectedImages.has(asset.imageKey)}
                              onClick={() =>
                                toggleSelectedImage(
                                  asset.imageKey,
                                  asset.caption || asset.title || asset.imageKey,
                                )
                              }
                            >
                              {selectedImages.has(asset.imageKey) ? "Selected ✓" : "Add to remix"}
                            </Button>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            ) : (
            <section className="mt-12">
              <div className="flex items-end justify-between gap-4">
                <h2 className="font-serif text-3xl font-bold tracking-tight text-foreground">
                  {mode === "foryou" ? "Picked for your brand" : "Trends mapped to your category"}
                </h2>
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {visible.length} of {all.length} trends
                </p>
              </div>

              {feedLoading ? (
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
                      <TrendPreview
                        sourceUrl={trend.sourceUrl}
                        platform={trend.platform}
                        title={trend.caption || trend.title}
                      >
                        <span className="absolute left-4 top-4 z-20 rounded-full bg-card px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
                          {trend.platform}
                        </span>
                        <span className="absolute right-4 top-4 z-20 rounded-full bg-foreground px-3 py-1 font-mono text-[10px] text-background">
                          {Math.round(trend.trendScore)}
                        </span>
                        {trend.format ? (
                          <span className="absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-full bg-card px-4 py-2 text-sm text-foreground">
                            <span className="size-1.5 rounded-full bg-foreground" />
                            {trend.format}
                          </span>
                        ) : null}
                      </TrendPreview>

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
                              <Badge
                                key={tag}
                                variant="secondary"
                                className="rounded-md font-normal"
                              >
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
                          <div className="flex gap-2">
                            <Button
                              variant={selected.has(trend.trendKey) ? "default" : "outline"}
                              className="h-12 flex-1 rounded-xl text-sm"
                              aria-pressed={selected.has(trend.trendKey)}
                              onClick={() =>
                                toggleSelected(trend.trendKey, trend.caption || trend.title)
                              }
                            >
                              {selected.has(trend.trendKey) ? "Selected ✓" : "Add to video"}
                            </Button>
                            <Button
                              variant="outline"
                              className="h-12 flex-1 rounded-xl text-sm"
                              disabled={remixMutation.isPending}
                              onClick={() => remixMutation.mutate(trend.trendKey)}
                            >
                              {remixMutation.isPending && remixMutation.variables === trend.trendKey
                                ? "Remixing…"
                                : "Remix copy"}
                            </Button>
                          </div>

                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
            )}
          </>
        )}
      </div>

      {totalPicked ? (
        <div className="sticky bottom-0 z-30 border-t border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
            <div>
              <p className="font-serif text-xl font-bold text-foreground">
                {totalPicked} of 6 assets selected
              </p>
              <p className="text-sm text-muted-foreground">
                Vira blends these into one AI video for{" "}
                {selectedCompany?.name ?? "your product"}.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  setSelected(new Map());
                  setSelectedImages(new Map());
                }}
              >
                Clear
              </Button>
              {selectedImages.size ? (
                <Button
                  variant="outline"
                  className="h-12 rounded-xl px-6 text-base"
                  disabled={imageRemixMutation.isPending}
                  onClick={() => imageRemixMutation.mutate()}
                >
                  {imageRemixMutation.isPending ? "Reading images…" : "Remix images (OCR)"}
                </Button>
              ) : null}
              <Button
                className="h-12 rounded-xl bg-foreground px-8 text-base text-background hover:bg-foreground/90"
                disabled={videoMutation.isPending}
                onClick={() => videoMutation.mutate()}
              >
                {videoMutation.isPending ? "Starting render…" : "Generate video →"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
