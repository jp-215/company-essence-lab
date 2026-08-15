import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

type SwipeFeedProps = {
  count: number;
  renderItem: (index: number, active: boolean) => ReactNode;
  onActiveChange?: (index: number) => void;
  endSlide?: ReactNode;
};

/**
 * Full-screen vertical scroll-snap feed. Only the card in view is marked
 * active, so embeds mount/unmount as the user swipes.
 */
export function SwipeFeed({ count, renderItem, onActiveChange, endSlide }: SwipeFeedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const total = count + (endSlide ? 1 : 0);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = Number((visible.target as HTMLElement).dataset["index"]);
        if (!Number.isNaN(index)) {
          setActive(index);
          onActiveChange?.(index);
        }
      },
      { root, threshold: [0.55] },
    );
    root.querySelectorAll("[data-index]").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [total, onActiveChange]);

  const scrollTo = useCallback((index: number) => {
    const root = containerRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`[data-index="${index}"]`);
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (["ArrowDown", "ArrowUp", " ", "PageDown", "PageUp"].includes(event.key)) {
        event.preventDefault();
        const delta = event.key === "ArrowUp" || event.key === "PageUp" ? -1 : 1;
        scrollTo(Math.min(Math.max(active + delta, 0), total - 1));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, total, scrollTo]);

  return (
    <div className="relative">
      <div
        ref={containerRef}
        className="h-[calc(100vh-1px)] snap-y snap-mandatory overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {Array.from({ length: count }, (_, index) => (
          <section
            key={index}
            data-index={index}
            className="flex h-full snap-start items-center justify-center"
          >
            {renderItem(index, active === index)}
          </section>
        ))}
        {endSlide ? (
          <section
            data-index={count}
            className="flex h-full snap-start items-center justify-center"
          >
            {endSlide}
          </section>
        ) : null}
      </div>

      <div className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 flex-col gap-1.5 sm:flex">
        {Array.from({ length: Math.min(total, 12) }, (_, index) => (
          <span
            key={index}
            className={cn(
              "size-1.5 rounded-full bg-foreground/20 transition-all",
              index === Math.min(active, 11) && "h-4 bg-foreground",
            )}
          />
        ))}
      </div>

      <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
        {active + 1} / {total} · swipe up for next
      </p>
    </div>
  );
}
