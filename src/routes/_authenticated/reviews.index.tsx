import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import {
  createJudge,
  listJudges,
  listReviewSessions,
  runReminders,
  setJudgeActive,
} from "@/lib/terac/terac.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/reviews/")({
  head: () => ({
    meta: [
      { title: "Terac reviews — Vira" },
      {
        name: "description",
        content: "Expert review sessions on your ad concepts, and the judge roster behind them.",
      },
    ],
  }),
  component: ReviewsIndex,
});

const STATUS_COPY: Record<string, string> = {
  generating: "Generating",
  ready: "Ready to send",
  sent: "Out with judges",
  in_review: "Being reviewed",
  complete: "Ready to synthesise",
  synthesized: "Synthesis ready",
  actioned: "Revisions started",
  closed: "Closed",
};

function ReviewsIndex() {
  const queryClient = useQueryClient();
  const fetchSessions = useServerFn(listReviewSessions);
  const fetchJudges = useServerFn(listJudges);
  const addJudge = useServerFn(createJudge);
  const toggleJudge = useServerFn(setJudgeActive);
  const nudge = useServerFn(runReminders);

  const sessions = useQuery({ queryKey: ["terac-sessions"], queryFn: () => fetchSessions() });
  const judges = useQuery({ queryKey: ["terac-judges"], queryFn: () => fetchJudges() });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [tags, setTags] = useState("");

  const judgeMutation = useMutation({
    mutationFn: () =>
      addJudge({
        data: {
          name,
          email,
          expertiseTags: tags
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(0, 12),
        },
      }),
    onSuccess: () => {
      setName("");
      setEmail("");
      setTags("");
      void queryClient.invalidateQueries({ queryKey: ["terac-judges"] });
      toast.success("Judge added to your roster.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not add judge."),
  });

  const reminderMutation = useMutation({
    mutationFn: () => nudge({}),
    onSuccess: (result) =>
      toast.success(
        result.sent === 0 ? "No reminders were due." : `Reminded ${result.sent} judge(s).`,
      ),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Reminder run failed."),
  });

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12">
      <header className="max-w-3xl">
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Terac</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-foreground">
          Expert review, between generation and ship
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Every press of Create Ads opens one review session — all the concepts from that press, one
          link per judge, judged side by side. A session closes on quorum or deadline, whichever
          comes first.
        </p>
      </header>

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">Sessions</h2>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={reminderMutation.isPending}
              onClick={() => reminderMutation.mutate()}
            >
              {reminderMutation.isPending ? "Sending…" : "Send due reminders"}
            </Button>
            <Button asChild size="sm">
              <Link to="/remix">Create ads</Link>
            </Button>
          </div>
        </div>

        {sessions.isLoading ? (
          <Skeleton className="mt-4 h-40 w-full" />
        ) : !sessions.data?.length ? (
          <Card className="mt-4">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="text-sm text-muted-foreground">
                No review sessions yet. Pick concepts in the remix studio and send them to a panel.
              </p>
              <Button asChild size="sm">
                <Link to="/remix">Go to remix studio</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="mt-4 space-y-3">
            {sessions.data.map((session) => (
              <Card key={session.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-medium text-foreground">{session.title}</h3>
                        <Badge variant="outline">
                          {STATUS_COPY[session.status] ?? session.status}
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-sm text-muted-foreground">
                        Sent to {session.invited} judge{session.invited === 1 ? "" : "s"} ·{" "}
                        <span className="font-medium text-foreground">
                          {session.submitted} reviewed
                        </span>{" "}
                        · quorum {session.quorum} · {session.videoCount} ad
                        {session.videoCount === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Closes {new Date(session.deadlineAt).toLocaleString()}
                      </p>
                    </div>
                    <Button asChild size="sm" variant="outline">
                      <Link to="/reviews/$id" params={{ id: session.id }}>
                        {session.hasSynthesis ? "See results" : "Open"}
                      </Link>
                    </Button>
                  </div>

                  <div
                    className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
                    role="progressbar"
                    aria-valuenow={session.submitted}
                    aria-valuemin={0}
                    aria-valuemax={session.quorum}
                    aria-label="Reviews submitted toward quorum"
                  >
                    <div
                      className="h-full rounded-full bg-foreground transition-all"
                      style={{
                        width: `${Math.min(100, (session.submitted / Math.max(session.quorum, 1)) * 100)}%`,
                      }}
                    />
                  </div>

                  {session.judges.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {session.judges.map((judge, i) => (
                        <li
                          key={`${judge.name}-${i}`}
                          className="rounded-md bg-secondary/60 px-2.5 py-1 text-xs text-muted-foreground"
                        >
                          <span className="font-medium text-foreground">{judge.name}</span>
                          {" · "}
                          {judge.status === "submitted"
                            ? "reviewed"
                            : judge.status === "opened"
                              ? "opened"
                              : "not opened"}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-14">
        <h2 className="font-serif text-2xl font-semibold tracking-tight">Judge roster</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Judges never create a password. Each gets a unique link tied to one session.
        </p>

        <Card className="mt-4">
          <CardContent className="p-5">
            <form
              className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                judgeMutation.mutate();
              }}
            >
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Name"
                required
                aria-label="Judge name"
              />
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                required
                aria-label="Judge email"
              />
              <Input
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="Expertise, comma separated"
                aria-label="Expertise tags"
              />
              <Button type="submit" disabled={judgeMutation.isPending}>
                {judgeMutation.isPending ? "Adding…" : "Add judge"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {judges.isLoading ? (
          <Skeleton className="mt-4 h-24 w-full" />
        ) : judges.data?.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {judges.data.map((judge) => (
              <Card key={judge.id}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{judge.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{judge.email}</p>
                    {judge.expertise_tags?.length ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {judge.expertise_tags.map((tag: string) => (
                          <Badge key={tag} variant="secondary" className="text-[10px]">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      toggleJudge({ data: { judgeId: judge.id, active: !judge.active } }).then(() =>
                        queryClient.invalidateQueries({ queryKey: ["terac-judges"] }),
                      )
                    }
                  >
                    {judge.active ? "Pause" : "Activate"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No judges yet. Add one above before creating a review session.
          </p>
        )}
      </section>
    </div>
  );
}
