import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

import { listCategories } from "@/lib/companies.functions";
import { listTrendingHashtags, listTrendingNow } from "@/lib/trends.functions";
import { listWordOfMouth } from "@/lib/wom.functions";
import { listMyCompanies } from "@/lib/owner.functions";
import { generateRemixBatch } from "@/lib/remix.functions";
import { getTrendSocialProof, logTrendInteractions } from "@/lib/interactions.functions";
import { interleave } from "@/lib/feed-mix";
import { useAuth } from "@/hooks/useAuth";
import { SwipeFeed } from "@/components/SwipeFeed";
import { ChatterCard, VideoCard, type FeedItem } from "@/components/feed/FeedCards";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  category: z.string().max(80).optional(),
  tag: z.string().max(40).optional(),
});
const MAX_BATCH = 6;

const itemKey = (item: FeedItem) => (item.kind === "video" ? item.trendKey : item.womKey);

/** Deterministic Fisher-Yates so "Shuffle deck" re-rolls the same loaded feed. */
function shuffleBySeed<T>(items: T[], seed: number): T[] {
  if (seed === 0) return items;
  const result = [...items];
  let state = seed >>> 0 || 1;
  const rand = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const communityQuery = (categorySlug?: string, hashtag?: string) =>
  queryOptions({
    queryKey: ["community-feed", categorySlug ?? "all", hashtag ?? "all"],
    queryFn: async () => {
      const scope = {
        ...(categorySlug ? { categorySlug } : {}),
        ...(hashtag ? { hashtag } : {}),
      };
      const [categories, trends, wordOfMouth, hashtags] = await Promise.all([
        listCategories().catch(() => []),
        listTrendingNow({ data: { limit: 30, ...scope } }).catch(() => []),
        listWordOfMouth({ data: { limit: 30, ...scope } }).catch(() => []),
        listTrendingHashtags({ data: {} }).catch(() => []),
      ]);
      return { categories, trends, wordOfMouth, hashtags };
    },
    retry: 2,
  });

export const Route = createFileRoute("/community")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ category: search.category, tag: search.tag }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(communityQuery(deps.category, deps.tag)),
  head: () => ({
    meta: [
      { title: "Community feed — swipe through viral ads | Vira" },
      {
        name: "description",
        content:
          "Swipe up through auto-playing TikTok ad trends and Reddit word-of-mouth threads, mixed and matched to your product category.",
      },
      { property: "og:title", content: "Community feed — Vira" },
      {
        property: "og:description",
        content: "One swipe-up feed of viral video trends and real customer chatter.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CommunityPage,
  errorComponent: ({ error }) => (
    <div className="p-10 text-sm text-muted-foreground" role="alert">
      The community feed couldn't load: {error.message}
    </div>
  ),
  notFoundComponent: () => <div className="p-10 text-sm text-muted-foreground">No feed here.</div>,
});

function CommunityPage() {
  const { category, tag } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useAuth();
  const fetchCompanies = useServerFn(listMyCompanies);
  const runBatch = useServerFn(generateRemixBatch);
  const fetchSocialProof = useServerFn(getTrendSocialProof);
  const logTaps = useServerFn(logTrendInteractions);
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<FeedItem[]>([]);
  const [deckSeed, setDeckSeed] = useState(0);

  const { data } = useSuspenseQuery(communityQuery(category, tag));

  // Default the slice to the signed-in brand's primary category.
  const companies = useQuery({
    queryKey: ["community-companies"],
    queryFn: () => fetchCompanies(),
    enabled: !!user,
  });

  const brandCategoryName = companies.data?.[0]?.categoryName;
  const brandCategory = brandCategoryName
    ? data.categories.find((c) => c.name === brandCategoryName)?.slug
    : undefined;
  const companyId = companies.data?.[0]?.id;

  const items = useMemo<FeedItem[]>(() => {
    const videos = data.trends.map((t) => ({ kind: "video" as const, ...t }));
    const chatter = data.wordOfMouth.map((w) => ({ kind: "chatter" as const, ...w }));
    return shuffleBySeed(interleave(videos, chatter, 60) as FeedItem[], deckSeed);
  }, [data.trends, data.wordOfMouth, deckSeed]);

  // Aggregate remix counts for the "N brands remixed this" ribbons (public-safe).
  const socialProof = useQuery({
    queryKey: ["community-social-proof", items.map(itemKey).slice(0, 50).join(",")],
    queryFn: () => fetchSocialProof({ data: { trendKeys: items.map(itemKey).slice(0, 50) } }),
    enabled: items.length > 0,
  });

  const openTag = (nextTag: string) =>
    navigate({
      search: { ...(category ? { category } : {}), tag: nextTag },
    });

  const activeCategoryName =
    data.categories.find((c) => c.slug === category)?.name ?? "All categories";

  const selectedKeys = new Set(selected.map(itemKey));

  function toggleSelect(item: FeedItem) {
    const key = itemKey(item);
    setSelected((prev) => {
      if (prev.some((entry) => itemKey(entry) === key)) {
        return prev.filter((entry) => itemKey(entry) !== key);
      }
      if (prev.length >= MAX_BATCH) {
        toast.error(`Up to ${MAX_BATCH} picks per batch.`);
        return prev;
      }
      // Picks are tap telemetry for the collaborative layer (signed-in only).
      if (companyId) {
        void logTaps({
          data: { companyId, surface: "community", action: "tap", trendKeys: [key] },
        }).catch(() => undefined);
      }
      return [...prev, item];
    });
  }

  const generate = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("Add a company before generating ads.");
      return runBatch({
        data: {
          companyId,
          items: selected.map((item) => ({ kind: item.kind, key: itemKey(item) })),
        },
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["company-remixes"] });
      setSelected([]);
      if (result.created.length === 0) {
        toast.error("None of those could be turned into ads. Try other picks.");
        return;
      }
      toast.success(
        `${result.created.length} ad concept${result.created.length > 1 ? "s" : ""} queued for video generation.`,
      );
      navigate({ to: "/ads" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-5 py-3 sm:px-8 lg:px-12">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
          <div className="pointer-events-auto flex max-w-[70%] gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <Button
              size="sm"
              variant={!category ? "default" : "outline"}
              onClick={() => navigate({ search: {} })}
            >
              All
            </Button>
            {data.categories.map((item) => (
              <Button
                key={item.slug}
                size="sm"
                variant={category === item.slug ? "default" : "outline"}
                className="shrink-0"
                onClick={() => navigate({ search: { category: item.slug } })}
              >
                {item.name}
              </Button>
            ))}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setDeckSeed(Math.floor(Math.random() * 1_000_000) || 1)}
            >
              Shuffle deck
            </Button>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:inline">
              Vira community · {activeCategoryName}
            </span>
          </div>
        </div>

        {data.hashtags.length ? (
          <div className="pointer-events-auto mx-auto mt-2 flex w-full max-w-6xl gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {tag ? (
              <Button
                size="sm"
                variant="default"
                className="shrink-0"
                onClick={() => navigate({ search: category ? { category } : {} })}
              >
                #{tag} ✕
              </Button>
            ) : null}
            {data.hashtags
              .filter((entry) => entry.tag !== tag)
              .map((entry) => (
                <Button
                  key={entry.tag}
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => openTag(entry.tag)}
                >
                  #{entry.tag}
                  <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                    {entry.uses}
                  </span>
                </Button>
              ))}
          </div>
        ) : null}

        {!category && brandCategory ? (
          <div className="mx-auto mt-2 w-full max-w-6xl">
            <Button
              size="sm"
              variant="secondary"
              className="pointer-events-auto"
              onClick={() => navigate({ search: { category: brandCategory } })}
            >
              Tailor this feed to your brand
            </Button>
          </div>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="flex h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing to swipe through in this category yet.
          </p>
          <Button size="sm" variant="outline" onClick={() => navigate({ search: {} })}>
            Show all categories
          </Button>
        </div>
      ) : (
        <SwipeFeed
          count={items.length}
          renderItem={(index, active) => {
            const item = items[index]!;
            const isSelected = selectedKeys.has(itemKey(item));
            const proof = socialProof.data?.[itemKey(item)];
            return item.kind === "video" ? (
              <VideoCard
                item={item}
                active={active}
                selected={isSelected}
                onToggleSelect={() => toggleSelect(item)}
                remixCount={proof?.remixCount}
                onTagClick={openTag}
              />
            ) : (
              <ChatterCard
                item={item}
                selected={isSelected}
                onToggleSelect={() => toggleSelect(item)}
                remixCount={proof?.remixCount}
                onTagClick={openTag}
              />
            );
          }}

          endSlide={
            <div className="flex flex-col items-center gap-4 px-6 text-center">
              <h2 className="font-serif text-2xl font-semibold text-foreground">
                You've reached the end
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                That's every trend and thread we have for {activeCategoryName.toLowerCase()}. Turn
                one into an ad next.
              </p>
              <div className="flex gap-2">
                <Button asChild size="sm">
                  <Link to="/remix">Open Remix studio</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/trends">Browse trends</Link>
                </Button>
              </div>
            </div>
          }
        />
      )}

      {selected.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-5 py-3 backdrop-blur sm:px-8 lg:px-12">
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">
                {selected.length} of {MAX_BATCH} picked for video generation
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {selected.map((item) => (item.title || item.kind).slice(0, 40)).join(" · ")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Button>
              {user ? (
                <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
                  {generate.isPending
                    ? "Generating…"
                    : `Generate ${selected.length} ad${selected.length > 1 ? "s" : ""}`}
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/auth" search={{ tab: "signin" }}>
                    Sign in to generate
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
