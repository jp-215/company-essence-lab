import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { listCompanyTrends } from "@/lib/remix.functions";
import { createAds, listJudges } from "@/lib/terac/terac.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

const MAX_CONCEPTS = 6;

/**
 * Terac Flow A, mounted on the Create ads screen.
 *
 * One press produces ONE review session holding every concept from that press —
 * judges then vote comparatively, which is where their expertise actually
 * lives. Sending a link per video would throw that away.
 */
export function CreateReviewPanel({ companyId }: { companyId: string }) {
  const queryClient = useQueryClient();
  const fetchTrends = useServerFn(listCompanyTrends);
  const fetchJudges = useServerFn(listJudges);
  const runCreateAds = useServerFn(createAds);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [judgeIds, setJudgeIds] = useState<Set<string>>(new Set());
  const [quorum, setQuorum] = useState(3);
  const [deadlineHours, setDeadlineHours] = useState(48);

  const trends = useQuery({
    queryKey: ["trends", companyId],
    queryFn: () => fetchTrends({ data: { companyId, limit: 12 } }),
    enabled: Boolean(companyId),
  });
  const judges = useQuery({ queryKey: ["terac-judges"], queryFn: () => fetchJudges() });

  const mutation = useMutation({
    mutationFn: () =>
      runCreateAds({
        data: {
          companyId,
          trendKeys: Array.from(selected),
          judgeIds: Array.from(judgeIds),
          quorum,
          deadlineHours,
        },
      }),
    onSuccess: (result) => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["terac-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["remixes", companyId] });
      toast.success(
        `Sent ${result.videoCount} ad${result.videoCount === 1 ? "" : "s"} to ${result.invited} judge${result.invited === 1 ? "" : "s"}.`,
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

  const activeJudges = (judges.data ?? []).filter((judge) => judge.active);
  const quorumTooHigh = judgeIds.size > 0 && quorum > judgeIds.size;

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
        Pick the trends worth testing. Vira writes your version of each, then one link goes to every
        judge so they rank them side by side. Closes on quorum or deadline, whichever lands first.
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

      {selected.size > 0 ? (
        <Card className="sticky bottom-4 z-20 mt-8 border-foreground/20 shadow-lg">
          <CardContent className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                {selected.size} concept{selected.size === 1 ? "" : "s"} · one session, one link per
                judge
              </p>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                Clear
              </Button>
            </div>

            <div className="mt-5 border-t border-border pt-5">
              {judges.isLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : activeJudges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No active judges yet.{" "}
                  <Link to="/reviews" className="underline underline-offset-4">
                    Add judges to your roster
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Send to
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeJudges.map((judge) => (
                      <Button
                        key={judge.id}
                        size="sm"
                        variant={judgeIds.has(judge.id) ? "default" : "outline"}
                        aria-pressed={judgeIds.has(judge.id)}
                        onClick={() =>
                          setJudgeIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(judge.id)) next.delete(judge.id);
                            else next.add(judge.id);
                            return next;
                          })
                        }
                      >
                        {judge.name}
                      </Button>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-4">
                    <label className="text-sm">
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Quorum
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
                    Closes on {quorum} submission{quorum === 1 ? "" : "s"} or after {deadlineHours}
                    h, whichever comes first.
                  </p>

                  <Button
                    className="mt-4"
                    disabled={mutation.isPending || judgeIds.size === 0 || quorumTooHigh}
                    onClick={() => mutation.mutate()}
                  >
                    {mutation.isPending
                      ? "Generating and sending…"
                      : `Create ads and send to ${judgeIds.size} judge${judgeIds.size === 1 ? "" : "s"}`}
                  </Button>
                  {quorumTooHigh ? (
                    <p className="mt-2 text-xs text-destructive">
                      Quorum can't exceed the number of judges assigned.
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
