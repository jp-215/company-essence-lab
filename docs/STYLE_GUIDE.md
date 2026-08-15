# Vira Style Guide

The visual language established in the brand onboarding flow (`/studio/new`) and the
Remix Studio (`/remix`) is the system for the whole product. Everything below is
already encoded in design tokens (`src/styles.css`) and shared primitives
(`src/components/Page.tsx`).

## Colors (semantic tokens only)

| Token | Use |
| --- | --- |
| `background` | warm cream page canvas |
| `card` | near-white panels, cards, inputs, pills |
| `secondary` | tinted fills: media wells, code blocks, quiet chips |
| `foreground` | deep navy ink; also the primary button/pill fill |
| `background` on `foreground` | inverted text inside selected pills and CTAs |
| `muted-foreground` | secondary copy, mono labels |
| `border` | 1px hairlines, dividers, dashed dropzones |
| `accent` / `chart-1` | warm highlight for selected onboarding cards |

Never write literal colors (`text-white`, `bg-[#...]`). Dark mode comes free through
the tokens.

## Type

- Headings: **Fraunces** (`font-serif`), bold, tight tracking.
  - Page title: `font-serif text-5xl font-bold tracking-tight` (hero: `sm:text-6xl`, `leading-[1.05]`)
  - Section title: `font-serif text-3xl font-bold tracking-tight`
- Body: **DM Sans** (`font-sans`). Lead paragraph `text-lg leading-relaxed text-muted-foreground`.
- Labels / metadata / IDs: mono, uppercase, wide tracking —
  `font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground`.

## Shapes and spacing

- Cards and panels: `rounded-2xl border border-border bg-card`.
- Pills, chips, filters, inputs: fully rounded (`rounded-full`), generous padding
  (`px-6 py-3` for pills, `h-12`–`h-14` for inputs).
- Buttons: `rounded-xl`, solid `bg-foreground text-background` for primary actions.
- Page rhythm: `max-w-6xl px-6 py-16`, sections separated by `mt-12`–`mt-16`,
  hairline `border-y border-border` for filter bars.
- Selected state = inverted fill (`bg-foreground text-background`), never a colored ring.

## Composition patterns

1. **Eyebrow** — mono label, optional rule and live dot, above every page title.
2. **Hero split** — large serif headline + lead copy on the left, a stat panel or
   summary card on the right (`lg:grid-cols-[1.1fr_0.9fr]`).
3. **Stat panel** — `grid-cols-3 divide-x divide-border rounded-2xl border bg-card`,
   serif number over a mono caption.
4. **Filter bar** — pill group on the left, search + sort on the right, wrapped in
   `border-y border-border py-6`.
5. **Content cards** — tall cards: media/label area on `bg-secondary`, then a
   bordered body with title, chips, metrics, and a right-aligned primary action.

## Shared primitives

Use these instead of re-inventing markup: `PageShell`, `Eyebrow`, `PageTitle`,
`Lead`, `SectionTitle`, `Panel`, `Stat`, `Pill`, `MetaLabel`.
