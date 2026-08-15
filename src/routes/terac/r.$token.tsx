import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  openJudgeReview,
  saveJudgeVideoFeedback,
  submitJudgeReview,
} from "@/lib/terac-portal.functions";
import {
  DIMENSION_SCORES,
  REVIEW_DIMENSIONS,
  type DimensionKey,
  type DimensionScore,
  type PortalDraftDTO,
  type PortalSessionDTO,
} from "@/lib/terac-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/terac/r/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Review these ads — Terac" },
      { name: "description", content: "A short expert review of new ad concepts. No login needed." },
      { name: "robots", content: "noindex" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: JudgePortal,
});

type LocalDraft = Record<string, PortalDraftDTO>;

function storageKey(token: string) {
  return `terac-draft-${token}`;
}

function readLocal(token: string): { drafts: LocalDraft; note: string; ranked: string[] } | null {
  try {
    const raw = localStorage.getItem(storageKey(token));
    return raw ? (JSON.parse(raw) as { drafts: LocalDraft; note: string; ranked: string[] }) : null;
  } catch {
    return null;
  }
}

function JudgePortal() {
  const { token } = Route.useParams();
  const load = useServerFn(openJudgeReview);
  const saveFeedback = useServerFn(saveJudgeVideoFeedback);
  const submit = useServerFn(submitJudgeReview);

  const session = useQuery({
    queryKey: ["terac-portal", token],
    queryFn: () => load({ data: { token } }),
    retry: false,
  });

  const [stage, setStage] = useState<"landing" | "review" | "rank" | "done">("landing");
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<LocalDraft>({});
  const [note, setNote] = useState("");
  const [ranked, setRanked] = useState<string[]>([]);
  const hydrated = useRef(false);

  // Server drafts first, then anything newer the judge left in this browser.
  useEffect(() => {
    if (!session.data || hydrated.current) return;
    hydrated.current = true;
    const base: LocalDraft = {};
    for (const draft of session.data.drafts) base[draft.videoId] = draft;
    const local = readLocal(token);
    setDrafts(local?.drafts ? { ...base, ...local.drafts } : base);
    setNote(local?.note ?? session.data.overallNote);
    setRanked(local?.ranked ?? []);
    if (session.data.status === "submitted") setStage("done");
  }, [session.data, token]);

  // Persist on every change so closing the tab loses nothing.
  useEffect(() => {
    if (!hydrated.current) return;
    try {
      localStorage.setItem(storageKey(token), JSON.stringify({ drafts, note, ranked }));
    } catch {
      /* private mode — the server copy still holds. */
    }
  }, [drafts, note, ranked, token]);

  const videos = session.data?.videos ?? [];
  const current = videos[index];

  const pushDraft = useCallback(
    (videoId: string, patch: Partial<PortalDraftDTO>) => {
      setDrafts((previous) => {
        const existing =
          previous[videoId] ?? { videoId, isPick: false, body: "", scores: {} };
        const next = { ...existing, ...patch };
        void saveFeedback({
          data: {
            token,
            videoId,
            isPick: next.isPick,
            body: next.body,
            scores: next.scores,
          },
        }).catch(() => undefined);
        return { ...previous, [videoId]: next };
      });
    },
    [saveFeedback, token],
  );

  const picks = useMemo(
    () => videos.filter((video) => drafts[video.id]?.isPick).map((video) => video.id),
    [drafts, videos],
  );

  useEffect(() => {
    if (stage !== "rank") return;
    setRanked((previous) => {
      const kept = previous.filter((id) => picks.includes(id));
      const added = picks.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [stage, picks]);

  const submitMutation = useMutation({
    mutationFn: () => submit({ data: { token, rankedVideoIds: ranked, overallNote: note } }),
    onSuccess: () => {
      try {
        localStorage.removeItem(storageKey(token));
      } catch {
        /* ignore */
      }
      setStage("done");
    },
  });

  const goNext = useCallback(() => {
    setIndex((value) => (value + 1 < videos.length ? value + 1 : value));
  }, [videos.length]);
  const goPrev = useCallback(() => setIndex((value) => Math.max(0, value - 1)), []);

  useEffect(() => {
    if (stage !== "review") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA"].includes(target.tagName)) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") goNext();
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") goPrev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, goNext, goPrev]);

  if (session.isLoading) {
    return <Screen>Loading your review…</Screen>;
  }
  if (session.error || !session.data) {
    return (
      <Screen>
        <h1 className="font-serif text-3xl font-bold">This link isn't valid</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Ask the brand for a fresh review link.
        </p>
      </Screen>
    );
  }

  const data: PortalSessionDTO = session.data;

  if (data.expired && stage !== "done") {
    return (
      <Screen>
        <h1 className="font-serif text-3xl font-bold">This review has closed</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The deadline passed on {new Date(data.deadlineAt).toLocaleDateString()}. Nothing else is
          needed from you.
        </p>
      </Screen>
    );
  }

  if (stage === "done") {
    return (
      <Screen>
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Terac · review submitted
        </p>
        <h1 className="mt-5 font-serif text-4xl font-bold leading-tight">Thank you, {data.judgeName}.</h1>
        <p className="mt-3 max-w-sm text-sm text-muted-foreground">
          Your picks and notes went straight to {data.brandName}. Reviews are final — no edits, and
          you won't see other judges' input.
        </p>
      </Screen>
    );
  }

  if (stage === "landing") {
    return (
      <Screen>
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Terac · expert review
        </p>
        <h1 className="mt-5 font-serif text-4xl font-bold leading-tight">{data.brandName}</h1>
        {data.oneLiner ? (
          <p className="mt-3 max-w-sm text-base text-muted-foreground">{data.oneLiner}</p>
        ) : null}
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border">
          <Fact label="Videos" value={String(data.videos.length)} />
          <Fact label="Takes about" value={`${data.estimatedMinutes} min`} />
        </dl>
        <p className="mt-6 text-sm text-muted-foreground">
          One video at a time. Tap six quick ratings, add a note if you want, mark your top picks.
          No account, and your answers save as you go.
        </p>
        <button
          type="button"
          onClick={() => setStage("review")}
          className="mt-8 w-full rounded-2xl bg-foreground px-6 py-5 text-base font-semibold text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Start review
        </button>
      </Screen>
    );
  }

  if (stage === "rank") {
    return (
      <Screen>
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground">
          Last step
        </p>
        <h1 className="mt-5 font-serif text-3xl font-bold leading-tight">Rank your top picks</h1>
        {ranked.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            You didn't mark any top picks — that's a valid answer. Add an overall note and submit.
          </p>
        ) : (
          <ol className="mt-6 space-y-3">
            {ranked.map((id, position) => {
              const video = videos.find((item) => item.id === id);
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={(event) => event.dataTransfer.setData("text/plain", id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    const dragged = event.dataTransfer.getData("text/plain");
                    setRanked((previous) => {
                      const next = previous.filter((item) => item !== dragged);
                      next.splice(previous.indexOf(id), 0, dragged);
                      return next;
                    });
                  }}
                  className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4"
                >
                  <span className="font-serif text-2xl font-bold">{position + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {video?.conceptTitle || video?.hookText || "Concept"}
                  </span>
                  <span className="flex gap-1">
                    <RankButton
                      label={`Move ${position + 1} up`}
                      disabled={position === 0}
                      onClick={() =>
                        setRanked((previous) => swap(previous, position, position - 1))
                      }
                    >
                      ↑
                    </RankButton>
                    <RankButton
                      label={`Move ${position + 1} down`}
                      disabled={position === ranked.length - 1}
                      onClick={() =>
                        setRanked((previous) => swap(previous, position, position + 1))
                      }
                    >
                      ↓
                    </RankButton>
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        <label htmlFor="overall-note" className="mt-8 block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          One overall note
        </label>
        <textarea
          id="overall-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={4}
          placeholder="What should they fix first?"
          className="mt-2 w-full rounded-2xl border border-border bg-card p-4 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        />

        {submitMutation.error ? (
          <p className="mt-3 text-sm text-destructive">{(submitMutation.error as Error).message}</p>
        ) : null}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setStage("review")}
            className="rounded-2xl border border-border px-5 py-4 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            Back
          </button>
          <button
            type="button"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="flex-1 rounded-2xl bg-foreground px-6 py-4 text-base font-semibold text-background disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {submitMutation.isPending ? "Submitting…" : "Submit review"}
          </button>
        </div>
      </Screen>
    );
  }

  const draft = current ? drafts[current.id] : undefined;

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col">
        <header className="flex items-center justify-between px-5 pt-5">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            {data.brandName}
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            {index + 1} / {videos.length}
          </span>
        </header>

        {current ? (
          <VideoStage
            key={current.id}
            title={current.conceptTitle}
            hook={current.hookText}
            script={current.script}
            playbackUrl={current.playbackUrl}
            thumbnailUrl={current.thumbnailUrl}
            nextPlaybackUrl={videos[index + 1]?.playbackUrl ?? null}
            onSwipe={(direction) => (direction === "next" ? goNext() : goPrev())}
          />
        ) : null}

        <div className="sticky bottom-0 space-y-4 border-t border-border bg-background/95 px-5 pb-6 pt-4 backdrop-blur">
          <div className="grid grid-cols-2 gap-2">
            {REVIEW_DIMENSIONS.map((dimension) => (
              <fieldset key={dimension.key} className="min-w-0">
                <legend className="mb-1 truncate font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {dimension.label}
                </legend>
                <div className="flex gap-1">
                  {DIMENSION_SCORES.map((score) => (
                    <ScoreButton
                      key={score}
                      score={score}
                      active={draft?.scores?.[dimension.key as DimensionKey] === score}
                      onClick={() =>
                        current &&
                        pushDraft(current.id, {
                          scores: { ...(draft?.scores ?? {}), [dimension.key]: score },
                        })
                      }
                    />
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <textarea
            value={draft?.body ?? ""}
            onChange={(event) => current && pushDraft(current.id, { body: event.target.value })}
            rows={draft?.body ? 3 : 1}
            aria-label="Comment on this video"
            placeholder="Add a note (optional)"
            className="w-full resize-none rounded-xl border border-border bg-card px-4 py-3 text-base focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />

          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={Boolean(draft?.isPick)}
              onClick={() => current && pushDraft(current.id, { isPick: !draft?.isPick })}
              className={cn(
                "rounded-xl border px-4 py-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
                draft?.isPick
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground",
              )}
            >
              {draft?.isPick ? "★ Top pick" : "☆ Top pick"}
            </button>
            {index + 1 < videos.length ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 rounded-xl bg-secondary px-5 py-4 text-base font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Next video →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setStage("rank")}
                className="flex-1 rounded-xl bg-foreground px-5 py-4 text-base font-semibold text-background focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Finish →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function swap(items: string[], a: number, b: number) {
  const next = [...items];
  const temp = next[a]!;
  next[a] = next[b]!;
  next[b] = temp;
  return next;
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto w-full max-w-md px-6 py-16">{children}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card px-5 py-5">
      <dt className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 font-serif text-2xl font-bold">{value}</dd>
    </div>
  );
}

function RankButton({
  children,
  label,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="size-9 rounded-lg border border-border text-sm disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      {children}
    </button>
  );
}

function ScoreButton({
  score,
  active,
  onClick,
}: {
  score: DimensionScore;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border px-1 py-2 text-[11px] font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-muted-foreground",
      )}
    >
      {score}
    </button>
  );
}

/**
 * Full-bleed vertical player. Muted autoplay with tap-to-unmute, swipe to move
 * between videos, and the next video preloaded while this one plays.
 * Until the render pipeline writes playback URLs, the concept copy stands in.
 */
function VideoStage({
  title,
  hook,
  script,
  playbackUrl,
  thumbnailUrl,
  nextPlaybackUrl,
  onSwipe,
}: {
  title: string;
  hook: string;
  script: string;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  nextPlaybackUrl: string | null;
  onSwipe: (direction: "next" | "prev") => void;
}) {
  const [muted, setMuted] = useState(true);
  const startY = useRef<number | null>(null);

  return (
    <div
      className="relative mx-5 mt-4 flex-1 overflow-hidden rounded-3xl bg-secondary"
      onTouchStart={(event) => {
        startY.current = event.touches[0]?.clientY ?? null;
      }}
      onTouchEnd={(event) => {
        const start = startY.current;
        const end = event.changedTouches[0]?.clientY ?? null;
        if (start === null || end === null) return;
        if (Math.abs(end - start) > 60) onSwipe(end < start ? "next" : "prev");
        startY.current = null;
      }}
    >
      {playbackUrl ? (
        <>
          <video
            src={playbackUrl}
            poster={thumbnailUrl ?? undefined}
            autoPlay
            loop
            muted={muted}
            playsInline
            controls
            className="size-full object-cover"
          />
          <button
            type="button"
            onClick={() => setMuted((value) => !value)}
            className="absolute right-4 top-4 rounded-full bg-background/85 px-4 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {muted ? "Tap for sound" : "Mute"}
          </button>
          {nextPlaybackUrl ? (
            <video src={nextPlaybackUrl} preload="auto" muted className="hidden" />
          ) : null}
        </>
      ) : (
        <div className="flex size-full flex-col justify-end gap-3 p-6">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {title}
          </span>
          <p className="font-serif text-2xl font-bold leading-snug">{hook}</p>
          {script ? (
            <p className="max-h-40 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
              {script}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
