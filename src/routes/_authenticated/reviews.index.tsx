import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { listSessions } from "@/lib/terac.functions";
import { Eyebrow, Lead, MetaLabel, PageShell, PageTitle, Panel } from "@/components/Page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/reviews/")({
  head: () => ({
    meta: [
      { title: "Expert reviews — Vira" },
      {
        name: "description",
        content: "Every Terac review round: who has reviewed, what won, and what to fix next.",
      },
      { property: "og:title", content: "Expert reviews — Vira" },
      {
        property: "og:description",
        content: "Human expert review rounds validating your ad concepts before they ship.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ReviewsPage,
});

function ReviewsPage() {
  const fetchSessions = useServerFn(listSessions);
  const sessions = useQuery({ queryKey: ["terac-sessions"], queryFn: () => fetchSessions() });

  return (
    <PageShell width="narrow">
      <Eyebrow live>Terac · expert review rounds</Eyebrow>
      <PageTitle className="mt-6">Every round, and where it stands.</PageTitle>
      <Lead className="mt-4">
        A round closes on quorum or deadline, whichever comes first. Then Vira synthesizes the
        judges' signal into revisions you approve.
      </Lead>

      {sessions.isLoading ? (
        <div className="mt-10 space-y-4">
          {[0, 1].map((key) => (
            <Skeleton key={key} className="h-28 w-full rounded-2xl" />
          ))}
        </div>
      ) : !sessions.data?.length ? (
        <Panel className="mt-10 p-6">
          <p className="text-sm text-muted-foreground">
            No rounds yet. Generate concepts, then send them to your judges.
          </p>
          <Button asChild size="sm" className="mt-4">
            <Link to="/ads">Go to Create ads</Link>
          </Button>
        </Panel>
      ) : (
        <div className="mt-10 space-y-4">
          {sessions.data.map((session) => (
            <Panel key={session.id} className="p-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-serif text-xl font-bold">{session.companyName}</span>
                <Badge variant={session.status === "complete" ? "default" : "outline"}>
                  {session.status === "complete"
                    ? "Complete"
                    : session.status === "expired"
                      ? "Expired"
                      : "Open"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(session.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {session.videoCount} concept{session.videoCount === 1 ? "" : "s"} ·{" "}
                {session.submittedCount} reviewed · quorum {session.quorum} · deadline{" "}
                {new Date(session.deadlineAt).toLocaleDateString()}
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Button asChild size="sm">
                  <Link to="/reviews/$sessionId" params={{ sessionId: session.id }}>
                    Open round
                  </Link>
                </Button>
                <MetaLabel>{session.publicToken}</MetaLabel>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </PageShell>
  );
}
