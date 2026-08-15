/**
 * The whole Terac loop, in memory, with no database.
 *
 * Generation spec -> five judges' ballots -> tally -> synthesis ->
 * revision directives -> applied diff -> v2 spec.
 *
 * The DB round-trip is covered separately in tests/e2e; this proves the
 * decision logic between those writes is correct, which is the part that
 * actually decides what a founder is told to change.
 */
import { describe, expect, it } from "vitest";

import { applyDirectives, specFromRemix, type GenerationSpec } from "@/lib/terac/spec";
import {
  consensusThemes,
  tallySession,
  tallyVideo,
  verdictFor,
  type BallotRow,
} from "@/lib/terac/tally";
import { deterministicDirective, deterministicSummary } from "@/lib/terac/synthesis.server";
import { looksLikeToken, mintToken, judgeUrl } from "@/lib/terac/tokens";

const VIDEO_A = "aaaaaaaa-1111-4111-8111-111111111111";
const VIDEO_B = "bbbbbbbb-2222-4222-8222-222222222222";

function spec(title: string): GenerationSpec {
  return specFromRemix({
    trendKey: "VIRA-PS-001",
    platform: "tiktok",
    conceptTitle: title,
    hook: "POV: you finally stopped settling",
    script: [
      "0-2s hook: open on the frustration",
      "2-5s agitate: show the failure state",
      "5-12s reveal: product in hand",
    ].join("\n"),
    cta: "Shop the link in bio",
  });
}

/** Five judges. A is the clear winner; B is consensus-weak on hook and pacing. */
function panel(): BallotRow[] {
  const judges = ["Priya", "Marcus", "Dana", "Kofi", "Ines"];
  const rows: BallotRow[] = [];

  judges.forEach((judgeName, i) => {
    rows.push({
      sessionJudgeId: `sj-${i}`,
      judgeName,
      videoId: VIDEO_A,
      isPick: i < 4,
      rank: i < 4 ? 1 : null,
      body: i === 0 ? "The first two seconds land immediately." : "",
      dimensionScores: {
        hook_strength: "strong",
        pacing: "strong",
        product_clarity: "okay",
        visual_quality: "okay",
        cta: "okay",
        brand_fit: "strong",
      },
    });

    rows.push({
      sessionJudgeId: `sj-${i}`,
      judgeName,
      videoId: VIDEO_B,
      isPick: false,
      rank: null,
      body: i < 3 ? "I could not tell what was being sold." : "",
      dimensionScores: {
        hook_strength: "weak",
        pacing: "weak",
        product_clarity: "weak",
        visual_quality: "okay",
        cta: "okay",
        brand_fit: "okay",
      },
    });
  });

  return rows;
}

describe("tally", () => {
  it("counts picks and rank points", () => {
    const a = tallyVideo(VIDEO_A, panel());
    expect(a.picks).toBe(4);
    expect(a.rankPoints).toBe(12); // four judges at rank 1, 3 points each
    expect(a.total).toBe(16);
  });

  it("finds weak consensus only when at least half of raters agree", () => {
    const b = tallyVideo(VIDEO_B, panel());
    const hook = b.dimensions.find((d) => d.dimension === "hook_strength")!;
    expect(hook.weak).toBe(5);
    expect(hook.isConsensusWeak).toBe(true);

    const visual = b.dimensions.find((d) => d.dimension === "visual_quality")!;
    expect(visual.isConsensusWeak).toBe(false);
  });

  it("does not call a single weak rating a consensus", () => {
    const lone: BallotRow[] = [
      {
        sessionJudgeId: "sj-0",
        judgeName: "Solo",
        videoId: VIDEO_A,
        isPick: false,
        rank: null,
        body: "",
        dimensionScores: { pacing: "weak" },
      },
    ];
    const pacing = tallyVideo(VIDEO_A, lone).dimensions.find((d) => d.dimension === "pacing")!;
    expect(pacing.weak).toBe(1);
    expect(pacing.isConsensusWeak).toBe(false);
  });

  it("orders the session by total support", () => {
    const ranked = tallySession([VIDEO_B, VIDEO_A], panel());
    expect(ranked[0]!.videoId).toBe(VIDEO_A);
    expect(ranked[1]!.videoId).toBe(VIDEO_B);
  });

  it("names shared weaknesses as themes", () => {
    const themes = consensusThemes(tallySession([VIDEO_A, VIDEO_B], panel()));
    expect(themes.join(" ")).toMatch(/Hook strength/i);
    expect(themes.join(" ")).toMatch(/Pacing/i);
  });

  it("keeps the winner and revises the weak one", () => {
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    expect(verdictFor(ranked[0]!, ranked)).toBe("keep");
    expect(verdictFor(ranked[1]!, ranked)).not.toBe("keep");
  });
});

describe("deterministic synthesis", () => {
  it("summarises without an AI key", () => {
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    const titles = new Map([
      [VIDEO_A, "Concept A"],
      [VIDEO_B, "Concept B"],
    ]);
    const summary = deterministicSummary(ranked, titles);
    expect(summary).toContain("Concept A");
    expect(summary.length).toBeGreaterThan(20);
  });

  it("turns weak consensus into ops on exactly the flagged dimensions", () => {
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    const weakTally = ranked.find((t) => t.videoId === VIDEO_B)!;

    const directive = deterministicDirective(weakTally, ranked, {
      id: VIDEO_B,
      title: "Concept B",
      spec: spec("Concept B"),
    });

    const paths = directive.ops.map((op) => ("path" in op ? op.path : `insert:${op.shot.purpose}`));
    expect(paths).toContain("/pacing/cut_rate");
    expect(paths).toContain("/hook/delivery");
    expect(paths).toContain("insert:product clarity");
    // visual_quality and cta never reached weak consensus, so nothing touches them
    expect(paths.some((p) => p.includes("/cta/"))).toBe(false);
  });

  it("emits a keep for a dimension the panel praised", () => {
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    const strongTally = ranked.find((t) => t.videoId === VIDEO_A)!;
    const directive = deterministicDirective(strongTally, ranked, {
      id: VIDEO_A,
      title: "Concept A",
      spec: spec("Concept A"),
    });
    expect(directive.ops.some((op) => op.op === "keep")).toBe(true);
  });

  it("quotes real judge comments in the rationale", () => {
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    const weakTally = ranked.find((t) => t.videoId === VIDEO_B)!;
    const directive = deterministicDirective(weakTally, ranked, {
      id: VIDEO_B,
      title: "Concept B",
      spec: spec("Concept B"),
    });
    expect(directive.rationale).toContain("could not tell what was being sold");
  });
});

describe("full loop: ballots in, v2 spec out", () => {
  it("produces a v2 that is a descendant of v1, not a new video", () => {
    const v1 = spec("Concept B");
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    const weakTally = ranked.find((t) => t.videoId === VIDEO_B)!;

    const directive = deterministicDirective(weakTally, ranked, {
      id: VIDEO_B,
      title: "Concept B",
      spec: v1,
    });

    const result = applyDirectives(v1, directive);
    const v2 = result.spec;

    expect(result.changed).toBe(true);
    expect(result.rejected).toHaveLength(0);

    // Identity survives — this is what "diff, not fresh prompt" buys us.
    expect(v2.concept.trend_key).toBe(v1.concept.trend_key);
    expect(v2.concept.platform).toBe(v1.concept.platform);
    expect(v2.brand).toEqual(v1.brand);

    // The flagged weaknesses actually changed.
    expect(v2.pacing.cut_rate).not.toBe(v1.pacing.cut_rate);
    expect(v2.hook.delivery).not.toBe(v1.hook.delivery);
    expect(v2.shots.length).toBe(v1.shots.length + 1);
    expect(v2.shots.some((s) => s.purpose === "product clarity")).toBe(true);

    // Untouched material is byte-identical.
    expect(v2.hook.text).toBe(v1.hook.text);
    expect(v2.cta.text).toBe(v1.cta.text);
    expect(v2.shots[0]!.direction).toBe(v1.shots[0]!.direction);
  });

  it("a praised concept yields no mutating change", () => {
    const v1 = spec("Concept A");
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    const strongTally = ranked.find((t) => t.videoId === VIDEO_A)!;

    const directive = deterministicDirective(strongTally, ranked, {
      id: VIDEO_A,
      title: "Concept A",
      spec: v1,
    });
    const result = applyDirectives(v1, directive);

    expect(result.changed).toBe(false);
    expect(result.spec).toEqual(v1);
  });

  it("is idempotent — replaying the same directive does not compound", () => {
    const v1 = spec("Concept B");
    const ranked = tallySession([VIDEO_A, VIDEO_B], panel());
    const weakTally = ranked.find((t) => t.videoId === VIDEO_B)!;
    const directive = deterministicDirective(weakTally, ranked, {
      id: VIDEO_B,
      title: "Concept B",
      spec: v1,
    });

    const v2 = applyDirectives(v1, directive).spec;
    const second = applyDirectives(v2, directive);

    // The clarity shot cannot be inserted twice — its id already exists.
    expect(second.rejected.some((r) => /already exists/i.test(r.why))).toBe(true);
    expect(second.spec.shots.filter((s) => s.purpose === "product clarity")).toHaveLength(1);
  });
});

describe("tokens", () => {
  it("mints 32 bytes as 64 hex chars", () => {
    const token = mintToken();
    expect(token).toHaveLength(64);
    expect(looksLikeToken(token)).toBe(true);
  });

  it("does not repeat", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => mintToken()));
    expect(tokens.size).toBe(500);
  });

  it("rejects anything that is not a hex token", () => {
    expect(looksLikeToken("short")).toBe(false);
    expect(looksLikeToken("../../etc/passwd")).toBe(false);
    expect(looksLikeToken(null)).toBe(false);
  });

  it("builds the judge URL on the path, not a subdomain", () => {
    expect(judgeUrl("https://vira.com/", "abc123")).toBe("https://vira.com/terac/r/abc123");
  });
});
