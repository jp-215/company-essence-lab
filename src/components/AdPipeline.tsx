import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getVideoJob, listVideoLanes, startVideoRender } from "@/lib/engine.functions";
import { openReviewForRenders } from "@/lib/terac/terac.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = { companyId: string; companyName: string };

type JobState = {
  jobId: string;
  lane: string;
  status: "queued" | "running" | "done" | "failed" | string;
  videoId: string | null;
  error: string | null;
};

type Stage = "idle" | "generating" | "opening" | "shared";

const MAX_LANES = 3;

/**
 * Create ads is one pipeline, not three screens:
 *
 *   1. Generate — one render per selected creative lane, in parallel.
 *   2. Send to Terac — the finished batch opens as ONE review task, so agents
 *      compare the ads against each other instead of scoring them in isolation.
 *   3. Share — a single token link any agent can open, watch every ad and vote
 *      a favourite. Results stream back into the session leaderboard.
 */
export function AdPipeline({ companyId, companyName }: Props) {
  const fetchLanes = useServerFn(listVideoLanes);
  const fetchJob = useServerFn(getVideoJob);
  const startRender = useServerFn(startVideoRender);
  const openReview = useServerFn(openReviewForRenders);
  const queryClient = useQueryClient();

  const [lanes, setLanes] = useState<string[]>([]);
  const [mode, setMode] = useState<"fast" | "agentic">("fast");
  const [product, setProduct] = useState("");
  const [jobs, setJobs] = useState<JobState[]>([]);
  const [stage, setStage] = useState<Stage>("idle");
  const [session, setSession] = useState<{ id: string; agentUrl: string; videoCount: number } | null>(
    null,
  );
  const openedFor = useRef<string | null>(null);

  const laneOptions = useQuery({ queryKey: ["engine-lanes"], queryFn: () => fetchLanes() });

  useEffect(() => {
    if (!lanes.length && laneOptions.data?.length) {
      setLanes(laneOptions.data.slice(0, MAX_LANES).map((item) => item.name));
    }
  }, [laneOptions.data, lanes.length]);

  useEffect(() => {
    setJobs([]);
    setSession(null);
    setStage("idle");
    openedFor.current = null;
  }, [companyId]);

  // Poll every in-flight job until the whole batch settles.
  const pending = jobs.filter((job) => job.status !== "done" && job.status !== "failed");

  useQuery({
    queryKey: ["ad-pipeline-jobs", pending.map((job) => job.jobId).join(",")],
    enabled: pending.length > 0,
    refetchInterval: 3000,
    queryFn: async () => {
      const results = await Promise.all(
        pending.map(async (job) => {
          try {
            const data = await fetchJob({ data: { jobId: job.jobId } });
            return {
              jobId: job.jobId,
              status: data.job.status,
              videoId: data.job.video_id ?? null,
              error: data.job.error ?? null,
            };
          } catch (cause) {
            return {
              jobId: job.jobId,
              status: "failed",
              videoId: null,
              error: cause instanceof Error ? cause.message : "Render lookup failed",
            };
          }
        }),
      );

      setJobs((current) =>
        current.map((job) => {
          const update = results.find((item) => item.jobId === job.jobId);
          return update ? { ...job, ...update } : job;
        }),
      );
      return results.length;
    },
  });

  // Stage 2 fires itself: the batch is finished, so the review task opens without
  // the founder pressing anything else.
  useEffect(() => {
    if (stage !== "generating" || jobs.length === 0) return;
    const settled = jobs.every((job) => job.status === "done" || job.status === "failed");
    if (!settled) return;

    const done = jobs.filter((job) => job.status === "done");
    if (!done.length) {
      setStage("idle");
      toast.error("Every render failed — nothing to review yet.");
      return;
    }

    const key = jobs.map((job) => job.jobId).join(",");
    if (openedFor.current === key) return;
    openedFor.current = key;
    setStage("opening");

    const videoIds = done.map((job) => job.videoId).filter((id): id is string => Boolean(id));

    void openReview({ data: { companyId, videoIds } })
      .then((result) => {
        setSession({ id: result.sessionId, agentUrl: result.agentUrl, videoCount: result.videoCount });
        setStage("shared");
        void queryClient.invalidateQueries({ queryKey: ["terac-sessions"] });
        void queryClient.invalidateQueries({ queryKey: ["engine-videos", companyId] });
        toast.success("Sent to Terac — the agent link is ready.");
      })
      .catch((error: unknown) => {
        setStage("generating");
        toast.error(
          error instanceof Error
            ? `Videos rendered, but the Terac request failed: ${error.message}`
            : "Videos rendered, but the Terac request failed.",
        );
      });
  }, [jobs, stage, companyId, openReview, queryClient]);

  const create = useMutation({
    mutationFn: async () => {
      const accepted = await Promise.all(
        lanes.map(async (lane) => {
          const job = await startRender({
            data: { companyId, lane, mode, product: product.trim() || undefined },
          });
          return { jobId: job.job_id, lane, status: "queued", videoId: null, error: null } as JobState;
        }),
      );
      return accepted;
    },
    onSuccess: (accepted) => {
      openedFor.current = null;
      setSession(null);
      setJobs(accepted);
      setStage("generating");
      toast.success(`Generating ${accepted.length} ad${accepted.length === 1 ? "" : "s"}…`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = create.isPending || stage === "generating" || stage === "opening";
  const doneCount = jobs.filter((job) => job.status === "done").length;

  function toggleLane(name: string) {
    setLanes((current) => {
      if (current.includes(name)) {
        return current.length === 1 ? current : current.filter((item) => item !== name);
      }
      if (current.length >= MAX_LANES) {
        toast.info(`Up to ${MAX_LANES} ads per review — agents compare, they don't grade a reel.`);
        return current;
      }
      return [...current, name];
    });
  }

  return (
    <section className="mt-12 rounded-3xl border border-border bg-card p-6 sm:p-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        Pipeline · generate → Terac review → vote
      </p>
      <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground">
        Create ads for {companyName}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
        One press renders an ad per lane, then sends the whole batch to the Terac agent pool as a
        single task. Agents open one link, watch every ad and vote their favourite.
      </p>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        <PipelineStep
          index={1}
          label="Generate videos"
          state={stage === "idle" ? "todo" : stage === "generating" ? "active" : "done"}
          detail={
            stage === "generating"
              ? `${doneCount}/${jobs.length} rendered`
              : jobs.length
                ? `${doneCount} ready`
                : `${lanes.length} lane${lanes.length === 1 ? "" : "s"} selected`
          }
        />
        <PipelineStep
          index={2}
          label="Send Terac request"
          state={stage === "shared" ? "done" : stage === "opening" ? "active" : "todo"}
          detail={stage === "opening" ? "Opening review task…" : "Auto-runs when renders finish"}
        />
        <PipelineStep
          index={3}
          label="Agents vote"
          state={stage === "shared" ? "active" : "todo"}
          detail={session ? `${session.videoCount} ads in the pool` : "Token link, no login"}
        />
      </ol>

      <div className="mt-8 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Creative lanes (up to {MAX_LANES})
        </p>
        {laneOptions.isLoading ? (
          <Skeleton className="h-12 w-full max-w-2xl rounded-full" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(laneOptions.data ?? []).map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => toggleLane(item.name)}
                disabled={busy}
                className={cn(
                  "rounded-full border border-border px-5 py-2.5 text-sm transition-colors disabled:opacity-60",
                  lanes.includes(item.name)
                    ? "bg-foreground text-background"
                    : "bg-background text-foreground hover:border-ring",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="w-full max-w-sm space-y-2">
          <label
            htmlFor="pipeline-product"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Product to feature
          </label>
          <Input
            id="pipeline-product"
            value={product}
            onChange={(event) => setProduct(event.target.value)}
            placeholder={companyName}
            className="h-12 rounded-xl bg-background"
          />
        </div>
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Mode
          </p>
          <div className="flex gap-2">
            {(["fast", "agentic"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                disabled={busy}
                className={cn(
                  "rounded-full border border-border px-5 py-2.5 text-sm transition-colors disabled:opacity-60",
                  value === mode
                    ? "bg-foreground text-background"
                    : "bg-background text-foreground hover:border-ring",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <Button
          onClick={() => create.mutate()}
          disabled={busy || !lanes.length}
          className="h-12 rounded-xl bg-foreground px-8 text-base font-semibold text-background hover:bg-foreground/90"
        >
          {stage === "generating"
            ? "Generating videos…"
            : stage === "opening"
              ? "Sending to Terac…"
              : "Create ads"}
        </Button>
      </div>

      {jobs.length ? (
        <div className="mt-8 space-y-2">
          {jobs.map((job) => (
            <div
              key={job.jobId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Badge variant="outline">{job.lane}</Badge>
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  {job.status}
                </span>
              </div>
              {job.error ? (
                <p className="max-w-lg text-xs text-destructive">{describeEngineError(job.error)}</p>
              ) : job.status === "done" ? (
                <p className="text-xs text-muted-foreground">Ready for review</p>
              ) : (
                <p className="text-xs text-muted-foreground">Rendering on the engine…</p>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {session ? (
        <div className="mt-8 rounded-2xl border border-foreground/20 bg-background p-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Terac agent link · step 3
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Send this to your agents. They claim the task with a name and email, watch all
            {` ${session.videoCount} `}
            ads and vote their favourite — no account needed.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input
              readOnly
              value={session.agentUrl}
              aria-label="Terac agent review link"
              className="min-w-[16rem] flex-1 font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={() => {
                void navigator.clipboard.writeText(session.agentUrl);
                toast.success("Link copied.");
              }}
            >
              Copy link
            </Button>
            <Button size="sm" variant="outline" asChild>
              <a href={session.agentUrl} target="_blank" rel="noopener noreferrer">
                Preview as agent
              </a>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/reviews/$id" params={{ id: session.id }}>
                Watch the votes
              </Link>
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The render engine runs outside Vira, so its crashes arrive as raw output.
 * Translate those into something a founder can act on.
 */
function describeEngineError(raw?: string | null): string {
  if (!raw) return "The render failed. Try again in a moment.";
  if (/ModuleNotFoundError|ImportError|No module named|Traceback/i.test(raw)) {
    return "The video engine crashed on its own host (missing dependency). Retry — nothing is wrong with your brand or lane.";
  }
  return raw;
}

function PipelineStep({
  index,
  label,
  detail,
  state,
}: {
  index: number;
  label: string;
  detail: string;
  state: "todo" | "active" | "done";
}) {
  return (
    <li
      className={cn(
        "rounded-2xl border p-4",
        state === "active"
          ? "border-foreground/40 bg-secondary"
          : state === "done"
            ? "border-border bg-background"
            : "border-dashed border-border bg-background",
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        Step {index}
        {state === "done" ? " · done" : state === "active" ? " · running" : ""}
      </p>
      <p className="mt-1 font-serif text-lg font-semibold text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </li>
  );
}
