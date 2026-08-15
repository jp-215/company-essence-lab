import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import {
  listKnowledgeBase,
  searchKnowledgeBase,
  syncMyKnowledge,
} from "@/lib/knowledge.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl">Brand knowledge base</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every owner, company, intention and mission on the marketplace — plus the enriched
            positioning, tone and ad themes that power recommendations.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          {syncMutation.isPending ? "Indexing…" : "Re-index my companies"}
        </Button>
      </header>

      <Card className="mb-8">
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="font-heading text-lg">Find similar brands</h2>
            <p className="text-sm text-muted-foreground">
              Describe a mission, audience or ad angle — matching is semantic, not keyword based.
            </p>
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              if (semanticQuery.trim().length < 3) {
                toast.error("Use at least 3 characters.");
                return;
              }
              searchMutation.mutate(semanticQuery.trim());
            }}
          >
            <Input
              value={semanticQuery}
              onChange={(event) => setSemanticQuery(event.target.value)}
              placeholder="e.g. sustainable skincare for young parents"
            />
            <Button type="submit" disabled={searchMutation.isPending}>
              {searchMutation.isPending ? "Searching…" : "Search"}
            </Button>
          </form>

          {searchMutation.isSuccess && matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No matches yet — re-index companies so their knowledge is embedded.
            </p>
          ) : null}

          {matches.length > 0 ? (
            <ul className="space-y-3">
              {matches.map((match) => (
                <li key={match.companyId} className="rounded-md border border-border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to="/companies/$slug"
                      params={{ slug: match.slug }}
                      className="font-heading text-base underline-offset-4 hover:underline"
                    >
                      {match.companyName}
                    </Link>
                    <Badge variant="secondary">
                      {Math.round(match.similarity * 100)}% match · {match.categoryName}
                    </Badge>
                  </div>
                  {match.positioning ? (
                    <p className="mt-2 text-sm text-muted-foreground">{match.positioning}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <form
        className="mb-6 flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedKeyword(keyword.trim());
        }}
      >
        <Input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="Filter by company, owner or text"
        />
        <Button type="submit" variant="secondary">
          Filter
        </Button>
      </form>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (entries ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing in the knowledge base yet. Add a company, then re-index.
        </p>
      ) : (
        <ul className="space-y-4">
          {(entries ?? []).map((entry) => (
            <li key={entry.companyId}>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.slug ? (
                        <Link
                          to="/companies/$slug"
                          params={{ slug: entry.slug }}
                          className="font-heading text-lg underline-offset-4 hover:underline"
                        >
                          {entry.companyName}
                        </Link>
                      ) : (
                        <span className="font-heading text-lg">{entry.companyName}</span>
                      )}
                      <Badge variant="outline">{entry.categoryName}</Badge>
                      {entry.isMine ? <Badge>Yours</Badge> : null}
                      {entry.indexed ? null : <Badge variant="secondary">Not embedded</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">Owner: {entry.ownerName}</span>
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">Bio</dt>
                      <dd className="text-sm">{entry.bio || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                        Mission
                      </dt>
                      <dd className="text-sm">{entry.mission || "—"}</dd>
                    </div>
                    {entry.positioning ? (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          Positioning
                        </dt>
                        <dd className="text-sm">{entry.positioning}</dd>
                      </div>
                    ) : null}
                    {entry.tone ? (
                      <div>
                        <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                          Tone
                        </dt>
                        <dd className="text-sm">{entry.tone}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {entry.keywords.length > 0 || entry.adThemes.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {entry.keywords.map((word) => (
                        <Badge key={`k-${word}`} variant="secondary">
                          {word}
                        </Badge>
                      ))}
                      {entry.adThemes.map((theme) => (
                        <Badge key={`a-${theme}`} variant="outline">
                          {theme}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
