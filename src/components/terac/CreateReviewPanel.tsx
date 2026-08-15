import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { listCompanyTrends } from "@/lib/remix.functions";
import { createAds } from "@/lib/terac/terac.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_CONCEPTS = 6;

/**
 * Terac Flow A, mounted on the Create ads screen.
 *
 * One press produces ONE review session holding every concept from that press,
 * opened as a task in the Terac agent pool. There is no roster: any agent with
 * the session link claims the task, watches all the ads, ranks them and leaves
 * feedback. Judges vote comparatively, which is where their expertise lives.
 */
export function CreateReviewPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const fetchTrends = useServerFn(listCompanyTrends);
  const runCreateAds = useServerFn(createAds);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [quorum, setQuorum] = useState(3);
  const [deadlineHours, setDeadlineHours] = useState(48);
  const [agentUrl, setAgentUrl] = useState<string | null>(null);

  const trends = useQuery({
    queryKey: ["trends", companyId],
    queryFn: () => fetchTrends({ data: { companyId, limit: 12 } }),
    enabled: Boolean(companyId),
  });

  const mutation = useMutation({
    mutationFn: () =>
      runCreateAds({
        data: {
          companyId,
          trendKeys: Array.from(selected),
          quorum,
          deadlineHours,
        },
      }),
    onSuccess: (result) => {
      setSelected(new Set());
      setAgentUrl(result.agentUrl);
      void queryClient.invalidateQueries({ queryKey: ["terac-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["remixes", companyId] });
      toast.success(
        `${result.videoCount} ad${result.videoCount === 1 ? "" : "s"} are open for review — share the agent link.`,
      );
      if (result.aiUnavailable) {
        toast.warning(
          "AI personalisation was unavailable — concepts were scaffolded from the trend.",
        );
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not open the review session."),
  });

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < MAX_CONCEPTS) next.add(key);
      else toast.info(`${MAX_CONCEPTS} is the most a panel reviews well in one sitting.`);
      return next;
    });
  }

  return (
    <section className="mt-16 border-t border-border pt-12">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
        Terac · expert review
      </p>
      <h2 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-foreground">
        Get a panel on it before you ship
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Pick the trends worth testing. Vira writes your version of each, then the session opens as a
        task in the Terac agent pool — any agent who takes it sees every ad, votes for a favourite
        and writes feedback. Closes on quorum or deadline, whichever lands first.
      </p>

      {trends.isLoading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((k) => (
            <Skeleton key={k} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : !trends.data?.length ? (
        <p className="mt-6 text-sm text-muted-foreground">No trends mapped to this category yet.</p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trends.data.map((trend) => {
            const isOn = selected.has(trend.trendKey);
            return (
              <button
                key={trend.trendKey}
                type="button"
                aria-pressed={isOn}
                onClick={() => toggle(trend.trendKey)}
                className={[
                  "rounded-xl border p-4 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isOn
                    ? "border-foreground bg-secondary"
                    : "border-border hover:border-foreground/40",
                ].join(" ")}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {trend.trendKey}
                  </span>
                  <Badge variant="outline">{trend.platform}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                  {trend.title || trend.caption.slice(0, 90)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {trend.views.toLocaleString()} views · {isOn ? "selected" : "tap to select"}
                </p>
              </button>
            );
          })}
        </div>
      )}

      {agentUrl ? (
        <Card className="mt-8 border-foreground/20">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-foreground">Agent link for this session</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Anyone who opens it can claim the task — no account, no password.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Input readOnly value={agentUrl} className="max-w-md font-mono text-xs" />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void navigator.clipboard.writeText(agentUrl);
                  toast.success("Agent link copied.");
                }}
              >
                Copy link
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link to="/reviews">See sessions</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {selected.size > 0 ? (
        <Card className="sticky bottom-4 z-20 mt-8 border-foreground/20 shadow-lg">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                {selected.size} concept{selected.size === 1 ? "" : "s"} · one session, one link for
                the agent pool
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>

            <div className="mt-5 border-t border-border pt-5">
              <div className="flex flex-wrap gap-4">
                <label className="text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Reviews needed
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={20}
                    value={quorum}
                    onChange={(e) => setQuorum(Number(e.target.value))}
                    className="mt-1 w-24"
                  />
                </label>
                <label className="text-sm">
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Deadline (hours)
                  </span>
                  <Input
                    type="number"
                    min={1}
                    max={336}
                    value={deadlineHours}
                    onChange={(e) => setDeadlineHours(Number(e.target.value))}
                    className="mt-1 w-28"
                  />
                </label>
              </div>

              <p className="mt-3 text-xs text-muted-foreground">
                Closes on {quorum} submission{quorum === 1 ? "" : "s"} or after {deadlineHours}h,
                whichever comes first.
              </p>

              <Button
                className="mt-4"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                {mutation.isPending ? "Generating…" : "Create ads and open for review"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
