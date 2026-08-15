import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { listKnowledgeBase, searchKnowledgeBase, syncMyKnowledge } from "@/lib/knowledge.functions";
import { getTrendIndexStatus, runTrendEmbeddingBackfill } from "@/lib/trend-embeddings.functions";
import {
  Eyebrow,
  Lead,
  MetaLabel,
  PageShell,
  PageTitle,
  Panel,
  SectionTitle,
} from "@/components/Page";

import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({
    meta: [
      { title: "Brand knowledge base — Vira" },
      {
        name: "description",
        content:
          "Search every brand's owner, bio, mission and enriched advertising signals in one knowledge base.",
      },
      { property: "og:title", content: "Brand knowledge base — Vira" },
      {
        property: "og:description",
        content: "Owners, missions and ad signals for every brand on the marketplace.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: KnowledgePage,
});

function KnowledgePage() {
  const queryClient = useQueryClient();
  const fetchEntries = useServerFn(listKnowledgeBase);
  const semanticSearch = useServerFn(searchKnowledgeBase);
  const sync = useServerFn(syncMyKnowledge);

  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [semanticQuery, setSemanticQuery] = useState("");

  const { data: entries, isLoading } = useQuery({
    queryKey: ["knowledge", appliedKeyword],
    queryFn: () => fetchEntries({ data: { search: appliedKeyword } }),
  });

  const searchMutation = useMutation({
    mutationFn: (query: string) => semanticSearch({ data: { query, limit: 6 } }),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Search failed."),
  });

  const fetchTrendIndexStatus = useServerFn(getTrendIndexStatus);
  const backfillTrends = useServerFn(runTrendEmbeddingBackfill);
  const [trendProgress, setTrendProgress] = useState(0);

  const { data: trendIndex } = useQuery({
    queryKey: ["trend-index-status"],
    queryFn: () => fetchTrendIndexStatus(),
  });

  const trendBackfillMutation = useMutation({
    mutationFn: async () => {
      let embedded = 0;
      // Loop batches until every trend is embedded; each call is idempotent.
      for (;;) {
        const result = await backfillTrends({ data: { batchSize: 100 } });
        embedded += result.embedded;
        setTrendProgress(embedded);
        if (result.remaining === 0 || result.embedded === 0) {
          return { ...result, embedded };
        }
      }
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["trend-index-status"] });
      if (result.remaining === 0) {
        toast.success(`All trends indexed (${result.embedded} embedded this run).`);
      } else {
        toast.error(
          `Indexed ${result.embedded}, but ${result.remaining} remain — is AI configured?`,
        );
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Indexing failed."),
  });

  const syncMutation = useMutation({
    mutationFn: () => sync(),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      toast.success(
        result.synced === 0
          ? "No companies to index yet."
          : `Indexed ${result.synced} ${result.synced === 1 ? "company" : "companies"}.`,
      );
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Sync failed."),
  });

  const matches = searchMutation.data ?? [];

  return (
    <PageShell>
      <Eyebrow live>Knowledge base</Eyebrow>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div>
          <PageTitle>Every brand, owner and mission</PageTitle>
          <Lead className="mt-4 max-w-2xl">
            The indexed purpose identity behind each company — owner, bio, mission, plus the
            enriched positioning, tone and ad themes powering recommendations.
          </Lead>
        </div>
        <button
          type="button"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="rounded-xl border border-border bg-card px-6 py-3 text-base font-medium text-foreground transition-colors hover:border-ring disabled:opacity-60"
        >
          {syncMutation.isPending ? "Indexing…" : "Re-index my companies"}
        </button>
      </div>

      <Panel className="mt-12 flex flex-wrap items-center justify-between gap-6 p-8">
        <div>
          <SectionTitle>Trend recommendations index</SectionTitle>
          <p className="mt-2 max-w-xl text-base text-muted-foreground">
            {trendIndex
              ? trendIndex.remaining === 0
                ? "Every trend is embedded — recommendations are fully semantic."
                : `${trendIndex.remaining} trends still need embedding before recommendations are fully semantic.`
              : "Checking trend index…"}{" "}
            Newly ingested trends are picked up by re-running this.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setTrendProgress(0);
            trendBackfillMutation.mutate();
          }}
          disabled={trendBackfillMutation.isPending || trendIndex?.remaining === 0}
          className="rounded-xl border border-border bg-card px-6 py-3 text-base font-medium text-foreground transition-colors hover:border-ring disabled:opacity-60"
        >
          {trendBackfillMutation.isPending
            ? `Indexing trends… (${trendProgress} done)`
            : `Index trends${trendIndex && trendIndex.remaining > 0 ? ` (${trendIndex.remaining} remaining)` : ""}`}
        </button>
      </Panel>

      <Panel className="mt-12 p-8">
        <SectionTitle>Find similar brands</SectionTitle>
        <p className="mt-2 text-base text-muted-foreground">
          Describe a mission, audience or ad angle — matching is semantic, not keyword based.
        </p>
        <form
          className="mt-6 flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (semanticQuery.trim().length < 3) {
              toast.error("Use at least 3 characters.");
              return;
            }
            searchMutation.mutate(semanticQuery.trim());
          }}
        >
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
              /
            </span>
            <Input
              value={semanticQuery}
              onChange={(event) => setSemanticQuery(event.target.value)}
              placeholder="e.g. sustainable skincare for young parents"
              className="h-12 rounded-full border-border bg-card pl-10 text-base"
            />
          </div>
          <button
            type="submit"
            disabled={searchMutation.isPending}
            className="rounded-full bg-foreground px-7 py-3 text-base font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {searchMutation.isPending ? "Searching…" : "Search"}
          </button>
        </form>

        {searchMutation.isSuccess && matches.length === 0 ? (
          <p className="mt-6 text-base text-muted-foreground">
            No matches yet — re-index companies so their knowledge is embedded.
          </p>
        ) : null}

        {matches.length > 0 ? (
          <ul className="mt-6 space-y-4">
            {matches.map((match) => (
              <li key={match.companyId} className="rounded-2xl border border-border p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <Link
                    to="/companies/$slug"
                    params={{ slug: match.slug }}
                    className="font-serif text-xl font-bold tracking-tight text-foreground underline-offset-4 hover:underline"
                  >
                    {match.companyName}
                  </Link>
                  <span className="rounded-full bg-secondary px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground">
                    {Math.round(match.similarity * 100)}% match · {match.categoryName}
                  </span>
                </div>
                {match.positioning ? (
                  <p className="mt-3 text-base text-muted-foreground">{match.positioning}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <form
        className="mt-12 flex flex-col gap-3 border-y border-border py-6 sm:flex-row sm:items-center"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedKeyword(keyword.trim());
        }}
      >
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Filter by company, owner or text"
          className="h-12 flex-1 rounded-full border-border bg-card text-base"
        />
        <button
          type="submit"
          className="rounded-full border border-border bg-card px-7 py-3 text-base font-medium text-foreground transition-colors hover:border-ring"
        >
          Filter
        </button>
      </form>

      {isLoading ? (
        <div className="mt-8 space-y-4">
          <Skeleton className="h-40 w-full rounded-2xl" />
          <Skeleton className="h-40 w-full rounded-2xl" />
        </div>
      ) : (entries ?? []).length === 0 ? (
        <p className="mt-8 text-base text-muted-foreground">
          Nothing in the knowledge base yet. Add a company, then re-index.
        </p>
      ) : (
        <ul className="mt-8 space-y-6">
          {(entries ?? []).map((entry) => (
            <li key={entry.companyId}>
              <Panel className="space-y-5 p-8">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    {entry.slug ? (
                      <Link
                        to="/companies/$slug"
                        params={{ slug: entry.slug }}
                        className="font-serif text-2xl font-bold tracking-tight text-foreground underline-offset-4 hover:underline"
                      >
                        {entry.companyName}
                      </Link>
                    ) : (
                      <span className="font-serif text-2xl font-bold tracking-tight text-foreground">
                        {entry.companyName}
                      </span>
                    )}
                    <span className="rounded-full border border-border px-4 py-1.5 text-sm text-foreground">
                      {entry.categoryName}
                    </span>
                    {entry.isMine ? (
                      <span className="rounded-full bg-foreground px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-background">
                        Yours
                      </span>
                    ) : null}
                    {entry.indexed ? null : (
                      <span className="rounded-full bg-secondary px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        Not embedded
                      </span>
                    )}
                  </div>
                  <MetaLabel>Owner · {entry.ownerName}</MetaLabel>
                </div>

                <dl className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <dt>
                      <MetaLabel>Bio</MetaLabel>
                    </dt>
                    <dd className="mt-1 text-base text-foreground">{entry.bio || "—"}</dd>
                  </div>
                  <div>
                    <dt>
                      <MetaLabel>Mission</MetaLabel>
                    </dt>
                    <dd className="mt-1 text-base text-foreground">{entry.mission || "—"}</dd>
                  </div>
                  {entry.positioning ? (
                    <div>
                      <dt>
                        <MetaLabel>Positioning</MetaLabel>
                      </dt>
                      <dd className="mt-1 text-base text-foreground">{entry.positioning}</dd>
                    </div>
                  ) : null}
                  {entry.tone ? (
                    <div>
                      <dt>
                        <MetaLabel>Tone</MetaLabel>
                      </dt>
                      <dd className="mt-1 text-base text-foreground">{entry.tone}</dd>
                    </div>
                  ) : null}
                </dl>

                {entry.keywords.length > 0 || entry.adThemes.length > 0 ? (
                  <div className="flex flex-wrap gap-2 border-t border-border pt-5">
                    {entry.keywords.map((word) => (
                      <span
                        key={`k-${word}`}
                        className="rounded-md bg-secondary px-3 py-1 text-sm text-foreground"
                      >
                        {word}
                      </span>
                    ))}
                    {entry.adThemes.map((theme) => (
                      <span
                        key={`a-${theme}`}
                        className="rounded-md border border-border px-3 py-1 text-sm text-foreground"
                      >
                        {theme}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Panel>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  );
}
