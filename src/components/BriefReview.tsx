import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import type { CreativeBrief } from "@/lib/brief-types";

/**
 * Read-only review of the Creative Brief the engine will render from:
 * tone, palette, texture words and the beat sheet, plus rejected references.
 */
export function BriefReview({
  open,
  onOpenChange,
  loading,
  error,
  brief,
  rendering,
  onRender,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  error: string | null;
  brief: CreativeBrief | null;
  rendering: boolean;
  onRender: () => void;
}) {
  const imageRefs = brief?.references.filter((ref) => ref.type === "image") ?? [];
  const trendRefs = brief?.references.filter((ref) => ref.type === "trend") ?? [];
  const textures = imageRefs.flatMap((ref) =>
    ref.type === "image" ? ref.texture.surfaceTexture : [],
  );
  const tones = imageRefs.map((ref) => (ref.type === "image" ? ref.sentiment.tone : "")).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Review the brief</DialogTitle>
          <DialogDescription>
            This is what the video engine receives — read off your picks before you spend a render.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : error ? (
          <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
            {error}
          </p>
        ) : brief ? (
          <div className="space-y-6">
            <Section label="Hook">
              <p className="font-serif text-lg text-foreground">
                {brief.narrative.hook || "—"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {brief.durationSeconds}s · {brief.aspectRatio} · {brief.style.pace} pace ·{" "}
                {brief.signalQuality === "low" ? "low-confidence signals" : "high-confidence signals"}
              </p>
            </Section>

            <Section label="Look & palette">
              <p className="text-sm text-foreground">{brief.style.look || "—"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {brief.style.palette.map((hex) => (
                  <span
                    key={hex}
                    className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 font-mono text-[11px] text-muted-foreground"
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-border"
                      style={{ backgroundColor: hex }}
                    />
                    {hex}
                  </span>
                ))}
              </div>
              {tones.length || textures.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[...new Set([...tones, ...textures])].slice(0, 10).map((word) => (
                    <Badge key={word} variant="outline">
                      {word}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Section>

            <Section label="Beats">
              <ol className="space-y-3">
                {brief.narrative.beats.map((beat, index) => (
                  <li key={`${beat.t}-${index}`} className="flex gap-3">
                    <span className="mt-0.5 font-mono text-xs text-muted-foreground">
                      {beat.t.toFixed(1)}s
                    </span>
                    <span className="text-sm text-foreground">
                      {beat.shot}
                      {beat.onScreenText ? (
                        <span className="block font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                          “{beat.onScreenText}”
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
              {brief.narrative.cta ? (
                <p className="mt-3 text-sm text-muted-foreground">CTA: {brief.narrative.cta}</p>
              ) : null}
            </Section>

            <Section label={`References (${imageRefs.length} stills, ${trendRefs.length} trends)`}>
              <div className="grid gap-3 sm:grid-cols-2">
                {brief.references.map((ref) => (
                  <div
                    key={ref.type === "image" ? ref.imageKey : ref.trendKey}
                    className="rounded-xl border border-border bg-card p-3"
                  >
                    {ref.type === "image" ? (
                      <>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          image · weight {Math.round(ref.weight * 100)}%
                        </p>
                        <p className="mt-1 text-sm text-foreground">
                          {ref.ocr.headline || ref.ocr.text.slice(0, 80) || "no on-image copy"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {ref.sentiment.tone} · {ref.composition.framing} ·{" "}
                          {ref.motion.suggestedCamera}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                          {ref.platform} trend · weight {Math.round(ref.weight * 100)}%
                        </p>
                        <p className="mt-1 text-sm text-foreground">{ref.hook || ref.trendKey}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{ref.format}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Section>

            {brief.excluded.length ? (
              <Section label="Skipped">
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {brief.excluded.map((item) => (
                    <li key={item.imageKey}>
                      {item.imageKey} — {item.reason}
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button
            className="bg-foreground text-background hover:bg-foreground/90"
            disabled={rendering || loading || !brief}
            onClick={onRender}
          >
            {rendering ? "Starting render…" : "Render this brief →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-2">{children}</div>
    </section>
  );
}
