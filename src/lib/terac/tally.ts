/**
 * Terac — vote and dimension aggregation.
 *
 * Pure. Drives both the founder-facing results screen and the deterministic
 * synthesis fallback, so the numbers on screen and the numbers the revision
 * directives were derived from can never disagree.
 */
import { DIMENSIONS, DIMENSION_LABELS, type Dimension, type DimensionScores } from "./spec";

export type BallotRow = {
  sessionJudgeId: string;
  judgeName: string;
  videoId: string;
  isPick: boolean;
  rank: number | null;
  body: string;
  dimensionScores: DimensionScores;
};

export type DimensionTally = {
  dimension: Dimension;
  label: string;
  weak: number;
  okay: number;
  strong: number;
  rated: number;
  /** -1 (unanimously weak) .. +1 (unanimously strong). 0 when unrated. */
  score: number;
  isConsensusWeak: boolean;
};

export type VideoTally = {
  videoId: string;
  picks: number;
  rankPoints: number;
  /** picks + rank points; the ordering used on the results screen. */
  total: number;
  comments: { judgeName: string; body: string }[];
  dimensions: DimensionTally[];
  weakest: DimensionTally | null;
};

/** Rank 1 is worth 3, rank 2 worth 2, rank 3 worth 1, deeper ranks worth 0. */
export const RANK_POINTS = [3, 2, 1] as const;

/** A dimension counts as consensus-weak at >=50% weak, with at least 2 raters. */
export const CONSENSUS_WEAK_RATIO = 0.5;
export const CONSENSUS_MIN_RATERS = 2;

export function tallyVideo(videoId: string, ballots: BallotRow[]): VideoTally {
  const rows = ballots.filter((b) => b.videoId === videoId);

  const picks = rows.filter((r) => r.isPick).length;
  const rankPoints = rows.reduce((sum, r) => {
    if (r.rank === null || r.rank < 1) return sum;
    return sum + (RANK_POINTS[r.rank - 1] ?? 0);
  }, 0);

  const dimensions: DimensionTally[] = DIMENSIONS.map((dimension) => {
    let weak = 0;
    let okay = 0;
    let strong = 0;
    for (const row of rows) {
      const value = row.dimensionScores[dimension];
      if (value === "weak") weak += 1;
      else if (value === "okay") okay += 1;
      else if (value === "strong") strong += 1;
    }
    const rated = weak + okay + strong;
    const score = rated === 0 ? 0 : (strong - weak) / rated;
    return {
      dimension,
      label: DIMENSION_LABELS[dimension],
      weak,
      okay,
      strong,
      rated,
      score,
      isConsensusWeak: rated >= CONSENSUS_MIN_RATERS && weak / rated >= CONSENSUS_WEAK_RATIO,
    };
  });

  const rankedWeak = dimensions.filter((d) => d.rated > 0).sort((a, b) => a.score - b.score);

  return {
    videoId,
    picks,
    rankPoints,
    total: picks + rankPoints,
    comments: rows
      .filter((r) => r.body.trim().length > 0)
      .map((r) => ({ judgeName: r.judgeName, body: r.body.trim() })),
    dimensions,
    weakest: rankedWeak[0] ?? null,
  };
}

export function tallySession(videoIds: string[], ballots: BallotRow[]): VideoTally[] {
  return videoIds
    .map((id) => tallyVideo(id, ballots))
    .sort((a, b) => b.total - a.total || a.videoId.localeCompare(b.videoId));
}

/**
 * Themes the panel agreed on, worded for a founder rather than a dashboard.
 * Derived from dimension consensus across the whole session, not per video, so
 * "the hooks are weak across the board" surfaces as one theme rather than five.
 */
export function consensusThemes(tallies: VideoTally[]): string[] {
  const themes: string[] = [];
  const videoCount = tallies.length || 1;

  for (const dimension of DIMENSIONS) {
    const weakVideos = tallies.filter((t) =>
      t.dimensions.some((d) => d.dimension === dimension && d.isConsensusWeak),
    );
    if (weakVideos.length === 0) continue;

    const label = DIMENSION_LABELS[dimension];
    if (weakVideos.length >= Math.ceil(videoCount / 2)) {
      themes.push(
        `${label} is the panel's shared concern across ${weakVideos.length} of ${videoCount} ads`,
      );
    } else {
      themes.push(`${label} flagged weak on ${weakVideos.length} of ${videoCount} ads`);
    }
  }

  const strongDims = DIMENSIONS.filter((dimension) =>
    tallies.every((t) => {
      const d = t.dimensions.find((x) => x.dimension === dimension);
      return d && d.rated > 0 && d.score > 0.5;
    }),
  );
  for (const dimension of strongDims) {
    themes.push(`${DIMENSION_LABELS[dimension]} is landing consistently — keep it`);
  }

  return themes.slice(0, 8);
}

/** `verdict` follows the panel: clear winner keeps, consensus-weak revises. */
export function verdictFor(tally: VideoTally, all: VideoTally[]): "keep" | "revise" | "cut" {
  const best = all[0]?.total ?? 0;
  const hasWeakConsensus = tally.dimensions.some((d) => d.isConsensusWeak);

  if (tally.total === 0 && hasWeakConsensus && all.length > 1) return "cut";
  if (tally.total >= best && best > 0 && !hasWeakConsensus) return "keep";
  return "revise";
}
