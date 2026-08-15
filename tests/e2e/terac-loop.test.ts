/**
 * Terac end-to-end, against the real database.
 *
 * Walks the loop the way the product does:
 *   Create Ads -> session + N videos + one token per judge + invite emails
 *   -> judge opens by token -> votes -> submits -> quorum fires 'complete'
 *   -> synthesis -> approve a revision -> v2 row with parent_video_id set
 *
 * and asserts the security properties that the SECURITY DEFINER design exists
 * to provide (a token sees only its own session, only its own ballot, and
 * nothing at all once the deadline has passed).
 *
 * REQUIREMENTS
 *   1. supabase/migrations/20260815190000_terac_review_system.sql has been
 *      applied (Lovable applies migrations on sync).
 *   2. TERAC_TEST_EMAIL + TERAC_TEST_PASSWORD for an existing account that owns
 *      at least one company. Deliberately a real sign-in rather than a
 *      service-role key, because service-role bypasses RLS and RLS is half of
 *      what this test is for.
 *
 * Without those the suite SKIPS with a message naming exactly what is missing —
 * it never silently passes.
 *
 *   TERAC_TEST_EMAIL=you@example.com TERAC_TEST_PASSWORD=... npm run test:e2e
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { terac, type TeracClient } from "@/lib/terac/terac-db";
import { createReviewSession } from "@/lib/terac/sessions.server";
import { synthesiseSession } from "@/lib/terac/synthesis.server";
import { regenerateVideo } from "@/lib/terac/regeneration.server";
import { loadSessionResults } from "@/lib/terac/results.server";
import { mintToken } from "@/lib/terac/tokens";

// --- env -------------------------------------------------------------------

function loadDotEnv() {
  try {
    const path = fileURLToPath(new URL("../../.env", import.meta.url));
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (key && !process.env[key]) {
        process.env[key] = (rawValue ?? "").replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env — rely on the ambient environment */
  }
}
loadDotEnv();

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
const ANON_KEY =
  process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
const TEST_EMAIL = process.env["TERAC_TEST_EMAIL"];
const TEST_PASSWORD = process.env["TERAC_TEST_PASSWORD"];

const missing = [
  !SUPABASE_URL && "SUPABASE_URL",
  !ANON_KEY && "SUPABASE_PUBLISHABLE_KEY",
  !TEST_EMAIL && "TERAC_TEST_EMAIL",
  !TEST_PASSWORD && "TERAC_TEST_PASSWORD",
].filter(Boolean) as string[];

const canRun = missing.length === 0;

if (!canRun) {
  console.warn(
    `\n[terac:e2e] SKIPPED — missing ${missing.join(", ")}.\n` +
      `[terac:e2e] Apply supabase/migrations/20260815190000_terac_review_system.sql, then run:\n` +
      `[terac:e2e]   TERAC_TEST_EMAIL=you@example.com TERAC_TEST_PASSWORD=... npm run test:e2e\n`,
  );
}

// --- state -----------------------------------------------------------------

let authed: SupabaseClient<Database>;
let anon: SupabaseClient<Database>;
let db: TeracClient;
let userId: string;
let companyId: string;
let sessionId: string;
let judgeTokens: string[] = [];
const createdJudgeIds: string[] = [];

const QUORUM = 2;
const JUDGE_COUNT = 3;
const CONCEPT_COUNT = 2;

describe.skipIf(!canRun)("Terac review loop (live database)", () => {
  beforeAll(async () => {
    anon = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({
      email: TEST_EMAIL!,
      password: TEST_PASSWORD!,
    });
    if (signInError) throw new Error(`Could not sign in as ${TEST_EMAIL}: ${signInError.message}`);
    userId = signIn.user!.id;

    authed = createClient<Database>(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${signIn.session!.access_token}` } },
    });
    db = terac(authed);

    // Fail loudly and usefully if the migration has not been applied.
    const { error: schemaError } = await db.from("review_sessions").select("id").limit(1);
    if (schemaError) {
      throw new Error(
        `Terac tables are not present — apply supabase/migrations/20260815190000_terac_review_system.sql first. (${schemaError.message})`,
      );
    }

    const { data: company } = await authed
      .from("companies")
      .select("id")
      .eq("owner_id", userId)
      .limit(1)
      .maybeSingle();
    if (!company) throw new Error(`Account ${TEST_EMAIL} owns no company; list one first.`);
    companyId = company.id;

    // Disposable judges so we never touch a real roster.
    const stamp = mintToken(4);
    for (let i = 0; i < JUDGE_COUNT; i += 1) {
      const { data: judge, error } = await db
        .from("judges")
        .insert({
          owner_id: userId,
          name: `E2E Judge ${i + 1} ${stamp}`,
          email: `e2e-${stamp}-${i}@example.test`,
          expertise_tags: ["e2e"],
          active: true,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      createdJudgeIds.push(judge.id);
    }
  });

  afterAll(async () => {
    if (!canRun) return;
    if (sessionId) await db.from("review_sessions").delete().eq("id", sessionId);
    if (createdJudgeIds.length) await db.from("judges").delete().in("id", createdJudgeIds);
  });

  it("Flow A — one press of Create Ads makes ONE session with N videos", async () => {
    const { data: trends, error } = await authed.rpc("company_trends", {
      _company_id: companyId,
      _limit: CONCEPT_COUNT,
    });
    if (error) throw new Error(error.message);
    expect(trends!.length).toBeGreaterThanOrEqual(CONCEPT_COUNT);

    const result = await createReviewSession(authed, userId, {
      companyId,
      trendKeys: trends!.slice(0, CONCEPT_COUNT).map((p) => p.trend_key),
      judgeIds: createdJudgeIds,
      quorum: QUORUM,
      deadlineHours: 48,
      origin: "http://localhost:8080",
    });

    sessionId = result.sessionId;
    expect(result.videoCount).toBe(CONCEPT_COUNT);
    expect(result.invited).toBe(JUDGE_COUNT);

    const { data: videos } = await db.from("ad_videos").select("*").eq("session_id", sessionId);
    expect(videos).toHaveLength(CONCEPT_COUNT);
    // Every concept carries the structured recipe that produced it.
    for (const video of videos!) {
      expect(video.generation_spec).toHaveProperty("shots");
      expect(video.version).toBe(1);
      expect(video.parent_video_id).toBeNull();
    }

    const { data: session } = await db
      .from("review_sessions")
      .select("status")
      .eq("id", sessionId)
      .single();
    expect(session!.status).toBe("sent");
  });

  it("mints one token per judge and logs one invite each", async () => {
    const { data: assignments } = await db
      .from("session_judges")
      .select("invite_token, status")
      .eq("session_id", sessionId);

    expect(assignments).toHaveLength(JUDGE_COUNT);
    judgeTokens = assignments!.map((a) => a.invite_token);
    expect(new Set(judgeTokens).size).toBe(JUDGE_COUNT);
    for (const token of judgeTokens) expect(token).toHaveLength(64);

    const { data: emails } = await db
      .from("terac_email_log")
      .select("kind, to_email, body")
      .eq("session_id", sessionId)
      .eq("kind", "invite");
    expect(emails).toHaveLength(JUDGE_COUNT);
    // The link a judge actually receives is a path, not a subdomain.
    expect(emails![0]!.body).toContain("/terac/r/");
  });

  it("Flow B — a token opens its own session with no login", async () => {
    const { data, error } = await anon.rpc("terac_open_session", { _token: judgeTokens[0]! });
    expect(error).toBeNull();

    const payload = data as unknown as {
      session: { id: string; video_count: number };
      judge: { name: string; status: string };
      videos: { id: string; ballot: { is_pick: boolean } }[];
    };

    expect(payload.session.id).toBe(sessionId);
    expect(payload.videos).toHaveLength(CONCEPT_COUNT);
    expect(payload.judge.status).toBe("opened");
    for (const video of payload.videos) expect(video.ballot.is_pick).toBe(false);

    const { data: session } = await db
      .from("review_sessions")
      .select("status")
      .eq("id", sessionId)
      .single();
    expect(session!.status).toBe("in_review");
  });

  it("orders videos per judge, and stably across re-opens", async () => {
    const orderFor = async (token: string) => {
      const { data } = await anon.rpc("terac_open_session", { _token: token });
      return (data as unknown as { videos: { id: string }[] }).videos.map((v) => v.id);
    };

    const first = await orderFor(judgeTokens[0]!);
    const again = await orderFor(judgeTokens[0]!);
    expect(again).toEqual(first); // stable — reopening must not reshuffle mid-review

    const other = await orderFor(judgeTokens[1]!);
    expect(other.slice().sort()).toEqual(first.slice().sort()); // same set...
  });

  it("refuses an unknown token", async () => {
    const { error } = await anon.rpc("terac_open_session", { _token: mintToken() });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/invalid link/i);
  });

  it("refuses a ballot on a video outside the token's session", async () => {
    const foreignVideo = "00000000-0000-4000-8000-000000000000";
    const { error } = await anon.rpc("terac_save_ballot", {
      _token: judgeTokens[0]!,
      _video_id: foreignVideo,
      _is_pick: true,
      _body: "",
      _dimension_scores: {} as never,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not part of this review/i);
  });

  it("refuses a dimension score that is not one of the six", async () => {
    const { data: videos } = await db.from("ad_videos").select("id").eq("session_id", sessionId);
    const { error } = await anon.rpc("terac_save_ballot", {
      _token: judgeTokens[0]!,
      _video_id: videos![0]!.id,
      _is_pick: false,
      _body: "",
      _dimension_scores: { vibes: "strong" } as never,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/dimension/i);
  });

  it("saves and returns only that judge's own ballot", async () => {
    const { data: videos } = await db
      .from("ad_videos")
      .select("id")
      .eq("session_id", sessionId)
      .order("display_order");
    const target = videos![0]!.id;

    const { error } = await anon.rpc("terac_save_ballot", {
      _token: judgeTokens[0]!,
      _video_id: target,
      _is_pick: true,
      _body: "Judge one only",
      _dimension_scores: { hook_strength: "weak", pacing: "weak" } as never,
    });
    expect(error).toBeNull();

    const mine = (await anon.rpc("terac_open_session", { _token: judgeTokens[0]! }))
      .data as unknown as { videos: { id: string; ballot: { body: string; is_pick: boolean } }[] };
    expect(mine.videos.find((v) => v.id === target)!.ballot.body).toBe("Judge one only");

    // A different judge must not see it — before or after submitting.
    const theirs = (await anon.rpc("terac_open_session", { _token: judgeTokens[1]! }))
      .data as unknown as { videos: { id: string; ballot: { body: string } }[] };
    expect(theirs.videos.find((v) => v.id === target)!.ballot.body).toBe("");
  });

  it("gives anon no direct table access at all", async () => {
    for (const table of [
      "review_sessions",
      "ad_videos",
      "video_votes",
      "session_judges",
    ] as const) {
      const { data, error } = await terac(anon).from(table).select("id").limit(1);
      // Either denied outright, or RLS returns an empty set — never real rows.
      expect(error !== null || (data ?? []).length === 0).toBe(true);
    }
  });

  it("completes on quorum, not on every judge", async () => {
    const { data: videos } = await db
      .from("ad_videos")
      .select("id")
      .eq("session_id", sessionId)
      .order("display_order");

    for (let i = 0; i < QUORUM; i += 1) {
      const token = judgeTokens[i]!;
      for (const [index, video] of videos!.entries()) {
        await anon.rpc("terac_save_ballot", {
          _token: token,
          _video_id: video.id,
          _is_pick: index === 0,
          _body: index === 0 ? "Strongest of the set." : "Could not tell what the product was.",
          _dimension_scores: (index === 0
            ? { hook_strength: "strong", pacing: "strong", product_clarity: "strong" }
            : { hook_strength: "weak", pacing: "weak", product_clarity: "weak" }) as never,
        });
      }

      const { data: submitResult, error } = await anon.rpc("terac_submit_ballot", {
        _token: token,
        _ranks: [{ video_id: videos![0]!.id, rank: 1 }] as never,
        _overall_note: `Judge ${i + 1} overall note`,
      });
      expect(error).toBeNull();

      const status = (submitResult as unknown as { session_status: string }).session_status;
      // First submission leaves it open; the quorum-th closes it.
      expect(status).toBe(i + 1 >= QUORUM ? "complete" : "in_review");
    }

    // The third judge never responded, and that did not block the founder.
    const { data: assignments } = await db
      .from("session_judges")
      .select("status")
      .eq("session_id", sessionId);
    expect(assignments!.filter((a) => a.status === "submitted")).toHaveLength(QUORUM);
    expect(assignments!.filter((a) => a.status !== "submitted")).toHaveLength(JUDGE_COUNT - QUORUM);
  });

  it("locks a submitted ballot against edits", async () => {
    const { data: videos } = await db.from("ad_videos").select("id").eq("session_id", sessionId);
    const { error } = await anon.rpc("terac_save_ballot", {
      _token: judgeTokens[0]!,
      _video_id: videos![0]!.id,
      _is_pick: false,
      _body: "sneaking an edit in",
      _dimension_scores: {} as never,
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/already submitted/i);
  });

  it("Flow C — synthesis produces directives that are a diff, not a new brief", async () => {
    const synthesis = await synthesiseSession(authed, userId, sessionId);

    expect(synthesis.summary.length).toBeGreaterThan(10);
    expect(synthesis.directives.length).toBeGreaterThan(0);

    const { data: videos } = await db
      .from("ad_videos")
      .select("id")
      .eq("session_id", sessionId)
      .order("display_order");
    const weakVideoId = videos![1]!.id;

    const directive = synthesis.directives.find((d) => d.video_id === weakVideoId);
    expect(directive).toBeDefined();
    expect(directive!.ops.length).toBeGreaterThan(0);

    // Every op targets a path, never a free-text regeneration prompt.
    for (const op of directive!.ops) {
      expect(["replace", "adjust", "remove", "keep", "insert_shot"]).toContain(op.op);
      if (op.op !== "insert_shot") {
        expect(op.path.startsWith("/")).toBe(true);
        expect(op.path.startsWith("/brand")).toBe(false);
      }
    }

    const { data: session } = await db
      .from("review_sessions")
      .select("status")
      .eq("id", sessionId)
      .single();
    expect(session!.status).toBe("synthesized");
  });

  it("approving a revision writes v2 with lineage intact", async () => {
    const results = await loadSessionResults(authed, userId, sessionId);
    const directive = results.synthesis!.directives.find((d) => d.ops.length > 0);
    expect(directive).toBeDefined();

    const { data: before } = await db
      .from("ad_videos")
      .select("generation_spec")
      .eq("id", directive!.video_id)
      .single();

    const regen = await regenerateVideo(authed, userId, { directive });

    expect(regen.version).toBe(2);
    expect(regen.parentVideoId).toBe(directive!.video_id);

    const { data: v2 } = await db.from("ad_videos").select("*").eq("id", regen.newVideoId).single();

    expect(v2!.parent_video_id).toBe(directive!.video_id);
    expect(v2!.session_id).toBe(sessionId);

    const oldSpec = before!.generation_spec as Record<string, unknown>;
    const newSpec = v2!.generation_spec as Record<string, unknown>;
    // Identity is preserved across the diff; the concept did not become a
    // different ad.
    expect((newSpec["concept"] as Record<string, unknown>)["trend_key"]).toBe(
      (oldSpec["concept"] as Record<string, unknown>)["trend_key"],
    );
    expect(newSpec["brand"]).toEqual(oldSpec["brand"]);

    // v1 is untouched — the full version tree survives.
    const { data: v1 } = await db
      .from("ad_videos")
      .select("version, generation_spec")
      .eq("id", directive!.video_id)
      .single();
    expect(v1!.version).toBe(1);
    expect(v1!.generation_spec).toEqual(oldSpec);

    const { data: session } = await db
      .from("review_sessions")
      .select("status")
      .eq("id", sessionId)
      .single();
    expect(session!.status).toBe("actioned");
  });

  it("a token stops working once the deadline has passed", async () => {
    await db
      .from("review_sessions")
      .update({ deadline_at: new Date(Date.now() - 1000).toISOString() })
      .eq("id", sessionId);

    const { error } = await anon.rpc("terac_open_session", { _token: judgeTokens[2]! });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/closed/i);
  });
});

if (!canRun) {
  describe("Terac review loop (live database)", () => {
    it.skip(`skipped — set ${missing.join(", ")} to run`, () => {
      /* see the header of this file */
    });
  });
}
