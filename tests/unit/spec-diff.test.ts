/**
 * The drift guard, tested directly.
 *
 * This is the piece the whole regeneration loop rests on: if a directive can
 * reach a path it shouldn't, or silently no-op, or mutate the spec it was given,
 * then v2 stops being a descendant of v1 and the review was pointless.
 */
import { describe, expect, it } from "vitest";

import {
  applyDirectives,
  describeDirective,
  generationSpecSchema,
  parseBeats,
  revisionDirectiveSchema,
  specFromRemix,
  type GenerationSpec,
  type RevisionDirective,
} from "@/lib/terac/spec";

const VIDEO_ID = "11111111-1111-4111-8111-111111111111";

function baseSpec(): GenerationSpec {
  return specFromRemix({
    trendKey: "VIRA-PS-001",
    platform: "tiktok",
    format: "ugc_testimonial",
    angle: "Pain-first hook",
    conceptTitle: "Pain-first hook — ugc testimonial",
    hook: "POV: you finally stopped settling",
    script: [
      "0-2s hook: open on the frustration",
      "2-5s agitate: show the failure state",
      "5-12s reveal: product in hand",
      "12-20s proof: side-by-side comparison",
    ].join("\n"),
    cta: "Shop the link in bio",
    mustInclude: ["Overcast"],
    mustAvoid: ["medical claims"],
  });
}

function directive(ops: RevisionDirective["ops"]): RevisionDirective {
  return revisionDirectiveSchema.parse({
    spec_version: 1,
    video_id: VIDEO_ID,
    verdict: "revise",
    rationale: "test",
    ops,
  });
}

describe("specFromRemix / parseBeats", () => {
  it("parses Vira's timestamped beats into ordered shots", () => {
    const spec = baseSpec();
    expect(spec.shots).toHaveLength(4);
    expect(spec.shots[0]).toMatchObject({ id: "s1", start_s: 0, end_s: 2, purpose: "hook" });
    expect(spec.shots[3]).toMatchObject({ id: "s4", start_s: 12, end_s: 20, purpose: "proof" });
    expect(spec.pacing.total_seconds).toBe(20);
  });

  it("keeps untimed lines rather than dropping them", () => {
    const shots = parseBeats("0-2s hook: something\nan untimed director note");
    expect(shots).toHaveLength(2);
    expect(shots[1]!.direction).toBe("an untimed director note");
  });

  it("produces a spec that validates", () => {
    expect(generationSpecSchema.safeParse(baseSpec()).success).toBe(true);
  });
});

describe("applyDirectives — the happy path", () => {
  it("replaces a scalar and reports the change", () => {
    const spec = baseSpec();
    const result = applyDirectives(
      spec,
      directive([{ op: "replace", path: "/hook/text", value: "New hook line", reason: "weak" }]),
    );

    expect(result.changed).toBe(true);
    expect(result.spec.hook.text).toBe("New hook line");
    expect(result.rejected).toHaveLength(0);
  });

  it("never mutates the spec it was given", () => {
    const spec = baseSpec();
    const before = JSON.stringify(spec);
    applyDirectives(
      spec,
      directive([{ op: "replace", path: "/hook/text", value: "mutated?", reason: "" }]),
    );
    expect(JSON.stringify(spec)).toBe(before);
  });

  it("adjusts an enum field only to a legal value", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([
        { op: "adjust", path: "/pacing/cut_rate", from: "medium", to: "fast", reason: "" },
      ]),
    );
    expect(result.spec.pacing.cut_rate).toBe("fast");
  });

  it("edits a field on an existing shot", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([
        { op: "replace", path: "/shots/s2/direction", value: "Hold the shot longer", reason: "" },
      ]),
    );
    expect(result.spec.shots[1]!.direction).toBe("Hold the shot longer");
    expect(result.spec.shots).toHaveLength(4);
  });

  it("removes a whole shot", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([{ op: "remove", path: "/shots/s3", reason: "redundant" }]),
    );
    expect(result.spec.shots.map((s) => s.id)).toEqual(["s1", "s2", "s4"]);
  });

  it("inserts a shot after a named anchor", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([
        {
          op: "insert_shot",
          after: "s1",
          reason: "clarity",
          shot: {
            id: "clarity-1",
            start_s: 2,
            end_s: 4,
            purpose: "product clarity",
            direction: "Clean product shot",
            vo: "",
            on_screen_text: "",
            b_roll: "",
          },
        },
      ]),
    );
    expect(result.spec.shots.map((s) => s.id)).toEqual(["s1", "clarity-1", "s2", "s3", "s4"]);
  });

  it("treats a keep-only directive as no change", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([{ op: "keep", path: "/hook/text", reason: "strong" }]),
    );
    expect(result.changed).toBe(false);
    expect(result.applied).toHaveLength(1);
  });
});

describe("applyDirectives — the guard rails", () => {
  it("refuses locked brand guardrails", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([{ op: "replace", path: "/brand/must_avoid", value: "anything", reason: "" }]),
    );
    expect(result.changed).toBe(false);
    expect(result.rejected[0]!.why).toMatch(/locked/i);
    expect(result.spec.brand.must_avoid).toEqual(["medical claims"]);
  });

  it("refuses to repoint the trend the concept came from", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([{ op: "replace", path: "/concept/trend_key", value: "VIRA-PS-099", reason: "" }]),
    );
    expect(result.rejected[0]!.why).toMatch(/locked/i);
    expect(result.spec.concept.trend_key).toBe("VIRA-PS-001");
  });

  it("refuses a path that is not in the whitelist", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([{ op: "replace", path: "/style/lighting", value: "golden hour", reason: "" }]),
    );
    expect(result.rejected[0]!.why).toMatch(/not a revisable path/i);
  });

  it("refuses to touch a shot that does not exist", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([{ op: "replace", path: "/shots/s99/direction", value: "x", reason: "" }]),
    );
    expect(result.rejected[0]!.why).toMatch(/not in this spec/i);
  });

  it("refuses an illegal enum value instead of writing it", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([{ op: "adjust", path: "/pacing/cut_rate", to: "frenetic", reason: "" }]),
    );
    expect(result.changed).toBe(false);
    expect(result.rejected[0]!.why).toMatch(/not valid/i);
    expect(result.spec.pacing.cut_rate).toBe("medium");
  });

  it("refuses an insert whose anchor is missing", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([
        {
          op: "insert_shot",
          after: "nope",
          reason: "",
          shot: {
            id: "x1",
            start_s: 1,
            end_s: 2,
            purpose: "",
            direction: "d",
            vo: "",
            on_screen_text: "",
            b_roll: "",
          },
        },
      ]),
    );
    expect(result.rejected[0]!.why).toMatch(/anchor/i);
  });

  it("refuses a duplicate shot id", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([
        {
          op: "insert_shot",
          after: "s1",
          reason: "",
          shot: {
            id: "s2",
            start_s: 1,
            end_s: 2,
            purpose: "",
            direction: "d",
            vo: "",
            on_screen_text: "",
            b_roll: "",
          },
        },
      ]),
    );
    expect(result.rejected[0]!.why).toMatch(/already exists/i);
  });

  it("applies the good ops in a directive that also contains a bad one", () => {
    const result = applyDirectives(
      baseSpec(),
      directive([
        { op: "replace", path: "/hook/text", value: "Good change", reason: "" },
        { op: "replace", path: "/brand/must_include", value: "Bad change", reason: "" },
      ]),
    );
    expect(result.spec.hook.text).toBe("Good change");
    expect(result.rejected).toHaveLength(1);
    expect(result.changed).toBe(true);
  });
});

describe("revisionDirectiveSchema", () => {
  it("rejects an op verb that is not in the union", () => {
    const parsed = revisionDirectiveSchema.safeParse({
      video_id: VIDEO_ID,
      verdict: "revise",
      ops: [{ op: "rewrite_everything", path: "/hook/text", value: "x" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-uuid video id", () => {
    expect(
      revisionDirectiveSchema.safeParse({ video_id: "not-a-uuid", verdict: "keep", ops: [] })
        .success,
    ).toBe(false);
  });
});

describe("describeDirective", () => {
  it("renders ops as plain English for the approval step", () => {
    const lines = describeDirective(
      directive([
        { op: "replace", path: "/hook/text", value: "New line", reason: "judges flagged 0-2s" },
        { op: "adjust", path: "/pacing/cut_rate", from: "medium", to: "fast", reason: "too slow" },
      ]),
    );
    expect(lines[0]).toContain("Replace hook text");
    expect(lines[0]).toContain("judges flagged 0-2s");
    expect(lines[1]).toContain("medium");
    expect(lines[1]).toContain("fast");
  });
});
