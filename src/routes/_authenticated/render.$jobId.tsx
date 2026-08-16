import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { getVideoJob } from "@/lib/engine.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/render/$jobId")({
  validateSearch: (search: Record<string, unknown>) => ({
    quality: typeof search["quality"] === "string" ? (search["quality"] as string) : undefined,
    brief: typeof search["brief"] === "string" ? (search["brief"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Rendering your video — Vira" },
      {
        name: "description",
        content:
          "Watch your Creative Brief become a finished vertical video ad, with live engine progress and the final MP4.",
      },
      { property: "og:title", content: "Rendering your video — Vira" },
      {
        property: "og:description",
        content: "Live render progress from brief to finished ad.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RenderTracker,
});

/** The engine runs outside Vira, so its crashes arrive as raw server output. */
function describeEngineError(raw?: string | null): string {
  if (!raw) return "The render failed. Try again in a moment.";
  if (/ModuleNotFoundError|ImportError|No module named|Traceback/i.test(raw)) {
    return "The video engine crashed on its own host (a missing dependency there). Nothing is wrong with your brief — retry, and if it keeps failing the engine needs a fix on its side.";
  }
  return raw;
}

function RenderTracker() {
  const { jobId } = Route.useParams();
  const { quality, brief } = Route.useSearch();
  const fetchJob = useServerFn(getVideoJob);
  const queryClient = useQueryClient();
  const [startedAt] = useState(() => Date.now());
  const notified = useRef<string | null>(null);

  const job = useQuery({
    queryKey: ["engine-job", jobId],
    queryFn: () => fetchJob({ data: { jobId } }),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === "done" || status === "failed" ? false : 3000;
    },
  });

  const status = job.data?.job.status ?? null;
  const video = job.data?.video ?? null;

  useEffect(() => {
    if (!status || notified.current === status) return;
    if (status === "done") {
      notified.current = status;
      toast.success("Your video is ready.");
      void queryClient.invalidateQueries({ queryKey: ["engine-videos"] });
    }
    if (status === "failed") {
      notified.current = status;
      toast.error(describeEngineError(job.data?.job.error));
    }
  }, [status, job.data?.job.error, queryClient]);

  const elapsed = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  const stalled = (status === "queued" || status === "running") && elapsed > 360;

  return (
    <div className="bg-background">
      <div className="mx-auto w-full max-w-4xl px-6 py-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
            Brief → video
          </p>
          <Button asChild variant="ghost" className="rounded-xl">
            <Link to="/remix">← Back to remix studio</Link>
          </Button>
        </div>

        <h1 className="mt-6 font-serif text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl">
          {status === "done"
            ? "Your video is ready"
            : status === "failed"
              ? "That render did not finish"
              : "Rendering from your Creative Brief"}
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Vira sent the OCR copy, sentiment, texture, composition and motion beats from your picked
          references straight to the video engine. This page stays live until the final cut lands.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Badge variant="outline">{status ?? "starting"}</Badge>
          {quality ? <Badge variant="secondary">brief signal · {quality}</Badge> : null}
          {brief ? (
            <span className="font-mono text-[11px] text-muted-foreground">brief {brief.slice(0, 8)}</span>
          ) : null}
          <span className="font-mono text-[11px] text-muted-foreground">{elapsed}s elapsed</span>
        </div>

        <div className="mt-8 rounded-2xl border border-border bg-secondary p-6">
          <p className="text-sm text-foreground">
            {job.data?.job.progress_note ||
              (status === "done" ? "Finished." : "Working on your render…")}
          </p>
          {job.data?.events.length ? (
            <ul className="mt-4 space-y-1">
              {job.data.events.map((event) => (
                <li key={event.seq} className="font-mono text-[11px] text-muted-foreground">
                  {event.stage} · {event.message}
                </li>
              ))}
            </ul>
          ) : null}
          {stalled ? (
            <p className="mt-4 text-sm text-muted-foreground">
              This is taking longer than a normal render (over six minutes). The engine is still
              holding the job — you can keep waiting or start a fresh remix.
            </p>
          ) : null}
          {job.data?.job.error ? (
            <div className="mt-4">
              <p className="text-sm text-destructive">
                {describeEngineError(job.data.job.error)}
              </p>
              <details className="mt-2">
                <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                  Engine detail
                </summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-muted-foreground">
                  {job.data.job.error}
                </pre>
              </details>
            </div>
          ) : null}
        </div>

        <div className="mt-10">
          {status === "done" && video?.mp4_url ? (
            <article className="overflow-hidden rounded-2xl border border-border bg-card sm:flex">
              <video
                src={video.mp4_url}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="aspect-[9/16] w-full bg-secondary object-cover sm:max-w-xs"
              />
              <div className="flex flex-1 flex-col gap-3 p-6">
                <Badge variant="outline" className="w-fit">
                  {video.lane}
                </Badge>
                <p className="font-serif text-2xl font-semibold leading-snug">{video.hook}</p>
                {video.caption ? (
                  <p className="text-sm text-muted-foreground">{video.caption}</p>
                ) : null}
                {video.cta ? (
                  <p className="text-sm text-foreground">
                    <span className="font-medium">CTA: </span>
                    {video.cta}
                  </p>
                ) : null}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Button asChild size="sm" className="rounded-xl">
                    <a href={video.mp4_url} target="_blank" rel="noopener noreferrer">
                      Open MP4
                    </a>
                  </Button>
                  <Button asChild size="sm" variant="outline" className="rounded-xl">
                    <Link to="/reviews">Send to Terac review</Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost" className="rounded-xl">
                    <Link to="/ads">Create more ads</Link>
                  </Button>
                </div>
              </div>
            </article>
          ) : status === "failed" ? (
            <Button asChild className="rounded-xl">
              <Link to="/remix">Pick new references</Link>
            </Button>
          ) : (
            <div className="grid gap-4 sm:grid-cols-[16rem_1fr]">
              <Skeleton className="aspect-[9/16] w-full rounded-2xl" />
              <div className="space-y-3">
                <Skeleton className="h-6 w-2/3 rounded-full" />
                <Skeleton className="h-4 w-full rounded-full" />
                <Skeleton className="h-4 w-5/6 rounded-full" />
              </div>
            </div>
          )}
        </div>

        {status === "done" && !video?.mp4_url ? (
          <div className="mt-6 max-w-2xl rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">
              The engine finished but did not attach a playable file. Check your rendered videos on
              the dashboard, or run the remix again.
            </p>
            <Input
              readOnly
              value={jobId}
              aria-label="Engine job id"
              className="mt-3 font-mono text-xs"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
