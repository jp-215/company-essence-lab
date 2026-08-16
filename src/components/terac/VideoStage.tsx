import { useEffect, useRef, useState } from "react";

export type StageBeat = {
  id: string;
  start_s: number;
  end_s: number;
  purpose: string;
  direction: string;
};

export type StageVideo = {
  id: string;
  concept_title: string;
  hook_text: string;
  playback_id: string | null;
  /** A directly-playable file — the vira-engine render. Used when there is no HLS ladder. */
  playback_url: string | null;
  media_status: string;
  beats: StageBeat[] | null;
  cta: { text: string; placement: string } | null;
};

/** Native HLS (Safari, iOS) needs no library; everything else loads hls.js lazily. */
function canPlayHlsNatively(el: HTMLVideoElement): boolean {
  return el.canPlayType("application/vnd.apple.mpegurl") !== "";
}

function hlsSrc(playbackId: string): string {
  const driver = import.meta.env["VITE_TERAC_VIDEO_DRIVER"] ?? "storyboard";
  if (driver === "cloudflare") {
    const domain = import.meta.env["VITE_CF_STREAM_DOMAIN"] ?? "videodelivery.net";
    return `https://${domain}/${playbackId}/manifest/video.m3u8`;
  }
  return `https://stream.mux.com/${playbackId}.m3u8`;
}

/**
 * HLS when there is a ladder, the engine's MP4 when there is only a file, a
 * readable storyboard when there is neither.
 *
 * HLS stays preferred — judges open this on a phone on cell data — but a real
 * render must never hide behind a storyboard just because it never went through
 * Mux. vira-engine hands back a plain MP4 and that is what agents need to see.
 */
export function VideoStage({
  video,
  active,
  muted,
  onToggleMute,
}: {
  video: StageVideo;
  active: boolean;
  muted: boolean;
  onToggleMute: () => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // A direct file needs no manifest handling at all.
    if (!video.playback_id) {
      if (video.playback_url) el.src = video.playback_url;
      return;
    }

    const src = hlsSrc(video.playback_id);
    let destroy: (() => void) | undefined;

    if (canPlayHlsNatively(el)) {
      el.src = src;
    } else {
      let cancelled = false;
      void import("hls.js")
        .then(({ default: Hls }) => {
          if (cancelled || !Hls.isSupported()) {
            if (!cancelled) setFailed(true);
            return;
          }
          const hls = new Hls({ maxBufferLength: 12, capLevelToPlayerSize: true });
          hls.loadSource(src);
          hls.attachMedia(el);
          hls.on(Hls.Events.ERROR, (_e, data) => {
            if (data.fatal) setFailed(true);
          });
          destroy = () => hls.destroy();
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
      return () => {
        cancelled = true;
        destroy?.();
      };
    }

    return () => {
      destroy?.();
    };
  }, [video.playback_id, video.playback_url]);

  useEffect(() => {
    const el = ref.current;
    if (!el || (!video.playback_id && !video.playback_url)) return;
    if (active) void el.play().catch(() => undefined);
    else el.pause();
  }, [active, video.playback_id, video.playback_url]);

  const hasMedia = Boolean(video.playback_id || video.playback_url) && !failed;

  if (hasMedia) {
    return (
      <div className="relative h-full w-full bg-black">
        <video
          ref={ref}
          className="h-full w-full object-contain"
          playsInline
          muted={muted}
          loop
          preload={active ? "auto" : "metadata"}
          onError={() => setFailed(true)}
          aria-label={`${video.concept_title} — ad concept`}
        />
        <button
          type="button"
          onClick={onToggleMute}
          className="absolute bottom-4 right-4 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-neutral-900 shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          {muted ? "Tap for sound" : "Mute"}
        </button>
      </div>
    );
  }

  return <Storyboard video={video} unavailable={failed} />;
}

/**
 * The no-render path. Vira produces scripts, not video files, so a judge still
 * needs something reviewable: the hook at full weight, then the beats in order.
 */
function Storyboard({ video, unavailable }: { video: StageVideo; unavailable: boolean }) {
  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-neutral-950 px-6 py-8 text-neutral-100">
      <p className="text-[11px] uppercase tracking-[0.28em] text-neutral-500">
        {unavailable ? "Playback unavailable — storyboard" : "Storyboard"}
      </p>

      <h2 className="mt-5 font-serif text-[1.75rem] font-semibold leading-tight text-white">
        {video.hook_text || video.concept_title}
      </h2>
      <p className="mt-2 text-sm text-neutral-400">{video.concept_title}</p>

      <ol className="mt-8 space-y-5 border-l border-neutral-800 pl-5">
        {(video.beats ?? []).map((beat) => (
          <li key={beat.id} className="relative">
            <span
              className="absolute -left-[1.55rem] top-1.5 size-2 rounded-full bg-neutral-600"
              aria-hidden="true"
            />
            <p className="font-mono text-[11px] uppercase tracking-wider text-neutral-500">
              {beat.start_s}–{beat.end_s}s · {beat.purpose || "beat"}
            </p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-neutral-200">{beat.direction}</p>
          </li>
        ))}
      </ol>

      {video.cta?.text ? (
        <div className="mt-8 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-neutral-500">Call to action</p>
          <p className="mt-1.5 text-[15px] text-neutral-100">{video.cta.text}</p>
        </div>
      ) : null}

      <div className="h-8 shrink-0" />
    </div>
  );
}
