import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  getVideoJob,
  listVideoLanes,
  listVideosForCompany,
  regenerateVideo,
  startVideoRender,
} from "@/lib/engine.functions";
import { engineScoreTotal } from "@/lib/engine-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Props = { companyId: string; companyName: string };

export function VideoStudio({ companyId, companyName }: Props) {
  const fetchLanes = useServerFn(listVideoLanes);
  const fetchVideos = useServerFn(listVideosForCompany);
  const fetchJob = useServerFn(getVideoJob);
  const startRender = useServerFn(startVideoRender);
  const regenerate = useServerFn(regenerateVideo);
  const queryClient = useQueryClient();

  const [lane, setLane] = useState<string | null>(null);
  const [mode, setMode] = useState<"fast" | "agentic">("fast");
  const [product, setProduct] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);

  const lanes = useQuery({ queryKey: ["engine-lanes"], queryFn: () => fetchLanes() });
  const videos = useQuery({
    queryKey: ["engine-videos", companyId],
    queryFn: () => fetchVideos({ data: { companyId } }),
  });

  useEffect(() => {
    if (!lane && lanes.data?.length) setLane(lanes.data[0]!.name);
  }, [lanes.data, lane]);

  useEffect(() => {
    setJobId(null);
    setProduct("");
  }, [companyId]);

  const job = useQuery({
    queryKey: ["engine-job", jobId],
    queryFn: () => fetchJob({ data: { jobId: jobId! } }),
    enabled: Boolean(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.job.status;
      return status === "done" || status === "failed" ? false : 3000;
    },
  });

  useEffect(() => {
    const status = job.data?.job.status;
    if (status === "done") {
      toast.success("Your video is ready.");
      void queryClient.invalidateQueries({ queryKey: ["engine-videos", companyId] });
    }
    if (status === "failed") {
      toast.error(describeEngineError(job.data?.job.error));
    }
  }, [job.data?.job.status, job.data?.job.error, companyId, queryClient]);


  const render = useMutation({
    mutationFn: () =>
      startRender({
        data: { companyId, lane: lane ?? "founder-story", mode, product: product.trim() || undefined },
      }),
    onSuccess: (accepted) => {
      setJobId(accepted.job_id);
      toast.success(`Rendering — about ${accepted.estimated_seconds}s.`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const retry = useMutation({
    mutationFn: (videoId: string) => regenerate({ data: { videoId, notes: [], lane } }),
    onSuccess: (accepted) => {
      setJobId(accepted.job_id);
      toast.success("Regenerating with the selected lane.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const activeLane = lanes.data?.find((item) => item.name === lane) ?? null;
  const status = job.data?.job.status;
  const busy = render.isPending || retry.isPending || status === "queued" || status === "running";

  return (
    <section className="mt-16 border-t border-border pt-12">
      <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
        Video engine · grounded renders for {companyName}
      </p>
      <h2 className="mt-3 font-serif text-3xl font-bold tracking-tight text-foreground">
        Turn a lane into a finished video ad
      </h2>

      <div className="mt-6 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Creative lane
        </p>
        {lanes.isLoading ? (
          <Skeleton className="h-12 w-full max-w-2xl rounded-full" />
        ) : (
          <div className="flex flex-wrap gap-2">
            {(lanes.data ?? []).map((item) => (
              <button
                key={item.name}
                type="button"
                onClick={() => setLane(item.name)}
                className={cn(
                  "rounded-full border border-border px-5 py-2.5 text-sm transition-colors",
                  item.name === lane
                    ? "bg-foreground text-background"
                    : "bg-card text-foreground hover:border-ring",
                )}
              >
                {item.name}
              </button>
            ))}
          </div>
        )}
        {activeLane ? (
          <div className="max-w-2xl rounded-2xl border border-border bg-card p-5">
            <p className="text-sm leading-relaxed text-foreground">{activeLane.brief}</p>
            <p className="mt-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Voice: </span>
              {activeLane.voice_note}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Look: </span>
              {activeLane.look}
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div className="w-full max-w-sm space-y-2">
          <label
            htmlFor="engine-product"
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            Product to feature
          </label>
          <Input
            id="engine-product"
            value={product}
            onChange={(event) => setProduct(event.target.value)}
            placeholder={companyName}
            className="h-12 rounded-xl bg-card"
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
                className={cn(
                  "rounded-full border border-border px-5 py-2.5 text-sm transition-colors",
                  value === mode
                    ? "bg-foreground text-background"
                    : "bg-card text-foreground hover:border-ring",
                )}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <Button
          onClick={() => render.mutate()}
          disabled={busy || !lane}
          className="h-12 rounded-xl bg-foreground px-8 text-base font-semibold text-background hover:bg-foreground/90"
        >
          {busy ? "Rendering…" : "Generate video"}
        </Button>
      </div>

      {job.data ? (
        <div className="mt-8 max-w-2xl rounded-2xl border border-border bg-secondary p-5">
          <div className="flex items-center gap-3">
            <Badge variant="outline">{job.data.job.status}</Badge>
            <p className="text-sm text-foreground">
              {job.data.job.progress_note || "Working on your render…"}
            </p>
          </div>
          {job.data.events.length ? (
            <ul className="mt-4 space-y-1">
              {job.data.events.map((event) => (
                <li key={event.seq} className="font-mono text-[11px] text-muted-foreground">
                  {event.stage} · {event.message}
                </li>
              ))}
            </ul>
          ) : null}
          {job.data.job.error ? (
            <p className="mt-3 text-sm text-destructive">{job.data.job.error}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-10">
        <p className="font-mono text-xs uppercase tracking-[0.24em] text-muted-foreground">
          Rendered videos
        </p>
        {videos.isLoading ? (
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {[0, 1, 2].map((key) => (
              <Skeleton key={key} className="aspect-[9/16] w-full rounded-2xl" />
            ))}
          </div>
        ) : !videos.data?.length ? (
          <p className="mt-3 max-w-xl text-sm text-muted-foreground">
            No renders yet — pick a lane above and the engine will script, voice and cut a vertical
            ad grounded in your brand and the trends in your category.
          </p>
        ) : (
          <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {videos.data.map((video) => {
              const total = engineScoreTotal(video.score);
              return (
                <article
                  key={video.id}
                  className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
                >
                  <video
                    src={video.mp4_url}
                    controls
                    playsInline
                    preload="metadata"
                    className="aspect-[9/16] w-full bg-secondary object-cover"
                  />
                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{video.lane}</Badge>
                      {video.disposition ? (
                        <Badge variant="secondary">{video.disposition}</Badge>
                      ) : null}
                      {total !== null ? (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          score {total.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    <p className="font-serif text-lg font-semibold leading-snug">{video.hook}</p>
                    {video.caption ? (
                      <p className="text-sm text-muted-foreground">{video.caption}</p>
                    ) : null}
                    {video.cta ? (
                      <p className="text-sm text-foreground">
                        <span className="font-medium">CTA: </span>
                        {video.cta}
                      </p>
                    ) : null}
                    {video.hashtags.length ? (
                      <div className="flex flex-wrap gap-2">
                        {video.hashtags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            #{tag}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {video.drop_reason ? (
                      <p className="text-xs text-muted-foreground">Note: {video.drop_reason}</p>
                    ) : null}
                    <div className="mt-auto flex flex-wrap gap-2 pt-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl"
                        disabled={busy}
                        onClick={() => retry.mutate(video.id)}
                      >
                        Regenerate
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="rounded-xl">
                        <a href={video.mp4_url} target="_blank" rel="noopener noreferrer">
                          Open MP4
                        </a>
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
