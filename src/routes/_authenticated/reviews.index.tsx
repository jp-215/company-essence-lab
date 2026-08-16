import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { listReviewSessions, runReminders } from "@/lib/terac/terac.functions";
import { listMyCompanies } from "@/lib/owner.functions";
import { CreateReviewPanel } from "@/components/terac/CreateReviewPanel";
import { SendInviteRow } from "@/components/terac/InviteJudges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


export const Route = createFileRoute("/_authenticated/reviews/")({
  head: () => ({
    meta: [
      { title: "Terac reviews — Vira" },
      {
        name: "description",
        content:
          "Open your ad concepts to the Terac agent pool and watch votes and feedback come in.",
      },
      { property: "og:title", content: "Terac reviews — Vira" },
      {
        property: "og:description",
        content: "Expert agents vote on your ad concepts before you ship.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewsIndex,
});

const STATUS_COPY: Record<string, string> = {
  generating: "Generating",
  ready: "Ready to open",
  sent: "Open to agents",
  in_review: "Being reviewed",
  complete: "Ready to synthesise",
  synthesized: "Synthesis ready",
  actioned: "Revisions started",
  closed: "Closed",
};

function ReviewsIndex() {
  const fetchSessions = useServerFn(listReviewSessions);
  const nudge = useServerFn(runReminders);
  const fetchCompanies = useServerFn(listMyCompanies);

  const sessions = useQuery({ queryKey: ["terac-sessions"], queryFn: () => fetchSessions() });
  const companies = useQuery({ queryKey: ["my-companies"], queryFn: () => fetchCompanies() });

  const [companyId, setCompanyId] = useState("");
  useEffect(() => {
    if (!companyId && companies.data?.length) setCompanyId(companies.data[0]!.id);
  }, [companies.data, companyId]);


  const reminderMutation = useMutation({
    mutationFn: () => nudge({}),
    onSuccess: (result) =>
      toast.success(
        result.sent === 0 ? "No reminders were due." : `Reminded ${result.sent} agent(s).`,
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
          Every press of Create Ads opens one review session as a task in the Terac agent pool.
          Share its link: any agent willing to take it sees every ad, votes for their favourite and
          writes feedback. A session closes on quorum or deadline, whichever comes first.
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
              <a href="#open-review">Open a review</a>
            </Button>
          </div>
        </div>

        {sessions.isLoading ? (
          <Skeleton className="mt-4 h-40 w-full" />
        ) : !sessions.data?.length ? (
          <Card className="mt-4">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="text-sm text-muted-foreground">
                No review sessions yet. Pick concepts below and Vira opens one session with a
                shareable Terac agent link.
              </p>
              <Button asChild size="sm">
                <a href="#open-review">Pick concepts</a>
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
                        {session.claimed} agent{session.claimed === 1 ? "" : "s"} claimed ·{" "}
                        <span className="font-medium text-foreground">
                          {session.submitted} reviewed
                        </span>{" "}
                        · needs {session.quorum} · {session.videoCount} ad
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

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <Input
                      readOnly
                      value={session.agentUrl}
                      aria-label="Agent link"
                      className="max-w-md font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        void navigator.clipboard.writeText(session.agentUrl);
                        toast.success("Agent link copied.");
                      }}
                    >
                      Copy agent link
                    </Button>
                  </div>

                  <div className="mt-2">
                    <SendInviteRow sessionId={session.id} />
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
                          {judge.status === "submitted" ? "reviewed" : "in progress"}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      No agent has claimed this session yet.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4">
        {companies.isLoading ? (
          <Skeleton className="mt-12 h-40 w-full" />
        ) : !companies.data?.length ? (
          <Card className="mt-12">
            <CardContent className="flex flex-col items-start gap-3 p-6">
              <p className="text-sm text-muted-foreground">
                List a company first — Terac reviews are always tied to a brand.
              </p>
              <Button asChild size="sm">
                <Link to="/studio/new">List a company</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {companies.data.length > 1 ? (
              <div className="mt-12 max-w-xs">
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Brand
                </p>
                <Select value={companyId} onValueChange={setCompanyId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Pick a brand" />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.data.map((company) => (
                      <SelectItem key={company.id} value={company.id}>
                        {company.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {companyId ? <CreateReviewPanel companyId={companyId} /> : null}
          </>
        )}
      </section>
    </div>
  );
}

