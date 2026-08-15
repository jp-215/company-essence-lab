import { Link } from "@tanstack/react-router";
import { ExternalLink, Play, Sparkles } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PublicTrend } from "@/lib/trends-feed.server";
import type { PublicWom } from "@/lib/wom-feed.server";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

export type FeedItem =
  | ({ kind: "video" } & PublicTrend)
  | ({ kind: "chatter" } & PublicWom);

export function tiktokVideoId(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  return sourceUrl.match(/\/video\/(\d+)/)?.[1] ?? null;
}

function Actions({ sourceUrl, label }: { sourceUrl: string | null; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild size="sm">
        <Link to="/remix">
          <Sparkles className="mr-1.5 size-3.5" /> Remix this
        </Link>
      </Button>
      {sourceUrl ? (
        <Button asChild size="sm" variant="outline">
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-1.5 size-3.5" /> {label}
          </a>
        </Button>
      ) : null}
    </div>
  );
}

/** Auto-playing TikTok card. The embed only mounts while the card is in view. */
export function VideoCard({ item, active }: { item: PublicTrend; active: boolean }) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const videoId = tiktokVideoId(item.sourceUrl);
  const thumbSrc =
    item.sourceUrl && !thumbFailed
      ? `/api/public/tiktok-thumb?url=${encodeURIComponent(item.sourceUrl)}`
      : null;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-5 px-4 py-6 sm:flex-row sm:gap-8">
      <div className="relative h-[min(72vh,560px)] w-full max-w-[315px] shrink-0 self-center overflow-hidden rounded-3xl border border-border bg-secondary">
        {active && videoId ? (
          <iframe
            key={item.trendKey}
            src={`https://www.tiktok.com/embed/v2/${videoId}?autoplay=1&muted=1`}
            title={item.title || "Trending post"}
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
            allowFullScreen
            className="size-full border-0"
          />
        ) : (
          <>
            {thumbSrc ? (
              <img
                src={thumbSrc}
                alt={item.title || "Trending post preview"}
                loading="lazy"
                onError={() => setThumbFailed(true)}
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-14 items-center justify-center rounded-full border border-border bg-card/80 backdrop-blur">
                <Play className="size-5 text-foreground" />
              </span>
            </div>
          </>
        )}
      </div>

      <div className="flex w-full max-w-md flex-col justify-center gap-3 text-left">
        <div className="flex items-center gap-2">
          <Badge variant="outline">{item.platform}</Badge>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            video trend
          </span>
          {item.categoryName ? <Badge variant="secondary">{item.categoryName}</Badge> : null}
        </div>
        <h2 className="font-serif text-2xl font-semibold leading-tight text-foreground">
          {item.title || item.caption.slice(0, 80) || "Trending clip"}
        </h2>
        {item.author ? (
          <p className="text-sm text-muted-foreground">@{item.author}</p>
        ) : null}
        <p className="line-clamp-5 text-sm leading-relaxed text-muted-foreground">{item.caption}</p>
        {item.hashtags.length ? (
          <p className="font-mono text-xs text-muted-foreground">
            {item.hashtags.slice(0, 6).map((tag) => `#${tag.replace(/^#/, "")}`).join("  ")}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {compact.format(item.views)} views · {compact.format(item.likes)} likes ·{" "}
          {(item.engagementRate * 100).toFixed(1)}% engagement
        </p>
        <Actions sourceUrl={item.sourceUrl} label="Open original" />
      </div>
    </div>
  );
}

/** Reddit / word-of-mouth card. */
export function ChatterCard({ item }: { item: PublicWom }) {
  return (
    <div className="flex h-full w-full items-center justify-center px-4 py-6">
      <div className="w-full max-w-xl rounded-3xl border border-border bg-card p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{item.platform}</Badge>
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            word of mouth
          </span>
          {item.categoryName ? <Badge variant="secondary">{item.categoryName}</Badge> : null}
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {item.authorHandle ? `r/${item.authorHandle.replace(/^r\//, "")}` : item.author}
        </p>
        <h2 className="mt-2 font-serif text-2xl font-semibold leading-tight text-foreground">
          {item.title || item.content.slice(0, 90)}
        </h2>
        <p className="mt-3 line-clamp-[10] whitespace-pre-line text-sm leading-relaxed text-foreground/90">
          {item.content}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {[item.topic, item.theme, item.sentiment].filter(Boolean).map((tag) => (
            <Badge key={tag} variant="secondary">
              {tag}
            </Badge>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          {compact.format(item.likes)} upvotes · {compact.format(item.replies)} comments
        </p>
        <div className="mt-5">
          <Actions sourceUrl={item.sourceUrl} label="Open thread" />
        </div>
      </div>
    </div>
  );
}
