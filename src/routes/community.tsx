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
import { listTrendingNow } from "@/lib/trends.functions";
import { listWordOfMouth } from "@/lib/wom.functions";
import { listMyCompanies } from "@/lib/owner.functions";
import { generateRemixBatch } from "@/lib/remix.functions";
import { interleave } from "@/lib/feed-mix";
import { useAuth } from "@/hooks/useAuth";
import { SwipeFeed } from "@/components/SwipeFeed";
import { ChatterCard, VideoCard, type FeedItem } from "@/components/feed/FeedCards";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({ category: z.string().max(80).optional() });
const MAX_BATCH = 6;

const itemKey = (item: FeedItem) => (item.kind === "video" ? item.trendKey : item.womKey);


const communityQuery = (categorySlug?: string) =>
  queryOptions({
    queryKey: ["community-feed", categorySlug ?? "all"],
    queryFn: async () => {
      const [categories, trends, wordOfMouth] = await Promise.all([
        listCategories().catch(() => []),
        listTrendingNow({ data: { limit: 30, ...(categorySlug ? { categorySlug } : {}) } }).catch(
          () => [],
        ),
        listWordOfMouth({ data: { limit: 30, ...(categorySlug ? { categorySlug } : {}) } }).catch(
          () => [],
        ),
      ]);
      return { categories, trends, wordOfMouth };
    },
    retry: 2,
  });

export const Route = createFileRoute("/community")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(communityQuery(deps.category)),
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
  const { category } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useAuth();
  const fetchCompanies = useServerFn(listMyCompanies);

  const { data } = useSuspenseQuery(communityQuery(category));

  // Default the slice to the signed-in brand's primary category.
  const companies = useQuery({
    queryKey: ["community-companies"],
    queryFn: () => fetchCompanies(),
    enabled: !!user && !category,
  });

  const brandCategoryName = companies.data?.[0]?.categoryName;
  const brandCategory = brandCategoryName
    ? data.categories.find((c) => c.name === brandCategoryName)?.slug
    : undefined;

  const items = useMemo<FeedItem[]>(() => {
    const videos = data.trends.map((t) => ({ kind: "video" as const, ...t }));
    const chatter = data.wordOfMouth.map((w) => ({ kind: "chatter" as const, ...w }));
    return interleave(videos, chatter, 60) as FeedItem[];
  }, [data.trends, data.wordOfMouth]);

  const activeCategoryName =
    data.categories.find((c) => c.slug === category)?.name ?? "All categories";

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-3 px-4 py-3">
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
        <span className="pointer-events-none hidden font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground sm:inline">
          Vira community · {activeCategoryName}
        </span>
      </div>

      {!category && brandCategory ? (
        <div className="absolute inset-x-0 top-16 z-20 flex justify-center">
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
            return item.kind === "video" ? (
              <VideoCard item={item} active={active} />
            ) : (
              <ChatterCard item={item} />
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
    </div>
  );
}
