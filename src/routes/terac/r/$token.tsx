import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  claimReview,
  openReview,
  saveReviewBallot,
  submitReview,
} from "@/lib/terac/portal.functions";
import type { PortalPayload } from "@/lib/terac/portal.server";
import type { DimensionScores } from "@/lib/terac/spec";
import { DimensionTaps } from "@/components/terac/DimensionTaps";
import { RankList, type RankItem } from "@/components/terac/RankList";
import { VideoStage } from "@/components/terac/VideoStage";

export const Route = createFileRoute("/terac/r/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Review these ads — Terac" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
  }),
  component: JudgePortal,
});

type Ballot = { isPick: boolean; body: string; scores: DimensionScores };
type BallotMap = Record<string, Ballot>;

const EMPTY: Ballot = { isPick: false, body: "", scores: {} };

function storageKey(token: string) {
  return `terac:ballot:${token}`;
}

/** Nothing a judge types is lost to a closed tab — every change lands in
 *  localStorage synchronously, and the server save is debounced behind it. */
function readLocal(token: string): BallotMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(token));
    return raw ? (JSON.parse(raw) as BallotMap) : {};
  } catch {
    return {};
  }
}

function writeLocal(token: string, ballots: BallotMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(token), JSON.stringify(ballots));
  } catch {
    /* quota or private mode — the server autosave is still the source of truth */
  }
}

function JudgePortal() {
  const { token } = Route.useParams();
  const open = useServerFn(openReview);

  const review = useQuery({
    queryKey: ["terac-review", token],
    queryFn: () => open({ data: { token } }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (review.isLoading) {
    return (
      <Shell>
        <p className="text-sm text-neutral-400">Loading your review…</p>
      </Shell>
    );
  }

  if (review.isError) {
    return <ClaimOrError token={token} failure={classifyError(review.error)} />;
  }

  return <Review token={token} payload={review.data as PortalPayload} />;
}

type PortalFailure = "closed" | "unknown_token" | "broken";

/**
 * Judges are outsiders doing someone a favour. They never see a stack trace or
 * a Postgres message — those go to the console for us, and they get a sentence.
 */
function classifyError(error: unknown): PortalFailure {
  const raw = error instanceof Error ? error.message : String(error);
  if (/closed/i.test(raw)) return "closed";
  if (/invalid link/i.test(raw)) return "unknown_token";
  console.error("[terac:portal]", raw);
  return "broken";
}

const FAILURE_COPY: Record<PortalFailure, string> = {
  closed: "This review has closed.",
  unknown_token: "This link is not valid.",
  broken: "We can't open this review right now.",
};

/** Errors surfaced inside the review itself (submit, claim) still need a line. */
function errorMessage(error: unknown): string {
  return FAILURE_COPY[classifyError(error)];
}

// ---------------------------------------------------------------------------
// Ad-hoc reviewer: a bare session token, or a forwarded link.
// ---------------------------------------------------------------------------

function ClaimOrError({ token, failure }: { token: string; failure: PortalFailure }) {
  const claim = useServerFn(claimReview);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const mutation = useMutation({
    mutationFn: () => claim({ data: { publicToken: token, name, email } }),
    onSuccess: (result) => {
      window.location.replace(`/terac/r/${result.invite_token}`);
    },
  });

  // Only an unrecognised token might be a bare session link worth claiming.
  // Offering the form when the backend is down would just waste their time.
  const canClaim = failure === "unknown_token";

  return (
    <Shell>
      <h1 className="font-serif text-2xl font-semibold text-white">{FAILURE_COPY[failure]}</h1>

      {!canClaim ? (
        <p className="mt-3 text-sm text-neutral-400">
          {failure === "closed"
            ? "The panel has finished. Thanks for making time."
            : "Nothing you did — try again in a few minutes, or ask whoever sent this for a fresh link."}
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-neutral-400">
            If you were forwarded this link, add your name and email and we'll issue you your own.
          </p>
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              mutation.mutate();
            }}
          >
            <label className="block">
              <span className="text-[13px] text-neutral-300">Your name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-[15px] text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                placeholder="Priya Anand"
              />
            </label>
            <label className="block">
              <span className="text-[13px] text-neutral-300">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-[15px] text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                placeholder="priya@example.com"
              />
            </label>
            {mutation.isError ? (
              <p className="text-[13px] text-rose-300">{errorMessage(mutation.error)}</p>
            ) : null}
            <button
              type="submit"
              disabled={mutation.isPending}
              className="w-full rounded-md bg-white px-4 py-3 text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              {mutation.isPending ? "Setting up…" : "Start reviewing"}
            </button>
          </form>
        </>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------------

type Phase = "landing" | "review" | "rank" | "done";

function Review({ token, payload }: { token: string; payload: PortalPayload }) {
  const save = useServerFn(saveReviewBallot);
  const submit = useServerFn(submitReview);

  const alreadySubmitted = payload.judge.status === "submitted";
  const [phase, setPhase] = useState<Phase>(alreadySubmitted ? "done" : "landing");
  const [index, setIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [note, setNote] = useState(payload.judge.overall_note ?? "");
  const [order, setOrder] = useState<RankItem[]>([]);

  // Server state is the floor; anything unsaved in localStorage sits on top.
  const [ballots, setBallots] = useState<BallotMap>(() => {
    const fromServer: BallotMap = {};
    for (const video of payload.videos) {
      fromServer[video.id] = {
        isPick: video.ballot.is_pick,
        body: video.ballot.body,
        scores: video.ballot.dimension_scores ?? {},
      };
    }
    return { ...fromServer, ...readLocal(token) };
  });

  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const persist = useCallback(
    (videoId: string, ballot: Ballot) => {
      const existing = timers.current.get(videoId);
      if (existing) clearTimeout(existing);
      timers.current.set(
        videoId,
        setTimeout(() => {
          void save({
            data: {
              token,
              videoId,
              isPick: ballot.isPick,
              body: ballot.body,
              dimensionScores: ballot.scores,
            },
          }).catch(() => undefined);
        }, 600),
      );
    },
    [save, token],
  );

  const update = useCallback(
    (videoId: string, patch: Partial<Ballot>) => {
      setBallots((prev) => {
        const next = { ...prev, [videoId]: { ...(prev[videoId] ?? EMPTY), ...patch } };
        writeLocal(token, next);
        persist(videoId, next[videoId]!);
        return next;
      });
    },
    [persist, token],
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
    };
  }, []);

  const videos = payload.videos;
  const current = videos[index];

  useEffect(() => {
    if (phase !== "review") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "ArrowRight") setIndex((i) => Math.min(i + 1, videos.length - 1));
      if (event.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, videos.length]);

  const picks = useMemo(() => videos.filter((v) => ballots[v.id]?.isPick), [videos, ballots]);

  const submitMutation = useMutation({
    mutationFn: () =>
      submit({
        data: {
          token,
          ranks: order.map((item, i) => ({ video_id: item.id, rank: i + 1 })),
          overallNote: note,
        },
      }),
    onSuccess: () => {
      writeLocal(token, {});
      setPhase("done");
    },
  });

  if (phase === "done") {
    return (
      <Shell>
        <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500">Submitted</p>
        <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight text-white">
          Thank you — that's exactly what they needed.
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-neutral-400">
          Your review has gone to {payload.brand.name}. It's locked now, and you won't see anyone
          else's input — that's deliberate, so nobody's read is coloured by the panel.
        </p>
      </Shell>
    );
  }

  if (phase === "landing") {
    const minutes = Math.max(2, Math.round(videos.length * 1.3));
    return (
      <Shell>
        <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500">
          {payload.brand.category}
        </p>
        <h1 className="mt-4 font-serif text-3xl font-semibold leading-tight text-white">
          {payload.brand.name}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-neutral-300">{payload.brand.bio}</p>

        <dl className="mt-8 space-y-3 border-t border-neutral-800 pt-6 text-[14px]">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">To review</dt>
            <dd className="text-neutral-100">
              {videos.length} ad{videos.length === 1 ? "" : "s"}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Takes about</dt>
            <dd className="text-neutral-100">{minutes} minutes</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-500">Open until</dt>
            <dd className="text-neutral-100">
              {new Date(payload.session.deadline_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={() => setPhase("review")}
          className="mt-8 w-full rounded-md bg-white px-4 py-3.5 text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
        >
          Start
        </button>
        <p className="mt-3 text-center text-[13px] text-neutral-500">
          No account, no password. This link is yours.
        </p>
      </Shell>
    );
  }

  if (phase === "rank") {
    const items: RankItem[] =
      order.length > 0
        ? order
        : picks.map((v) => ({ id: v.id, title: v.concept_title, hook: v.hook_text }));

    return (
      <Shell>
        <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500">Last step</p>
        <h1 className="mt-4 font-serif text-2xl font-semibold leading-tight text-white">
          {items.length > 1 ? "Put your picks in order" : "One last note"}
        </h1>

        {items.length > 0 ? (
          <div className="mt-6">
            <RankList items={items} onChange={setOrder} />
          </div>
        ) : (
          <p className="mt-4 text-[14px] text-neutral-400">
            You didn't mark a top pick. That's a valid answer — leave a note below if you want to
            say why.
          </p>
        )}

        <label className="mt-8 block">
          <span className="text-[13px] text-neutral-300">Anything for the founder overall?</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={4}
            className="mt-2 w-full resize-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-[15px] leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            placeholder="Optional"
          />
        </label>

        {submitMutation.isError ? (
          <p className="mt-3 text-[13px] text-rose-300">{errorMessage(submitMutation.error)}</p>
        ) : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => setPhase("review")}
            className="rounded-md border border-neutral-700 px-4 py-3 text-[15px] text-neutral-200 transition-colors hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Back
          </button>
          <button
            type="button"
            disabled={submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
            className="flex-1 rounded-md bg-white px-4 py-3 text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            {submitMutation.isPending ? "Submitting…" : "Submit review"}
          </button>
        </div>
        <p className="mt-3 text-center text-[13px] text-neutral-500">
          You can't edit after submitting.
        </p>
      </Shell>
    );
  }

  if (!current) return null;
  const ballot = ballots[current.id] ?? EMPTY;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-neutral-950 text-neutral-100">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="flex flex-1 gap-1.5" aria-label={`Ad ${index + 1} of ${videos.length}`}>
          {videos.map((video, i) => (
            <span
              key={video.id}
              className={`h-0.5 flex-1 rounded-full ${i <= index ? "bg-neutral-100" : "bg-neutral-800"}`}
            />
          ))}
        </div>
        <span className="shrink-0 font-mono text-[12px] text-neutral-500">
          {index + 1}/{videos.length}
        </span>
      </header>

      <SwipeArea
        onNext={() => setIndex((i) => Math.min(i + 1, videos.length - 1))}
        onPrev={() => setIndex((i) => Math.max(i - 1, 0))}
      >
        <VideoStage video={current} active muted={muted} onToggleMute={() => setMuted((m) => !m)} />
      </SwipeArea>

      {/* Preload the next concept's poster while this one is being watched. */}
      {videos[index + 1]?.thumbnail_url ? (
        <link rel="prefetch" as="image" href={videos[index + 1]!.thumbnail_url!} />
      ) : null}

      <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          aria-pressed={ballot.isPick}
          onClick={() => update(current.id, { isPick: !ballot.isPick })}
          className={[
            "w-full rounded-md px-4 py-3 text-[15px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950",
            ballot.isPick
              ? "bg-emerald-300 text-emerald-950"
              : "border border-neutral-700 text-neutral-200 hover:bg-neutral-900",
          ].join(" ")}
        >
          {ballot.isPick ? "✓ Top pick" : "Mark as top pick"}
        </button>

        <div className="mt-4">
          <DimensionTaps
            value={ballot.scores}
            onChange={(scores) => update(current.id, { scores })}
          />
        </div>

        <textarea
          value={ballot.body}
          onChange={(event) => update(current.id, { body: event.target.value })}
          rows={ballot.body ? 3 : 1}
          placeholder="Add a note (optional)"
          className="mt-4 w-full resize-none rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-[15px] leading-relaxed text-neutral-100 placeholder:text-neutral-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(i - 1, 0))}
            disabled={index === 0}
            className="rounded-md border border-neutral-700 px-4 py-3 text-[15px] text-neutral-200 transition-colors hover:bg-neutral-900 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
          >
            Back
          </button>
          {index === videos.length - 1 ? (
            <button
              type="button"
              onClick={() => setPhase("rank")}
              className="flex-1 rounded-md bg-white px-4 py-3 text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Finish
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIndex((i) => i + 1)}
              className="flex-1 rounded-md bg-white px-4 py-3 text-[15px] font-medium text-neutral-900 transition-colors hover:bg-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              Next ad
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function SwipeArea({
  children,
  onNext,
  onPrev,
}: {
  children: React.ReactNode;
  onNext: () => void;
  onPrev: () => void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className="relative min-h-0 flex-1 overflow-hidden"
      onTouchStart={(event) => {
        const touch = event.touches[0];
        if (touch) start.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={(event) => {
        const from = start.current;
        const touch = event.changedTouches[0];
        start.current = null;
        if (!from || !touch) return;
        const dx = touch.clientX - from.x;
        const dy = touch.clientY - from.y;
        // Horizontal intent only — vertical is the storyboard scrolling.
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        if (dx < 0) onNext();
        else onPrev();
      }}
    >
      {children}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-neutral-950">
      <div className="mx-auto w-full max-w-md flex-1 px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-12">
        {children}
      </div>
      <p className="pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[11px] uppercase tracking-[0.2em] text-neutral-700">
        Terac
      </p>
    </div>
  );
}
