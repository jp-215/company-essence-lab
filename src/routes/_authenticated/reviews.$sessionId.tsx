import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import {
  approveRevision,
  dismissRevision,
  getReminderTargets,
  getSessionResults,
  runSynthesis,
  updateRevision,
} from "@/lib/terac.functions";
import { REVIEW_DIMENSIONS, type RevisionDirective } from "@/lib/terac-types";
import { Eyebrow, MetaLabel, PageShell, PageTitle, Panel, Stat, StatRow } from "@/components/Page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/reviews/$sessionId")({
  head: () => ({
    meta: [
      { title: "Review results — Vira" },
      {
        name: "description",
        content: "Ranked concepts, judge feedback grouped by theme, and proposed revisions.",
      },
      { property: "og:title", content: "Review results — Vira" },
      {
        property: "og:description",
        content: "What the expert panel picked, and the exact revisions they imply.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewResultsPage,
});

function ReviewResultsPage() {
  const { sessionId } = Route.useParams();
  const queryClient = useQueryClient();
  const fetchResults = useServerFn(getSessionResults);
  const fetchReminders = useServerFn(getReminderTargets);
  const synthesize = useServerFn(runSynthesis);
  const approve = useServerFn(approveRevision);
  const dismiss = useServerFn(dismissRevision);
  const editRevision = useServerFn(updateRevision);

  const results = useQuery({
    queryKey: ["terac-session", sessionId],
    queryFn: () => fetchResults({ data: { sessionId } }),
    refetchInterval: 20_000,
  });
  const reminders = useQuery({
    queryKey: ["terac-reminders", sessionId],
    queryFn: () => fetchReminders({ data: { sessionId } }),
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ["terac-session", sessionId] });

  const synthesisMutation = useMutation({
    mutationFn: () => synthesize({ data: { sessionId } }),
    onSuccess: invalidate,
  });
  const approveMutation = useMutation({
    mutationFn: (videoId: string) => approve({ data: { sessionId, videoId } }),
    onSuccess: invalidate,
  });
  const dismissMutation = useMutation({
    mutationFn: (videoId: string) => dismiss({ data: { sessionId, videoId } }),
    onSuccess: invalidate,
  });
  const editMutation = useMutation({
    mutationFn: (input: { videoId: string; changes: RevisionDirective["changes"] }) =>
      editRevision({ data: { sessionId, ...input } }),
    onSuccess: invalidate,
  });

  if (results.isLoading) {
    return (
      <PageShell width="narrow">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="mt-6 h-32 w-full rounded-2xl" />
      </PageShell>
    );
  }
  if (results.error || !results.data) {
    return (
      <PageShell width="narrow">
        <PageTitle>Round not found</PageTitle>
        <Button asChild size="sm" className="mt-6">
          <Link to="/reviews">Back to rounds</Link>
        </Button>
      </PageShell>
    );
  }

  const { session, judges, videos, themes, synthesis } = results.data;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  return (
    <PageShell width="narrow">
      <Eyebrow live={session.status === "open"}>Terac · {session.companyName}</Eyebrow>
      <PageTitle className="mt-6">
        Sent to {judges.length} judge{judges.length === 1 ? "" : "s"} · {session.submittedCount}{" "}
        reviewed
      </PageTitle>

      <StatRow className="mt-8 grid-cols-3">
        <Stat label="Concepts in round" value={String(session.videoCount)} />
        <Stat label={`Quorum ${session.quorum}`} value={`${session.submittedCount}/${judges.length}`} />
        <Stat
          label="Deadline"
          value={new Date(session.deadlineAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        />
      </StatRow>

      {/* Per-judge status + copyable token links */}
      <Panel className="mt-6 p-6">
        <MetaLabel>Judges</MetaLabel>
        <ul className="mt-4 space-y-3">
          {judges.map((judge) => (
            <li key={judge.id} className="flex flex-wrap items-center gap-3 text-sm">
              <span className="font-medium">{judge.name}</span>
              <Badge variant={judge.status === "submitted" ? "default" : "outline"}>
                {judge.status}
              </Badge>
              <span className="text-xs text-muted-foreground">{judge.email}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  void navigator.clipboard.writeText(`${origin}/terac/r/${judge.inviteToken}`)
                }
              >
                Copy review link
              </Button>
            </li>
          ))}
        </ul>
        {reminders.data?.due && reminders.data.judges.length ? (
          <p className="mt-4 text-sm text-muted-foreground">
            Past the halfway mark — {reminders.data.judges.map((j) => j.name).join(", ")} still
            haven't opened their link. Resend it.
          </p>
        ) : null}
      </Panel>

      {/* Synthesis */}
      <div className="mt-12 flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-serif text-3xl font-bold tracking-tight">What the panel said</h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={synthesisMutation.isPending || session.submittedCount === 0}
          onClick={() => synthesisMutation.mutate()}
        >
          {synthesisMutation.isPending
            ? "Reading feedback…"
            : synthesis
              ? "Re-run synthesis"
              : "Synthesize feedback"}
        </Button>
      </div>
      {synthesisMutation.error ? (
        <p className="mt-3 text-sm text-destructive">{(synthesisMutation.error as Error).message}</p>
      ) : null}

      {synthesis ? (
        <Panel className="mt-4 p-6">
          <p className="text-base leading-relaxed">{synthesis.summary}</p>
          {synthesis.consensusThemes.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {synthesis.consensusThemes.map((theme) => (
                <Badge key={theme} variant="outline">
                  {theme}
                </Badge>
              ))}
            </div>
          ) : null}
        </Panel>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">
          {session.submittedCount === 0
            ? "No judge has submitted yet. Nothing is visible until they do."
            : "Run the synthesis to turn votes and notes into proposed revisions."}
        </p>
      )}

      {/* Comments grouped by theme, not by judge */}
      {themes.length ? (
        <div className="mt-10 space-y-4">
          <MetaLabel>Feedback by theme</MetaLabel>
          {themes.map((group) => (
            <Panel key={group.theme} className="p-6">
              <p className="font-serif text-xl font-bold">{group.theme}</p>
              <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                {group.notes.map((note, position) => (
                  <li key={`${note.judgeName}-${position}`}>
                    "{note.body}" — {note.judgeName}
                  </li>
                ))}
              </ul>
            </Panel>
          ))}
        </div>
      ) : null}

      {/* Ranked videos */}
      <h2 className="mt-14 font-serif text-3xl font-bold tracking-tight">Ranked concepts</h2>
      <div className="mt-6 space-y-4">
        {videos.map((item, position) => {
          const directive = synthesis?.revisionDirectives.find(
            (entry) => entry.videoId === item.video.id,
          );
          const verdict = synthesis?.videoVerdicts.find(
            (entry) => entry.videoId === item.video.id,
          );
          return (
            <Panel key={item.video.id} className="p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-serif text-2xl font-bold">#{position + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  {item.video.conceptTitle || item.video.hookText}
                </span>
                <Badge variant="outline">v{item.video.version}</Badge>
                <span className="text-sm text-muted-foreground">
                  {item.picks} pick{item.picks === 1 ? "" : "s"}
                  {item.averageRank ? ` · avg rank ${item.averageRank.toFixed(1)}` : ""}
                </span>
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{item.video.hookText}</p>

              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {REVIEW_DIMENSIONS.map((dimension) => {
                  const tally = item.dimensionTally[dimension.key] ?? {
                    weak: 0,
                    okay: 0,
                    strong: 0,
                  };
                  return (
                    <div key={dimension.key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{dimension.label}</span>
                      <span className="font-mono">
                        {tally.strong} strong · {tally.okay} okay · {tally.weak} weak
                      </span>
                    </div>
                  );
                })}
              </div>

              {verdict ? (
                <p className="mt-4 text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {verdict.standing}
                  </span>{" "}
                  {verdict.verdict}
                </p>
              ) : null}

              {directive && directive.status !== "dismissed" ? (
                <RevisionCard
                  directive={directive}
                  pending={approveMutation.isPending || dismissMutation.isPending}
                  onApprove={() => approveMutation.mutate(item.video.id)}
                  onDismiss={() => dismissMutation.mutate(item.video.id)}
                  onEdit={(changes) => editMutation.mutate({ videoId: item.video.id, changes })}
                />
              ) : null}

              {item.video.parentVideoId ? (
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                  Revision of an earlier cut · awaiting render
                </p>
              ) : null}
            </Panel>
          );
        })}
      </div>
    </PageShell>
  );
}

/** A revision shown as plain English, then as the exact diff it will apply. */
function RevisionCard({
  directive,
  pending,
  onApprove,
  onDismiss,
  onEdit,
}: {
  directive: RevisionDirective;
  pending: boolean;
  onApprove: () => void;
  onDismiss: () => void;
  onEdit: (changes: RevisionDirective["changes"]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState(directive.changes);

  return (
    <div className="mt-5 rounded-xl border border-border bg-secondary p-5">
      <MetaLabel>
        {directive.status === "approved" ? "Revision approved" : "Proposed revision"}
      </MetaLabel>
      <p className="mt-2 text-sm leading-relaxed">{directive.rationale}</p>

      <ul className="mt-4 space-y-3 text-sm">
        {(editing ? drafts : directive.changes).map((change, position) => (
          <li key={`${change.element}-${position}`}>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              {change.action} {change.element}
            </p>
            {editing && change.action !== "keep" ? (
              <Textarea
                value={change.to ?? ""}
                rows={3}
                className="mt-1"
                onChange={(event) =>
                  setDrafts((previous) =>
                    previous.map((item, itemIndex) =>
                      itemIndex === position ? { ...item, to: event.target.value } : item,
                    ),
                  )
                }
              />
            ) : (
              <p className="mt-1">{change.to ?? "unchanged"}</p>
            )}
          </li>
        ))}
      </ul>

      {directive.status === "approved" ? null : (
        <div className="mt-4 flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onEdit(drafts);
                  setEditing(false);
                }}
              >
                Save edits
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button type="button" size="sm" disabled={pending} onClick={onApprove}>
                Approve &amp; regenerate
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(true)}>
                Edit first
              </Button>
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onDismiss}>
                Dismiss
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
