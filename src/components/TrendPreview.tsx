import { useState } from "react";
import { Play } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function tiktokVideoId(sourceUrl: string): string | null {
  const match = sourceUrl.match(/\/video\/(\d+)/);
  return match?.[1] ?? null;
}

type TrendPreviewProps = {
  sourceUrl: string | null;
  platform: string;
  title: string;
  className?: string;
  children?: React.ReactNode;
};

/**
 * Shows the real post cover image for a trend and plays the actual clip in a
 * modal TikTok embed. Falls back to a static play badge when no preview exists.
 */
export function TrendPreview({
  sourceUrl,
  platform,
  title,
  className,
  children,
}: TrendPreviewProps) {
  const [open, setOpen] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);

  const isTikTok = platform === "tiktok" && !!sourceUrl;
  const videoId = sourceUrl ? tiktokVideoId(sourceUrl) : null;
  const thumbSrc =
    isTikTok && !thumbFailed
      ? `/api/public/tiktok-thumb?url=${encodeURIComponent(sourceUrl!)}`
      : null;

  const overlay = (
    <>
      <span className="flex size-14 items-center justify-center rounded-full border border-border bg-card transition-colors group-hover:border-ring">
        <Play className="size-5 text-foreground" />
      </span>
      <span className="mt-4 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {sourceUrl ? "Watch original" : "Video thumbnail"}
      </span>
    </>
  );

  const body = (
    <>
      {thumbSrc ? (
        <img
          src={thumbSrc}
          alt={title || "Trending post preview"}
          loading="lazy"
          onError={() => setThumbFailed(true)}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      <div
        className={cn(
          "relative z-10 flex flex-col items-center justify-center",
          thumbSrc && "rounded-2xl bg-card/70 px-6 py-5 backdrop-blur-sm",
        )}
      >
        {overlay}
      </div>
      {children}
    </>
  );

  const shell = cn(
    "group relative flex aspect-[3/4] flex-col items-center justify-center overflow-hidden bg-secondary",
    className,
  );

  if (!sourceUrl) {
    return <div className={shell}>{body}</div>;
  }

  if (!videoId) {
    return (
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Watch the original post"
        className={shell}
      >
        {body}
      </a>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Play the original post"
        className={cn(shell, "text-left")}
      >
        {body}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[380px] overflow-hidden border-border bg-card p-0">
          <DialogTitle className="sr-only">{title || "Trending post"}</DialogTitle>
          <div className="aspect-[9/16] w-full bg-secondary">
            {open ? (
              <iframe
                src={`https://www.tiktok.com/embed/v2/${videoId}`}
                title={title || "Trending post"}
                allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
                className="size-full border-0"
              />
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {platform}
            </span>
            <a
              href={sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm underline underline-offset-4"
            >
              Open on TikTok
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
