import { cn } from "@/lib/utils";

type Props = {
  name: string;
  logoUrl: string | null;
  className?: string;
};

export function BrandLogo({ name, logoUrl, className }: Props) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <div
      className={cn(
        "flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-secondary",
        className,
      )}
    >
      {logoUrl ? (
        <img src={logoUrl} alt={`${name} logo`} className="size-full object-cover" loading="lazy" />
      ) : (
        <span className="text-sm font-semibold tracking-wide text-muted-foreground">{initials}</span>
      )}
    </div>
  );
}
