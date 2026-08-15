/**
 * Every ranking knob in one place. The SQL layer (recommend_company_trends_v2)
 * blends similarity/virality percentiles (0.6/0.4) and performs the seeded
 * weighted draw; these weights govern the TS-side community blend and the
 * exploration/diversity pass. Safe to import from client code.
 */
export const RANK_WEIGHTS = {
  /** Share of the final base score contributed by the collaborative signal. */
  cf: 0.25,
  /** Base score for community-only items (surfaced purely by peer activity). */
  communityBase: 0.6,
  /** Pseudo-score for category-fallback rows (no embedding available). */
  categoryFloor: 0.35,
  /** Seeded-noise share inside diversify(). */
  exploration: 0.3,
  /** Multiplier applied to items shown on this surface in the last 24h. */
  seenDemote: 0.35,
} as const;

/** Human-readable blend summary for UI stat labels (kept next to the weights so copy can't drift). */
export const RANK_BLEND_LABEL = "60/40 fit·heat + 25% community · 30% explore";
