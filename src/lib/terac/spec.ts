/**
 * Terac — generation_spec and revision_directives.
 *
 * This module is the drift guard. Regeneration never re-prompts from scratch:
 * the synthesis pass emits a DIFF against the spec that produced a video, and
 * `applyDirectives` replays that diff onto the original spec. The original spec
 * stays the source of truth, so v2 is provably a descendant of v1 rather than
 * an unrelated video that happens to share a brief.
 *
 * Pure — no I/O, no server imports. Imported by both the server layer and the
 * test suite.
 */
import { z } from "zod";

export const DIMENSIONS = [
  "hook_strength",
  "pacing",
  "product_clarity",
  "visual_quality",
  "cta",
  "brand_fit",
] as const;

export type Dimension = (typeof DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<Dimension, string> = {
  hook_strength: "Hook strength",
  pacing: "Pacing",
  product_clarity: "Product clarity",
  visual_quality: "Visual quality",
  cta: "CTA",
  brand_fit: "Brand fit",
};

export const RATINGS = ["weak", "okay", "strong"] as const;
export type Rating = (typeof RATINGS)[number];

export const dimensionScoresSchema = z.record(z.enum(DIMENSIONS), z.enum(RATINGS));
export type DimensionScores = Partial<Record<Dimension, Rating>>;

// ---------------------------------------------------------------------------
// generation_spec
// ---------------------------------------------------------------------------

export const shotSchema = z.object({
  id: z.string().min(1).max(24),
  start_s: z.number().min(0).max(120),
  end_s: z.number().min(0).max(120),
  purpose: z.string().max(120).default(""),
  direction: z.string().max(600).default(""),
  vo: z.string().max(600).default(""),
  on_screen_text: z.string().max(200).default(""),
  b_roll: z.string().max(300).default(""),
});
export type Shot = z.infer<typeof shotSchema>;

export const generationSpecSchema = z.object({
  spec_version: z.literal(1).default(1),
  concept: z.object({
    title: z.string().max(160).default(""),
    angle: z.string().max(200).default(""),
    platform: z.string().max(40).default(""),
    format: z.string().max(40).default(""),
    trend_key: z.string().max(40).default(""),
  }),
  hook: z.object({
    text: z.string().max(300).default(""),
    delivery: z.string().max(200).default(""),
    on_screen_text: z.string().max(200).default(""),
  }),
  shots: z.array(shotSchema).max(24).default([]),
  pacing: z.object({
    total_seconds: z.number().min(5).max(120).default(30),
    cut_rate: z.enum(["slow", "medium", "fast"]).default("medium"),
    energy: z.enum(["calm", "steady", "high"]).default("steady"),
  }),
  style: z.object({
    tone: z.string().max(120).default(""),
    palette: z.string().max(120).default(""),
    typography: z.string().max(120).default(""),
    music: z.string().max(120).default(""),
  }),
  cta: z.object({
    text: z.string().max(200).default(""),
    placement: z.string().max(80).default("end"),
  }),
  // Locked. Judges review creative; they do not get to move brand guardrails.
  brand: z.object({
    must_include: z.array(z.string().max(120)).max(12).default([]),
    must_avoid: z.array(z.string().max(120)).max(12).default([]),
  }),
});
export type GenerationSpec = z.infer<typeof generationSpecSchema>;

// ---------------------------------------------------------------------------
// revision_directives
//
// Every op names a path. Paths are validated against a whitelist AND against
// the spec being revised, so the model cannot invent structure, rename fields,
// or touch brand guardrails. An op naming an unknown path is rejected and
// surfaced — never silently dropped.
// ---------------------------------------------------------------------------

/** Scalar paths a directive may target, as literal strings. */
const SCALAR_PATHS = new Set<string>([
  "/concept/title",
  "/concept/angle",
  "/hook/text",
  "/hook/delivery",
  "/hook/on_screen_text",
  "/pacing/total_seconds",
  "/pacing/cut_rate",
  "/pacing/energy",
  "/style/tone",
  "/style/palette",
  "/style/typography",
  "/style/music",
  "/cta/text",
  "/cta/placement",
]);

/** Per-shot fields a directive may target, as `/shots/{id}/{field}`. */
const SHOT_FIELDS = new Set<string>([
  "purpose",
  "direction",
  "vo",
  "on_screen_text",
  "b_roll",
  "start_s",
  "end_s",
]);

/**
 * Paths that are never writable, listed explicitly so the rejection message can
 * say *why* rather than just "unknown path".
 */
const LOCKED_PREFIXES = [
  "/spec_version",
  "/brand",
  "/concept/trend_key",
  "/concept/platform",
  "/concept/format",
];

export const MAX_SHOTS = 24;

export const directiveOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("replace"),
    path: z.string().min(2).max(80),
    value: z.union([z.string(), z.number()]),
    reason: z.string().max(400).default(""),
  }),
  z.object({
    op: z.literal("adjust"),
    path: z.string().min(2).max(80),
    from: z.union([z.string(), z.number()]).optional(),
    to: z.union([z.string(), z.number()]),
    reason: z.string().max(400).default(""),
  }),
  z.object({
    op: z.literal("remove"),
    path: z.string().min(2).max(80),
    reason: z.string().max(400).default(""),
  }),
  z.object({
    op: z.literal("keep"),
    path: z.string().min(2).max(80),
    reason: z.string().max(400).default(""),
  }),
  z.object({
    op: z.literal("insert_shot"),
    after: z.string().min(1).max(24).nullable().default(null),
    shot: shotSchema,
    reason: z.string().max(400).default(""),
  }),
]);
export type DirectiveOp = z.infer<typeof directiveOpSchema>;

export const revisionDirectiveSchema = z.object({
  spec_version: z.literal(1).default(1),
  video_id: z.string().uuid(),
  verdict: z.enum(["keep", "revise", "cut"]),
  rationale: z.string().max(1200).default(""),
  ops: z.array(directiveOpSchema).max(40).default([]),
});
export type RevisionDirective = z.infer<typeof revisionDirectiveSchema>;

export const revisionDirectivesSchema = z.array(revisionDirectiveSchema).max(24);

// ---------------------------------------------------------------------------
// Diff application
// ---------------------------------------------------------------------------

export type RejectedOp = { op: DirectiveOp; why: string };

export type ApplyResult = {
  spec: GenerationSpec;
  applied: DirectiveOp[];
  rejected: RejectedOp[];
  changed: boolean;
};

function isLocked(path: string): boolean {
  return LOCKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Parses `/shots/{id}` and `/shots/{id}/{field}`. */
function parseShotPath(path: string): { shotId: string; field: string | null } | null {
  const parts = path.split("/");
  // ["", "shots", id] or ["", "shots", id, field]
  if (parts.length < 3 || parts[1] !== "shots") return null;
  const shotId = parts[2] ?? "";
  if (!shotId) return null;
  if (parts.length === 3) return { shotId, field: null };
  if (parts.length === 4) return { shotId, field: parts[3] ?? "" };
  return null;
}

function coerceForPath(path: string, value: string | number): string | number | null {
  const numeric =
    path === "/pacing/total_seconds" || path.endsWith("/start_s") || path.endsWith("/end_s");
  if (numeric) {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (path === "/pacing/cut_rate") {
    return (["slow", "medium", "fast"] as string[]).includes(String(value)) ? String(value) : null;
  }
  if (path === "/pacing/energy") {
    return (["calm", "steady", "high"] as string[]).includes(String(value)) ? String(value) : null;
  }
  return String(value);
}

function setScalar(spec: GenerationSpec, path: string, value: string | number): void {
  const [, head, tail] = path.split("/") as [string, keyof GenerationSpec, string];
  const node = spec[head] as unknown as Record<string, unknown>;
  node[tail] = value;
}

/**
 * Replays a directive onto a spec. Returns a new spec — the input is never
 * mutated, so the original stays available for the version tree.
 *
 * Rejections are returned, not thrown: a directive with one bad op should still
 * apply its good ops, and the founder should see exactly what was dropped.
 */
export function applyDirectives(
  original: GenerationSpec,
  directive: RevisionDirective,
): ApplyResult {
  const spec: GenerationSpec = structuredClone(original);
  const applied: DirectiveOp[] = [];
  const rejected: RejectedOp[] = [];

  for (const op of directive.ops) {
    if (op.op === "keep") {
      // A no-op by construction. Recorded because it is meaningful provenance:
      // it says the judges explicitly endorsed this element.
      applied.push(op);
      continue;
    }

    if (op.op === "insert_shot") {
      if (spec.shots.length >= MAX_SHOTS) {
        rejected.push({ op, why: `Shot limit (${MAX_SHOTS}) reached` });
        continue;
      }
      if (spec.shots.some((s) => s.id === op.shot.id)) {
        rejected.push({ op, why: `Shot id "${op.shot.id}" already exists` });
        continue;
      }
      const parsedShot = shotSchema.safeParse(op.shot);
      if (!parsedShot.success) {
        rejected.push({ op, why: "New shot failed validation" });
        continue;
      }
      if (op.after === null) {
        spec.shots.unshift(parsedShot.data);
      } else {
        const idx = spec.shots.findIndex((s) => s.id === op.after);
        if (idx === -1) {
          rejected.push({ op, why: `Anchor shot "${op.after}" not found` });
          continue;
        }
        spec.shots.splice(idx + 1, 0, parsedShot.data);
      }
      applied.push(op);
      continue;
    }

    const path = op.path;

    if (isLocked(path)) {
      rejected.push({ op, why: `"${path}" is locked and cannot be revised` });
      continue;
    }

    const shotPath = parseShotPath(path);

    if (shotPath) {
      const idx = spec.shots.findIndex((s) => s.id === shotPath.shotId);
      if (idx === -1) {
        rejected.push({ op, why: `Shot "${shotPath.shotId}" is not in this spec` });
        continue;
      }

      if (shotPath.field === null) {
        if (op.op !== "remove") {
          rejected.push({ op, why: "A whole shot can only be removed or kept" });
          continue;
        }
        spec.shots.splice(idx, 1);
        applied.push(op);
        continue;
      }

      if (!SHOT_FIELDS.has(shotPath.field)) {
        rejected.push({ op, why: `Unknown shot field "${shotPath.field}"` });
        continue;
      }
      if (op.op === "remove") {
        rejected.push({ op, why: "Shot fields cannot be removed, only replaced" });
        continue;
      }

      const raw = op.op === "replace" ? op.value : op.to;
      const coerced = coerceForPath(path, raw);
      if (coerced === null) {
        rejected.push({ op, why: `Value ${JSON.stringify(raw)} is not valid for "${path}"` });
        continue;
      }
      (spec.shots[idx] as unknown as Record<string, unknown>)[shotPath.field] = coerced;
      applied.push(op);
      continue;
    }

    if (!SCALAR_PATHS.has(path)) {
      rejected.push({ op, why: `"${path}" is not a revisable path` });
      continue;
    }
    if (op.op === "remove") {
      rejected.push({ op, why: `"${path}" cannot be removed, only replaced` });
      continue;
    }

    const raw = op.op === "replace" ? op.value : op.to;
    const coerced = coerceForPath(path, raw);
    if (coerced === null) {
      rejected.push({ op, why: `Value ${JSON.stringify(raw)} is not valid for "${path}"` });
      continue;
    }
    setScalar(spec, path, coerced);
    applied.push(op);
  }

  // Re-validate the whole result. If the diff produced something structurally
  // invalid, fall back to the original rather than persist a broken spec.
  const validated = generationSpecSchema.safeParse(spec);
  if (!validated.success) {
    return {
      spec: original,
      applied: [],
      rejected: directive.ops.map((op) => ({ op, why: "Resulting spec failed validation" })),
      changed: false,
    };
  }

  const mutating = applied.filter((op) => op.op !== "keep");
  return {
    spec: validated.data,
    applied,
    rejected,
    changed: mutating.length > 0,
  };
}

/**
 * Plain-English rendering of a directive, shown to the founder for approval
 * BEFORE any compute is spent. This is the click that prevents drift.
 */
export function describeDirective(directive: RevisionDirective): string[] {
  const lines: string[] = [];
  for (const op of directive.ops) {
    switch (op.op) {
      case "replace":
        lines.push(
          `Replace ${humanPath(op.path)} with “${String(op.value)}”${reasonSuffix(op.reason)}`,
        );
        break;
      case "adjust":
        lines.push(
          `Adjust ${humanPath(op.path)}${op.from !== undefined ? ` from ${String(op.from)}` : ""} to ${String(op.to)}${reasonSuffix(op.reason)}`,
        );
        break;
      case "remove":
        lines.push(`Remove ${humanPath(op.path)}${reasonSuffix(op.reason)}`);
        break;
      case "keep":
        lines.push(`Keep ${humanPath(op.path)} as is${reasonSuffix(op.reason)}`);
        break;
      case "insert_shot":
        lines.push(
          `Add a new shot “${op.shot.id}”${op.after ? ` after ${op.after}` : " at the top"}: ${op.shot.direction || op.shot.purpose}${reasonSuffix(op.reason)}`,
        );
        break;
    }
  }
  return lines;
}

function reasonSuffix(reason: string): string {
  return reason ? ` — ${reason}` : "";
}

function humanPath(path: string): string {
  const shot = parseShotPath(path);
  if (shot) {
    return shot.field
      ? `shot ${shot.shotId} ${shot.field.replace(/_/g, " ")}`
      : `shot ${shot.shotId}`;
  }
  return path.replace(/^\//, "").replace(/\//g, " ").replace(/_/g, " ");
}

/**
 * Builds a starting spec from a Vira text remix. Vira has no shot list today,
 * so the timestamped beats in `script` are parsed into shots — this is the
 * seam where a real generation pipeline would supply the spec directly.
 */
export function specFromRemix(input: {
  trendKey: string;
  platform: string;
  format?: string;
  angle?: string;
  conceptTitle: string;
  hook: string;
  script: string;
  cta?: string;
  mustInclude?: string[];
  mustAvoid?: string[];
}): GenerationSpec {
  const shots = parseBeats(input.script);
  const total = shots.length ? Math.max(...shots.map((s) => s.end_s)) : 30;

  return generationSpecSchema.parse({
    spec_version: 1,
    concept: {
      title: input.conceptTitle,
      angle: input.angle ?? "",
      platform: input.platform,
      format: input.format ?? "",
      trend_key: input.trendKey,
    },
    hook: { text: input.hook, delivery: "", on_screen_text: input.hook.slice(0, 60) },
    shots,
    pacing: {
      total_seconds: Math.min(Math.max(total || 30, 5), 120),
      cut_rate: "medium",
      energy: "steady",
    },
    style: { tone: "", palette: "", typography: "", music: "" },
    cta: { text: input.cta ?? "", placement: "end" },
    brand: { must_include: input.mustInclude ?? [], must_avoid: input.mustAvoid ?? [] },
  });
}

/**
 * Parses Vira's beat format — `"0-2s hook: ..."`, `"12-20s proof: ..."` — into
 * shots. Lines that do not carry a timestamp become shots appended after the
 * last timed beat, so nothing in the script is silently lost.
 */
export function parseBeats(script: string): Shot[] {
  const lines = script
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const shots: Shot[] = [];
  let cursor = 0;

  lines.forEach((line, i) => {
    const match = /^(\d+)\s*-\s*(\d+)\s*s\s*([^:]*):\s*(.*)$/i.exec(line);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      cursor = Math.max(cursor, end);
      shots.push(
        shotSchema.parse({
          id: `s${shots.length + 1}`,
          start_s: Math.min(start, 120),
          end_s: Math.min(Math.max(end, start), 120),
          purpose: (match[3] ?? "").trim().slice(0, 120),
          direction: (match[4] ?? "").trim().slice(0, 600),
          vo: "",
          on_screen_text: "",
          b_roll: "",
        }),
      );
      return;
    }

    shots.push(
      shotSchema.parse({
        id: `s${shots.length + 1}`,
        start_s: Math.min(cursor, 120),
        end_s: Math.min(cursor + 3, 120),
        purpose: `beat ${i + 1}`,
        direction: line.slice(0, 600),
        vo: "",
        on_screen_text: "",
        b_roll: "",
      }),
    );
    cursor = Math.min(cursor + 3, 120);
  });

  return shots.slice(0, MAX_SHOTS);
}
