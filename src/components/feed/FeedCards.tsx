import { Link } from "@tanstack/react-router";
import { Check, ExternalLink, Play, Sparkles } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicTrend } from "@/lib/trends-feed.server";
import type { PublicWom } from "@/lib/wom-feed.server";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

export type FeedItem = ({ kind: "video" } & PublicTrend) | ({ kind: "chatter" } & PublicWom);

export type SelectionProps = {
  selected?: boolean | undefined;
  onToggleSelect?: (() => void) | undefined;
};


export function tiktokVideoId(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;
  return sourceUrl.match(/\/video\/(\d+)/)?.[1] ?? null;
}

/** Shared layout frame: wide, left-aligned column instead of dead-centred text. */
function Slide({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center">
      <div className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-12">{children}</div>
    </div>
  );
}

function SelectButton({ selected, onToggleSelect }: SelectionProps) {
  if (!onToggleSelect) return null;
  return (
    <Button
      size="sm"
      variant={selected ? "default" : "outline"}
      aria-pressed={selected}
      onClick={onToggleSelect}
    >
      {selected ? (
        <>
          <Check className="mr-1.5 size-3.5" /> Selected
        </>
      ) : (
        <>
          <Sparkles className="mr-1.5 size-3.5" /> Add to batch
        </>
      )}
    </Button>
  );
}

function Actions({
  sourceUrl,
  label,
  selected,
  onToggleSelect,
}: { sourceUrl: string | null; label: string } & SelectionProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SelectButton selected={selected} onToggleSelect={onToggleSelect} />
      <Button asChild size="sm" variant="ghost">
        <Link to="/remix">Remix one</Link>
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
export function VideoCard({
  item,
  active,
  selected,
  onToggleSelect,
}: { item: PublicTrend; active: boolean } & SelectionProps) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const videoId = tiktokVideoId(item.sourceUrl);
  const thumbSrc =
    item.sourceUrl && !thumbFailed
      ? `/api/public/tiktok-thumb?url=${encodeURIComponent(item.sourceUrl)}`
      : null;

  return (
    <Slide>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:items-center sm:gap-10 lg:gap-16">
        <div
          className={cn(
            "relative h-[min(66vh,520px)] w-full max-w-[300px] overflow-hidden rounded-3xl border bg-secondary transition-shadow",
            selected ? "border-foreground shadow-lg" : "border-border",
          )}
        >
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

        <div className="flex flex-col gap-3 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.platform}</Badge>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              video trend
            </span>
            {item.categoryName ? <Badge variant="secondary">{item.categoryName}</Badge> : null}
          </div>
          <h2 className="max-w-2xl font-serif text-2xl font-semibold leading-tight text-foreground lg:text-3xl">
            {item.title || item.caption.slice(0, 80) || "Trending clip"}
          </h2>
          {item.author ? <p className="text-sm text-muted-foreground">@{item.author}</p> : null}
          <p className="max-w-2xl line-clamp-5 text-sm leading-relaxed text-muted-foreground">
            {item.caption}
          </p>
          {item.hashtags.length ? (
            <p className="font-mono text-xs text-muted-foreground">
              {item.hashtags
                .slice(0, 6)
                .map((tag) => `#${tag.replace(/^#/, "")}`)
                .join("  ")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {compact.format(item.views)} views · {compact.format(item.likes)} likes ·{" "}
            {(item.engagementRate * 100).toFixed(1)}% engagement
          </p>
          <Actions
            sourceUrl={item.sourceUrl}
            label="Open original"
            selected={selected}
            onToggleSelect={onToggleSelect}
          />
        </div>
      </div>
    </Slide>
  );
}

/** Reddit / word-of-mouth card. */
export function ChatterCard({
  item,
  selected,
  onToggleSelect,
}: { item: PublicWom } & SelectionProps) {
  return (
    <Slide>
      <div className="grid gap-6 sm:grid-cols-[minmax(0,300px)_minmax(0,1fr)] sm:items-center sm:gap-10 lg:gap-16">
        <div className="hidden flex-col gap-2 sm:flex">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            {item.platform} thread
          </span>
          <p className="font-serif text-5xl font-semibold leading-none text-foreground/15">“</p>
          <p className="text-sm text-muted-foreground">
            {item.authorHandle ? `r/${item.authorHandle.replace(/^r\//, "")}` : item.author}
          </p>
          <p className="text-xs text-muted-foreground">
            {compact.format(item.likes)} upvotes · {compact.format(item.replies)} comments
          </p>
        </div>

        <div
          className={cn(
            "rounded-3xl border bg-card p-6 text-left sm:p-8",
            selected ? "border-foreground shadow-lg" : "border-border",
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{item.platform}</Badge>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              word of mouth
            </span>
            {item.categoryName ? <Badge variant="secondary">{item.categoryName}</Badge> : null}
          </div>
          <h2 className="mt-4 font-serif text-2xl font-semibold leading-tight text-foreground lg:text-3xl">
            {item.title || item.content.slice(0, 90)}
          </h2>
          <p className="mt-3 line-clamp-[8] whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {item.content}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[item.topic, item.theme, item.sentiment].filter(Boolean).map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
          <div className="mt-5">
            <Actions
              sourceUrl={item.sourceUrl}
              label="Open thread"
              selected={selected}
              onToggleSelect={onToggleSelect}
            />
          </div>
        </div>
      </div>
    </Slide>
  );
}
