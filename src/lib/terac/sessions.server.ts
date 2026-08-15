/**
 * Terac — Flow A: Create Ads.
 *
 * One press of Create Ads produces ONE review session containing all N concepts
 * from that press, one invite token per assigned judge, and one email each.
 * Sending N separate links would lose the comparative signal, which is where a
 * judge's expertise actually lives.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

import {
  listMappedTrends,
  loadCompanyContext,
  remixTrend,
  saveRemix,
  type RemixOutput,
} from "../remix.server";
import type { TrendDTO } from "../remix-types";
import { specFromRemix, type GenerationSpec } from "./spec";
import { mintToken, judgeUrl } from "./tokens";
import { createAsset } from "./video-provider.server";
import { completionEmail, reminderEmail, sendMail } from "./mailer.server";
import { terac, type SessionStatus, type TeracClient } from "./terac-db";

type Client = SupabaseClient<Database>;

export type CreateSessionInput = {
  companyId: string;
  trendKeys: string[];
  quorum: number;
  deadlineHours: number;
  origin: string;
};

export type CreateSessionResult = {
  sessionId: string;
  publicToken: string;
  agentUrl: string;
  videoCount: number;
  aiUnavailable: boolean;
};

/**
 * A trend is a real social post — caption, format, traction — not a script.
 * Turning it into a shootable ad is `remixTrend`'s job, and that needs
 * LOVABLE_API_KEY.
 *
 * When the key is absent or the gateway fails we still open the session, using
 * a scaffold built from the trend's own mechanic so judges have something
 * concrete to react to. It is deliberately plain: `aiUnavailable` is returned
 * so the UI says outright that these were not personalised.
 */
function scaffoldFor(
  trend: TrendDTO,
  company: Awaited<ReturnType<typeof loadCompanyContext>>,
): RemixOutput {
  const subject = trend.title || trend.caption.slice(0, 80) || "this trend";
  return {
    hook: `The ${trend.format || trend.platform} format behind “${subject}” — done as ${company.name}`,
    script: [
      `0-2s hook: open the way the trend does — ${subject}`,
      `2-5s agitate: name the problem ${company.name} exists to solve.`,
      `5-12s reveal: ${company.name} in hand, one benefit said out loud.`,
      `12-20s proof: the specific evidence — ${company.mission || "why this is different"}.`,
      `20-28s CTA: tell them exactly what to do next.`,
    ].join("\n"),
    caption: `${company.name} — ${subject}`,
    hashtags: trend.hashtags.slice(0, 6),
    differentiator: `Borrows the trend's mechanic (${trend.format || trend.platform}) but substitutes ${company.name}'s own proof.`,
  };
}

async function conceptFor(
  trend: TrendDTO,
  company: Awaited<ReturnType<typeof loadCompanyContext>>,
): Promise<{ output: RemixOutput; personalised: boolean }> {
  try {
    const output = await remixTrend({ trend, company });
    if (output.hook || output.script) return { output, personalised: true };
  } catch (cause) {
    console.warn(
      `[terac] remix unavailable for ${trend.trendKey}, scaffolding instead: ${
        cause instanceof Error ? cause.message : String(cause)
      }`,
    );
  }

  return { output: scaffoldFor(trend, company), personalised: false };
}

/**
 * Trends carry no CTA field. Vira's remix prompt puts one at the end of the
 * caption, so take the caption's last sentence rather than invent copy.
 */
function ctaFromCaption(caption: string): string {
  const sentences = caption
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (sentences.at(-1) ?? "").slice(0, 200);
}

export async function createReviewSession(
  base: Client,
  userId: string,
  input: CreateSessionInput,
): Promise<CreateSessionResult> {
  const client = terac(base);

  if (input.trendKeys.length === 0) throw new Error("Pick at least one ad concept.");

  const company = await loadCompanyContext(base, userId, input.companyId);
  const available = await listMappedTrends(base, input.companyId, 100);

  const selected = input.trendKeys.map((key) => {
    const found = available.find((p) => p.trendKey === key);
    if (!found) throw new Error(`Trend ${key} is not mapped to your company's category.`);
    return found;
  });

  const deadlineAt = new Date(Date.now() + input.deadlineHours * 3600_000).toISOString();

  const { data: session, error: sessionError } = await client
    .from("review_sessions")
    .insert({
      user_id: userId,
      company_id: input.companyId,
      title: `${company.name} — ${selected.length} concept${selected.length === 1 ? "" : "s"}`,
      status: "generating",
      public_token: mintToken(),
      quorum: input.quorum,
      deadline_at: deadlineAt,
    })
    .select("*")
    .single();
  if (sessionError) throw new Error(sessionError.message);

  let aiUnavailable = false;

  for (const [index, trend] of selected.entries()) {
    const { output, personalised } = await conceptFor(trend, company);
    if (!personalised) aiUnavailable = true;

    // Keep the Vira artefact too, so a Terac concept traces back to the remix
    // the founder can already see in the remix studio.
    const remix = await saveRemix(base, userId, {
      companyId: input.companyId,
      trend,
      output,
    });

    const spec: GenerationSpec = specFromRemix({
      trendKey: trend.trendKey,
      platform: trend.platform,
      format: trend.format,
      // Trends have no `angle`; the closest honest equivalent is the format
      // mechanic the remix was told to preserve.
      angle: trend.format,
      conceptTitle: trend.title || trend.caption.slice(0, 120),
      hook: output.hook,
      script: output.script,
      cta: ctaFromCaption(output.caption),
      mustInclude: [company.name, ...(company.adThemes ?? [])].filter(Boolean).slice(0, 12),
      mustAvoid: [],
    });

    const asset = await createAsset(null);

    const { error: videoError } = await client.from("ad_videos").insert({
      session_id: session.id,
      concept_title: trend.title || trend.caption.slice(0, 120),
      hook_text: output.hook,
      generation_spec: spec as unknown as never,
      version: 1,
      display_order: index,
      playback_id: asset.playbackId,
      thumbnail_url: asset.thumbnailUrl,
      media_status: asset.mediaStatus,
      media_provider: asset.provider,
      remix_id: remix.id,
    });
    if (videoError) throw new Error(videoError.message);
  }

  await advance(client, session.id, "ready");

  // No roster: the session opens as a task any Terac agent can claim from the
  // pool link. They identify themselves on first open (terac_claim_session).
  await advance(client, session.id, "sent");

  return {
    sessionId: session.id,
    publicToken: session.public_token,
    agentUrl: judgeUrl(input.origin, session.public_token),
    videoCount: selected.length,
    aiUnavailable,
  };
}

async function advance(client: TeracClient, sessionId: string, to: SessionStatus): Promise<void> {
  const { error } = await client.rpc("terac_advance_session", { _session_id: sessionId, _to: to });
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Founder-facing progress
// ---------------------------------------------------------------------------

export type SessionProgress = {
  id: string;
  title: string;
  status: SessionStatus;
  quorum: number;
  deadlineAt: string;
  createdAt: string;
  videoCount: number;
  invited: number;
  opened: number;
  submitted: number;
  judges: { name: string; status: string; submittedAt: string | null; openedAt: string | null }[];
  hasSynthesis: boolean;
};

export async function listSessions(base: Client, userId: string): Promise<SessionProgress[]> {
  const client = terac(base);

  const { data: sessions, error } = await client
    .from("review_sessions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  if (!sessions?.length) return [];

  const ids = sessions.map((s) => s.id);

  const [{ data: videos }, { data: assignments }, { data: syntheses }] = await Promise.all([
    client.from("ad_videos").select("id, session_id").in("session_id", ids),
    client
      .from("session_judges")
      .select("session_id, status, opened_at, submitted_at, judges(name)")
      .in("session_id", ids),
    client.from("feedback_syntheses").select("session_id").in("session_id", ids),
  ]);

  return sessions.map((session) => {
    const mine = (assignments ?? []).filter((a) => a.session_id === session.id);
    return {
      id: session.id,
      title: session.title,
      status: session.status,
      quorum: session.quorum,
      deadlineAt: session.deadline_at,
      createdAt: session.created_at,
      videoCount: (videos ?? []).filter((v) => v.session_id === session.id).length,
      invited: mine.length,
      opened: mine.filter((a) => a.status !== "invited").length,
      submitted: mine.filter((a) => a.status === "submitted").length,
      judges: mine.map((a) => ({
        name: (a.judges as unknown as { name: string } | null)?.name ?? "Judge",
        status: a.status,
        openedAt: a.opened_at,
        submittedAt: a.submitted_at,
      })),
      hasSynthesis: (syntheses ?? []).some((s) => s.session_id === session.id),
    };
  });
}

/**
 * Reminder sweep: nudges judges still in `invited` once the session is past
 * half its window.
 *
 * NOTE: nothing schedules this. It is idempotent (reminded_at guards a second
 * send) and safe to call from a cron, a webhook, or the founder's dashboard.
 */
export async function sendDueReminders(
  base: Client,
  userId: string,
  origin: string,
): Promise<number> {
  const client = terac(base);

  const { data: sessions, error } = await client
    .from("review_sessions")
    .select("id, title, deadline_at, created_at, company_id, status")
    .eq("user_id", userId)
    .in("status", ["sent", "in_review"]);
  if (error) throw new Error(error.message);

  let sent = 0;

  for (const session of sessions ?? []) {
    const created = new Date(session.created_at).getTime();
    const deadline = new Date(session.deadline_at).getTime();
    if (Date.now() < created + (deadline - created) / 2) continue;

    const { data: pending } = await client
      .from("session_judges")
      .select("id, invite_token, reminded_at, judges(name, email)")
      .eq("session_id", session.id)
      .eq("status", "invited")
      .is("reminded_at", null);

    const { data: company } = await client
      .from("companies")
      .select("name")
      .eq("id", session.company_id)
      .maybeSingle();

    for (const row of pending ?? []) {
      const judge = row.judges as unknown as { name: string; email: string } | null;
      if (!judge) continue;

      const mail = reminderEmail({
        judgeName: judge.name,
        brandName: company?.name ?? "A brand",
        url: judgeUrl(origin, row.invite_token),
        deadlineAt: session.deadline_at,
      });
      await sendMail(base, {
        kind: "reminder",
        to: judge.email,
        subject: mail.subject,
        body: mail.body,
        sessionId: session.id,
        sessionJudgeId: row.id,
      });
      await client
        .from("session_judges")
        .update({ reminded_at: new Date().toISOString() })
        .eq("id", row.id);
      sent += 1;
    }
  }

  return sent;
}

/** Founder notification when a session closes. Idempotent per session. */
export async function notifyCompletion(
  base: Client,
  userId: string,
  sessionId: string,
  origin: string,
): Promise<boolean> {
  const client = terac(base);

  const { data: session } = await client
    .from("review_sessions")
    .select("id, status, quorum, deadline_at, company_id")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session || session.status !== "complete") return false;

  const { data: existing } = await client
    .from("terac_email_log")
    .select("id")
    .eq("session_id", sessionId)
    .eq("kind", "session_complete")
    .limit(1);
  if (existing?.length) return false;

  const { data: assignments } = await client
    .from("session_judges")
    .select("status")
    .eq("session_id", sessionId);
  const submitted = (assignments ?? []).filter((a) => a.status === "submitted").length;

  const { data: company } = await client
    .from("companies")
    .select("name")
    .eq("id", session.company_id)
    .maybeSingle();

  const { data: profile } = await client
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  void profile;

  const { data: userResult } = await base.auth.getUser();
  const to = userResult?.user?.email;
  if (!to) return false;

  const mail = completionEmail({
    brandName: company?.name ?? "your brand",
    submitted,
    invited: assignments?.length ?? 0,
    url: `${origin.replace(/\/$/, "")}/reviews/${sessionId}`,
    reason: submitted >= session.quorum ? "quorum" : "deadline",
  });

  await sendMail(base, {
    kind: "session_complete",
    to,
    subject: mail.subject,
    body: mail.body,
    sessionId,
  });
  return true;
}
