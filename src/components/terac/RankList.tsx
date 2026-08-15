import { useState } from "react";

export type RankItem = { id: string; title: string; hook: string };

/**
 * Ordering the top picks.
 *
 * Drag is the enhancement, not the mechanism: HTML5 drag does not fire on
 * touch, and this screen is mobile-first. Move up / move down buttons are the
 * real control — they work on a phone, with a keyboard, and with a screen
 * reader, and the order is announced on every change.
 */
export function RankList({
  items,
  onChange,
}: {
  items: RankItem[];
  onChange: (ordered: RankItem[]) => void;
}) {
  const [dragging, setDragging] = useState<string | null>(null);

  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    onChange(next);
  }

  function drop(targetIndex: number) {
    if (!dragging) return;
    const from = items.findIndex((i) => i.id === dragging);
    if (from === -1 || from === targetIndex) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(targetIndex, 0, moved!);
    onChange(next);
    setDragging(null);
  }

  return (
    <ol className="space-y-2" aria-label="Your ranking, best first">
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => setDragging(item.id)}
          onDragOver={(event) => event.preventDefault()}
          onDrop={() => drop(index)}
          onDragEnd={() => setDragging(null)}
          className={[
            "flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-900 p-3",
            dragging === item.id ? "opacity-50" : "",
          ].join(" ")}
        >
          <span
            aria-hidden="true"
            className="flex size-7 shrink-0 items-center justify-center rounded-md bg-neutral-800 font-mono text-[13px] text-neutral-300"
          >
            {index + 1}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-neutral-100">{item.title}</p>
            <p className="truncate text-[12px] text-neutral-400">{item.hook}</p>
          </div>

          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => move(index, -1)}
              disabled={index === 0}
              aria-label={`Move ${item.title} up to position ${index}`}
              className="size-9 rounded-md bg-neutral-800 text-neutral-200 transition-colors hover:bg-neutral-700 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(index, 1)}
              disabled={index === items.length - 1}
              aria-label={`Move ${item.title} down to position ${index + 2}`}
              className="size-9 rounded-md bg-neutral-800 text-neutral-200 transition-colors hover:bg-neutral-700 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-950"
            >
              ↓
            </button>
          </div>
        </li>
      ))}
      <li aria-live="polite" className="sr-only">
        Current order: {items.map((i, n) => `${n + 1} ${i.title}`).join(", ")}
      </li>
    </ol>
  );
}
