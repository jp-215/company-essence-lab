import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import {
  approveRevision,
  getSessionResults,
  notifySessionComplete,
  runSynthesis,
} from "@/lib/terac/terac.functions";
import { describeDirective, type RevisionDirective } from "@/lib/terac/spec";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/reviews/$id")({
  head: () => ({ meta: [{ title: "Review results — Terac" }] }),
  component: ReviewResults,
});

function ReviewResults() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();

  const fetchResults = useServerFn(getSessionResults);
  const synthesise = useServerFn(runSynthesis);
  const approve = useServerFn(approveRevision);
  const notify = useServerFn(notifySessionComplete);

  const results = useQuery({
    queryKey: ["terac-results", id],
    queryFn: () => fetchResults({ data: { sessionId: id } }),
  });

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Record<string, RevisionDirective>>({});

  const synthesisMutation = useMutation({
    mutationFn: () => synthesise({ data: { sessionId: id } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["terac-results", id] });
      void notify({ data: { sessionId: id } }).catch(() => undefined);
      toast.success(
        result.engine === "llm"
          ? "Synthesis complete."
          : "Synthesis complete (deterministic — no AI key configured).",
      );
      if (result.rejectedOps.length) {
        toast.warning(`${result.rejectedOps.length} proposed change(s) were rejected as unsafe.`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Synthesis failed."),
  });

  const approveMutation = useMutation({
    mutationFn: (directive: RevisionDirective) => approve({ data: { directive } }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["terac-results", id] });
      toast.success(`Revision applied — v${result.version} created.`);
      if (result.rejected.length) {
        toast.warning(`${result.rejected.length} change(s) could not be applied.`);
      }
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Revision failed."),
  });

  const data = results.data;

  const directives = useMemo(() => {
    if (!data?.synthesis) return [];
    return data.synthesis.directives.map((d) => edits[d.video_id] ?? d);
  }, [data, edits]);

  if (results.isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (results.isError || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl px-4 py-12">
        <p className="text-sm text-muted-foreground">
          {results.error instanceof Error ? results.error.message : "Could not load this session."}
        </p>
        <Button asChild size="sm" variant="outline" className="mt-4">
          <Link to="/reviews">Back to sessions</Link>
        </Button>
      </div>
    );
  }

  const canSynthesise = data.status === "complete";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <Link to="/reviews" className="text-xs text-muted-foreground hover:text-foreground">
        ← All sessions
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
            {data.title}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data.submitted} of {data.invited} judges submitted · quorum {data.quorum} · closes{" "}
            {new Date(data.deadlineAt).toLocaleString()}
          </p>
        </div>
        {canSynthesise ? (
          <Button disabled={synthesisMutation.isPending} onClick={() => synthesisMutation.mutate()}>
            {synthesisMutation.isPending ? "Synthesising…" : "Run synthesis"}
          </Button>
        ) : null}
      </header>

      {data.synthesis ? (
        <Card className="mt-8">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-xl font-semibold tracking-tight">
                What the panel said
              </h2>
              <Badge variant="outline">
                {data.synthesis.engine === "llm" ? "AI synthesis" : "Deterministic synthesis"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-foreground">{data.synthesis.summary}</p>
            {data.synthesis.consensusThemes.length ? (
              <ul className="mt-4 space-y-1.5">
                {data.synthesis.consensusThemes.map((theme) => (
                  <li key={theme} className="text-sm text-muted-foreground">
                    — {theme}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <section className="mt-10">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Ranked</h2>
        <div className="mt-4 space-y-3">
          {data.videos.map((video, index) => (
            <Card key={video.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-muted-foreground">
                        #{index + 1}
                      </span>
                      <h3 className="font-medium text-foreground">{video.conceptTitle}</h3>
                      {video.version > 1 ? (
                        <Badge variant="secondary">v{video.version}</Badge>
                      ) : null}
                      {video.mediaStatus === "storyboard" ? (
                        <Badge variant="outline">storyboard</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1.5 text-sm italic text-muted-foreground">
                      “{video.hookText}”
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-foreground">
                      {video.tally.picks} pick{video.tally.picks === 1 ? "" : "s"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {video.tally.rankPoints} rank pts
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {video.tally.dimensions
                    .filter((d) => d.rated > 0)
                    .map((dimension) => (
                      <span
                        key={dimension.dimension}
                        className={[
                          "rounded-md px-2 py-1 text-[11px]",
                          dimension.isConsensusWeak
                            ? "bg-rose-100 text-rose-900"
                            : dimension.score > 0.5
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-secondary text-muted-foreground",
                        ].join(" ")}
                      >
                        {dimension.label} {dimension.weak}/{dimension.okay}/{dimension.strong}
                      </span>
                    ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {data.themes.length ? (
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">
            What they said, by theme
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Grouped by the weakness each judge flagged, not by who said it.
          </p>
          <div className="mt-4 space-y-4">
            {data.themes.map((group) => (
              <Card key={group.theme}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{group.theme}</h3>
                    <Badge variant="secondary">{group.comments.length}</Badge>
                  </div>
                  <ul className="mt-3 space-y-2.5">
                    {group.comments.map((comment, i) => (
                      <li key={i} className="border-l-2 border-border pl-3 text-sm">
                        <p className="leading-relaxed text-foreground">{comment.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {comment.judgeName} · on {comment.videoTitle}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      {directives.length ? (
        <section className="mt-12">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Proposed revisions</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each is a diff against the original recipe, not a fresh brief. Nothing regenerates until
            you approve it.
          </p>

          <div className="mt-4 space-y-4">
            {directives.map((directive) => {
              const video = data.videos.find((v) => v.id === directive.video_id);
              if (!video || dismissed.has(directive.video_id)) return null;
              const lines = describeDirective(directive);

              return (
                <Card key={directive.video_id}>
                  <CardContent className="p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium text-foreground">{video.conceptTitle}</h3>
                      <Badge variant={directive.verdict === "keep" ? "secondary" : "outline"}>
                        {directive.verdict}
                      </Badge>
                    </div>

                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {directive.rationale}
                    </p>

                    {lines.length ? (
                      <ul className="mt-4 space-y-1.5 rounded-md bg-secondary/60 p-4">
                        {lines.map((line, i) => (
                          <li key={i} className="text-sm leading-relaxed text-foreground">
                            {line}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-4 text-sm text-muted-foreground">
                        No structural changes proposed.
                      </p>
                    )}

                    {directive.ops.some((op) => op.op === "replace") ? (
                      <div className="mt-4 space-y-2">
                        <p className="text-xs uppercase tracking-wider text-muted-foreground">
                          Edit before approving
                        </p>
                        {directive.ops.map((op, opIndex) =>
                          op.op === "replace" ? (
                            <Textarea
                              key={opIndex}
                              value={String(op.value)}
                              rows={2}
                              aria-label={`New value for ${op.path}`}
                              onChange={(event) => {
                                const next: RevisionDirective = {
                                  ...directive,
                                  ops: directive.ops.map((o, i) =>
                                    i === opIndex && o.op === "replace"
                                      ? { ...o, value: event.target.value }
                                      : o,
                                  ),
                                };
                                setEdits((prev) => ({ ...prev, [directive.video_id]: next }));
                              }}
                            />
                          ) : null,
                        )}
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        disabled={approveMutation.isPending || directive.ops.length === 0}
                        onClick={() => approveMutation.mutate(directive)}
                      >
                        {approveMutation.isPending ? "Applying…" : "Approve and regenerate"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDismissed((prev) => new Set(prev).add(directive.video_id))
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}
