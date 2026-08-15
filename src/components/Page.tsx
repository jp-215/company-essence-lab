import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared layout primitives for the Vira style guide (docs/STYLE_GUIDE.md).
 * Every page composes these so the onboarding/Remix Studio language is site-wide.
 */

export function PageShell({
  children,
  className,
  width = "wide",
}: {
  children: ReactNode;
  className?: string;
  width?: "wide" | "narrow" | "form";
}) {
  return (
    <div className="bg-background">
      <div
        className={cn(
          "mx-auto w-full px-6 py-16",
          width === "wide" && "max-w-6xl",
          width === "narrow" && "max-w-4xl",
          width === "form" && "max-w-md",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function Eyebrow({
  children,
  live = false,
  className,
}: {
  children: ReactNode;
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 font-mono text-xs uppercase tracking-[0.28em] text-muted-foreground",
        className,
      )}
    >
      <span>{children}</span>
      {live ? (
        <>
          <span className="h-px w-10 bg-border" />
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-foreground" />
            Live feed
          </span>
        </>
      ) : null}
    </div>
  );
}

export function PageTitle({
  children,
  className,
  hero = false,
}: {
  children: ReactNode;
  className?: string;
  hero?: boolean;
}) {
  return (
    <h1
      className={cn(
        "font-serif font-bold tracking-tight text-foreground",
        hero ? "text-5xl leading-[1.05] sm:text-6xl" : "text-4xl leading-tight sm:text-5xl",
        className,
      )}
    >
      {children}
    </h1>
  );
}

export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("max-w-xl text-lg leading-relaxed text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("font-serif text-3xl font-bold tracking-tight text-foreground", className)}>
      {children}
    </h2>
  );
}

export function MetaLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-border bg-card", className)}>{children}</div>
  );
}

export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "grid divide-x divide-border rounded-2xl border border-border bg-card",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-6 py-6">
      <p className="font-serif text-4xl font-bold tracking-tight text-foreground">{value}</p>
      <p className="mt-2 font-mono text-[10px] uppercase leading-relaxed tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

export function Pill({
  children,
  active = false,
  count,
  onClick,
  className,
}: {
  children: ReactNode;
  active?: boolean;
  count?: number;
  onClick?: () => void;
  className?: string;
}) {
  const shape =
    "inline-flex items-center gap-2 rounded-full px-6 py-3 text-base font-medium transition-colors";
  const skin = active
    ? "bg-foreground text-background"
    : "border border-border bg-card text-foreground hover:border-ring";

  if (!onClick) {
    return <span className={cn(shape, skin, className)}>{children}</span>;
  }

  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={cn(shape, skin, className)}>
      {children}
      {typeof count === "number" ? (
        <span className={cn("font-mono text-xs", active ? "opacity-70" : "text-muted-foreground")}>
          {count}
        </span>
      ) : null}
    </button>
  );
}
