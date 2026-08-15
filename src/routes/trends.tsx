import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { z } from "zod";

import { listCategories } from "@/lib/companies.functions";
import { listTrendingNow } from "@/lib/trends.functions";
import { listWordOfMouth } from "@/lib/wom.functions";
import { listMyCompanies } from "@/lib/owner.functions";
import { getChatterRecommendations, getRecommendations } from "@/lib/recommendations.functions";
import { getTrendIndexStatus } from "@/lib/trend-embeddings.functions";
import { interleave } from "@/lib/feed-mix";
import { useAuth } from "@/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const searchSchema = z.object({
  category: z.string().max(80).optional(),
  source: z.enum(["mix", "video", "wom"]).optional(),
});

const trendsQuery = (categorySlug?: string) =>
  queryOptions({
    queryKey: ["trending-page", categorySlug ?? "all"],
    // One flaky RPC shouldn't blank the whole page: degrade to an empty section instead.
    queryFn: async () => {
      const [categories, trends, wordOfMouth] = await Promise.all([
        listCategories().catch(() => []),
        listTrendingNow({ data: { limit: 36, ...(categorySlug ? { categorySlug } : {}) } }).catch(
          () => [],
        ),
        listWordOfMouth({ data: { limit: 36, ...(categorySlug ? { categorySlug } : {}) } }).catch(
          () => [],
        ),
      ]);
      return { categories, trends, wordOfMouth };
    },
    retry: 2,
  });

export const Route = createFileRoute("/trends")({
  validateSearch: (search) => searchSchema.parse(search),
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: ({ context, deps }) => context.queryClient.ensureQueryData(trendsQuery(deps.category)),

  head: () => ({
    meta: [
      { title: "Trending now — Vira" },
      {
        name: "description",
        content:
          "The most viral, most talked-about posts across social right now — ranked live and matched to your brand.",
      },
      { property: "og:title", content: "Trending now — Vira" },
      {
        property: "og:description",
        content: "Live viral trends ranked by traction, filterable by category.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TrendingPage,
});

const compact = new Intl.NumberFormat("en", { notation: "compact" });

function TrendingPage() {
  const { category, source } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data } = useSuspenseQuery(trendsQuery(category));
  const activeSource = source ?? "mix";
  // Balanced default: TikTok video trends alternating with word-of-mouth chatter.
  const balanced = interleave(data.trends, data.wordOfMouth, 36);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <header className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Trending now</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          The posts everyone is talking about
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Short-form video trends plus live word-of-mouth chatter from X — ranked by traction and
          scoped to your category so the ideas actually fit your brand.
        </p>
      </header>

      <PersonalizedRail
        categories={data.categories}
        activeCategory={category}
        onTailor={(slug) => navigate({ search: (prev) => ({ ...prev, category: slug }) })}
      />

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <Button
          variant={activeSource === "mix" ? "default" : "outline"}
          size="sm"
          onClick={() => navigate({ search: (prev) => ({ ...prev, source: "mix" }) })}
        >
          Balanced mix ({balanced.length})
        </Button>
        <Button
          variant={activeSource === "video" ? "default" : "outline"}
          size="sm"
          onClick={() => navigate({ search: (prev) => ({ ...prev, source: "video" }) })}
        >
          Video trends ({data.trends.length})
        </Button>
        <Button
          variant={activeSource === "wom" ? "default" : "outline"}
          size="sm"
          onClick={() => navigate({ search: (prev) => ({ ...prev, source: "wom" }) })}
        >
          Word of mouth ({data.wordOfMouth.length})
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant={!category ? "default" : "outline"}
          size="sm"
          onClick={() => navigate({ search: (prev) => ({ ...prev, category: undefined }) })}
        >
          All categories
        </Button>
        {data.categories.map((item) => (
          <Button
            key={item.slug}
            variant={category === item.slug ? "default" : "outline"}
            size="sm"
            onClick={() => navigate({ search: (prev) => ({ ...prev, category: item.slug }) })}
          >
            {item.name}
          </Button>
        ))}
      </div>

      {activeSource === "mix" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {balanced.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing trending in this category yet.</p>
          ) : (
            balanced.map((item) =>
              "trendKey" in item ? (
                <Card key={item.trendKey} className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 py-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        video trend
                      </span>
                      <Badge variant="outline">{item.platform}</Badge>
                    </div>
                    <h3 className="line-clamp-2 font-medium leading-snug text-foreground">
                      {item.title || item.caption.slice(0, 70)}
                    </h3>
                    <p className="line-clamp-3 text-sm text-muted-foreground">{item.caption}</p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="text-xs text-muted-foreground">
                        {compact.format(item.views)} views · {compact.format(item.likes)} likes
                      </span>
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                        >
                          View original
                        </a>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card key={item.womKey} className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 py-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                        word of mouth
                      </span>
                      <Badge variant="outline">{item.platform}</Badge>
                    </div>
                    <p className="line-clamp-5 text-sm leading-relaxed text-foreground">
                      {item.content || item.title}
                    </p>
                    <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                      <span className="text-xs text-muted-foreground">
                        {compact.format(item.likes)} likes · {compact.format(item.reposts)} reposts
                      </span>
                      {item.sourceUrl ? (
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                        >
                          View post
                        </a>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ),
            )
          )}
        </div>
      ) : activeSource === "wom" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.wordOfMouth.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No word-of-mouth chatter for this category yet — we're still ingesting X.
            </p>
          ) : (
            data.wordOfMouth.map((post) => (
              <Card key={post.womKey} className="h-full">
                <CardContent className="flex h-full flex-col gap-3 py-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">
                      {post.authorHandle ? `@${post.authorHandle}` : post.author}
                    </span>
                    <Badge variant="outline">{post.platform}</Badge>
                  </div>
                  <p className="line-clamp-5 text-sm leading-relaxed text-foreground">
                    {post.content || post.title}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {post.topic ? <Badge variant="secondary">{post.topic}</Badge> : null}
                    {post.theme ? <Badge variant="secondary">{post.theme}</Badge> : null}
                    {post.sentiment ? <Badge variant="secondary">{post.sentiment}</Badge> : null}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {compact.format(post.likes)} likes · {compact.format(post.reposts)} reposts
                    </span>
                    {post.sourceUrl ? (
                      <a
                        href={post.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                      >
                        View post
                      </a>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.trends.length === 0 ? (
            <p className="text-sm text-muted-foreground">No trends in this category yet.</p>
          ) : (
            data.trends.map((trend) => (
              <Card key={trend.trendKey} className="h-full">
                <CardContent className="flex h-full flex-col gap-3 py-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                      {trend.trendKey}
                    </span>
                    <Badge variant="outline">{trend.platform}</Badge>
                  </div>
                  <h3 className="line-clamp-2 font-medium leading-snug text-foreground">
                    {trend.title || trend.caption.slice(0, 70)}
                  </h3>
                  <p className="line-clamp-3 text-sm text-muted-foreground">{trend.caption}</p>
                  <div className="flex flex-wrap gap-2">
                    {trend.format ? <Badge variant="secondary">{trend.format}</Badge> : null}
                    {trend.hashtags.slice(0, 3).map((tag) => (
                      <Badge key={tag} variant="secondary">
                        #{tag}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <span className="text-xs text-muted-foreground">
                      {compact.format(trend.views)} views · {compact.format(trend.likes)} likes
                    </span>
                    {trend.sourceUrl ? (
                      <a
                        href={trend.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs underline underline-offset-4 text-muted-foreground hover:text-foreground"
                      >
                        View original
                      </a>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}


/** Signed-in users get trends matched to their brand; signed-out users get a CTA. */
function PersonalizedRail({
  categories,
  activeCategory,
  onTailor,
}: {
  categories: Array<{ slug: string; name: string }>;
  activeCategory: string | undefined;
  onTailor: (slug: string) => void;
}) {
  const { user, loading } = useAuth();
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchRecommendations = useServerFn(getRecommendations);
  const fetchChatter = useServerFn(getChatterRecommendations);
  const fetchIndexStatus = useServerFn(getTrendIndexStatus);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [tailored, setTailored] = useState(false);

  const companies = useQuery({
    queryKey: ["my-companies"],
    queryFn: () => fetchCompanies(),
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!companyId && companies.data?.length) setCompanyId(companies.data[0]!.id);
  }, [companies.data, companyId]);

  // Default the feed to the selected brand's category so it isn't a generic firehose.
  useEffect(() => {
    if (tailored || activeCategory || !companyId) return;
    const categoryName = companies.data?.find((company) => company.id === companyId)?.categoryName;
    const slug = categories.find((category) => category.name === categoryName)?.slug;
    if (!slug) return;
    setTailored(true);
    onTailor(slug);
  }, [activeCategory, categories, companies.data, companyId, onTailor, tailored]);

  const recommendations = useQuery({
    queryKey: ["trend-recommendations", companyId],
    queryFn: () => fetchRecommendations({ data: { companyId: companyId!, limit: 8 } }),
    enabled: Boolean(user && companyId),
  });


  const chatter = useQuery({
    queryKey: ["chatter-recommendations", companyId],
    queryFn: () => fetchChatter({ data: { companyId: companyId!, limit: 6 } }),
    enabled: Boolean(user && companyId),
  });

  const indexStatus = useQuery({
    queryKey: ["trend-index-status"],
    queryFn: () => fetchIndexStatus(),
    enabled: Boolean(user),
  });

  const semanticCount = (recommendations.data ?? []).filter((t) => t.matchType === "semantic").length;
  // Balanced rail: short-form video trends alternating with social chatter.
  const mixedFeed = interleave(recommendations.data ?? [], chatter.data ?? [], 10);

  if (loading) return null;

  if (!user) {
    return (
      <Card className="mt-10">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-6">
          <div>
            <h2 className="font-heading text-lg">See the trends that fit your brand</h2>
            <p className="text-sm text-muted-foreground">
              Sign in and Vira ranks these by how well they match your company's profile.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (companies.isSuccess && !companies.data.length) return null;

  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">For your brand</h2>
        {(companies.data?.length ?? 0) > 1 ? (
          <div className="flex flex-wrap gap-2">
            {companies.data!.map((company) => (
              <Button
                key={company.id}
                variant={company.id === companyId ? "default" : "outline"}
                size="sm"
                onClick={() => setCompanyId(company.id)}
              >
                {company.name}
              </Button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-4 grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-4">
        <RagStat
          label="Semantic matches"
          value={`${semanticCount}/${(recommendations.data ?? []).length}`}
          note="Vector hits vs. category fallback"
        />
        <RagStat
          label="Source mix"
          value={`${(recommendations.data ?? []).length} video / ${(chatter.data ?? []).length} chatter`}
          note="Video trends balanced with word of mouth"
        />
        <RagStat
          label="Index coverage"
          value={
            indexStatus.data ? (indexStatus.data.remaining === 0 ? "Complete" : "Backfilling") : "…"
          }
          note={
            indexStatus.data
              ? `${indexStatus.data.remaining} posts awaiting embeddings`
              : "Checking retrieval index"
          }
        />
        <RagStat
          label="Ranking blend"
          value="0.8 / 0.2"
          note="Cosine similarity vs. trend heat"
        />
      </div>

      {recommendations.isLoading || chatter.isLoading || companies.isLoading ? (
        <div className="mt-4 flex gap-4 overflow-hidden">
          {[0, 1, 2].map((key) => (
            <Skeleton key={key} className="h-36 w-72 shrink-0" />
          ))}
        </div>
      ) : (
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2">
          {mixedFeed.map((item) =>
            "trendKey" in item ? (
              <Card key={item.trendKey} className="w-72 shrink-0">
                <CardContent className="flex h-full flex-col gap-2 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{item.platform}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {item.matchType === "semantic"
                        ? `${Math.round(item.similarity * 100)}% match`
                        : "from your category"}
                    </span>
                  </div>
                  <h3 className="line-clamp-2 text-sm font-medium leading-snug">
                    {item.title || item.caption.slice(0, 70)}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {compact.format(item.views)} views · {compact.format(item.likes)} likes
                  </p>
                  <Button asChild size="sm" variant="secondary" className="mt-auto">
                    <Link to="/chat">Remix in chat</Link>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card key={item.womKey} className="w-72 shrink-0">
                <CardContent className="flex h-full flex-col gap-2 py-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{item.platform}</Badge>
                    <span className="text-xs text-muted-foreground">word of mouth</span>
                  </div>
                  <p className="line-clamp-4 text-sm leading-snug text-foreground">
                    {item.content || item.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {compact.format(item.likes)} likes · {compact.format(item.replies)} replies
                  </p>
                  <Button asChild size="sm" variant="secondary" className="mt-auto">
                    <Link to="/chat">Remix in chat</Link>
                  </Button>
                </CardContent>
              </Card>
            ),
          )}
        </div>
      )}
    </section>
  );
}

function RagStat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-serif text-xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
