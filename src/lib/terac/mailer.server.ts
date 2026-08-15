/**
 * Terac — outbound email.
 *
 * ====================== INTERFACE GUESS — READ THIS ======================
 * No email provider is configured in this project (.env has Supabase keys
 * only). Rather than fail every invite, this is an adapter:
 *
 *   log (default) — writes the rendered email to public.terac_email_log and
 *                   console. Nothing is sent. The invite link is recoverable
 *                   from the log row, which is what makes the E2E test able to
 *                   walk the judge flow without a mailbox.
 *   resend        — real delivery via Resend. Needs RESEND_API_KEY and
 *                   TERAC_MAIL_FROM.
 *
 * Selected by TERAC_MAIL_DRIVER.
 * =========================================================================
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { terac } from "./terac-db";

type Client = SupabaseClient<Database>;

export type MailKind = "invite" | "reminder" | "session_complete";

export type Mail = {
  kind: MailKind;
  to: string;
  subject: string;
  body: string;
  sessionId: string;
  sessionJudgeId?: string | null;
};

export function mailDriver(): "log" | "resend" {
  return (process.env["TERAC_MAIL_DRIVER"] ?? "log").toLowerCase() === "resend" ? "resend" : "log";
}

export async function sendMail(
  client: Client,
  mail: Mail,
): Promise<{ sent: boolean; error?: string }> {
  const driver = mailDriver();
  let providerId: string | null = null;
  let error: string | null = null;

  if (driver === "resend") {
    const key = process.env["RESEND_API_KEY"];
    const from = process.env["TERAC_MAIL_FROM"];
    if (!key || !from) {
      error = "TERAC_MAIL_DRIVER=resend but RESEND_API_KEY/TERAC_MAIL_FROM are unset.";
    } else {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from, to: [mail.to], subject: mail.subject, text: mail.body }),
        });
        if (!res.ok) {
          error = `Resend failed [${res.status}]: ${await res.text()}`;
        } else {
          providerId = ((await res.json()) as { id?: string }).id ?? null;
        }
      } catch (cause) {
        error = cause instanceof Error ? cause.message : "Resend request failed";
      }
    }
  } else {
    console.info(`[terac:mail:log] ${mail.kind} -> ${mail.to}\n${mail.subject}\n${mail.body}`);
  }

  const { error: logError } = await terac(client)
    .from("terac_email_log")
    .insert({
      session_id: mail.sessionId,
      session_judge_id: mail.sessionJudgeId ?? null,
      kind: mail.kind,
      to_email: mail.to,
      subject: mail.subject,
      body: mail.body,
      driver,
      provider_id: providerId,
      error,
    });
  if (logError) console.error(`[terac:mail] could not log email: ${logError.message}`);

  return { sent: !error, ...(error ? { error } : {}) };
}

export function inviteEmail(input: {
  judgeName: string;
  brandName: string;
  videoCount: number;
  url: string;
  deadlineAt: string;
}): { subject: string; body: string } {
  const minutes = Math.max(2, Math.round(input.videoCount * 1.3));
  return {
    subject: `${input.brandName} wants your read on ${input.videoCount} ad${input.videoCount === 1 ? "" : "s"}`,
    body: [
      `${input.judgeName},`,
      ``,
      `${input.brandName} has ${input.videoCount} new ad concept${input.videoCount === 1 ? "" : "s"} and would value your eye on ${input.videoCount === 1 ? "it" : "them"}.`,
      `No login, no password — the link below is yours.`,
      ``,
      input.url,
      ``,
      `About ${minutes} minutes. Open before ${new Date(input.deadlineAt).toLocaleString()}.`,
      ``,
      `— Terac, the expert review layer for Vira`,
    ].join("\n"),
  };
}

export function reminderEmail(input: {
  judgeName: string;
  brandName: string;
  url: string;
  deadlineAt: string;
}): { subject: string; body: string } {
  return {
    subject: `Still open: ${input.brandName}'s ad review`,
    body: [
      `${input.judgeName},`,
      ``,
      `${input.brandName}'s review is still waiting on you. It closes ${new Date(input.deadlineAt).toLocaleString()}.`,
      ``,
      input.url,
      ``,
      `— Terac`,
    ].join("\n"),
  };
}

export function completionEmail(input: {
  brandName: string;
  submitted: number;
  invited: number;
  url: string;
  reason: "quorum" | "deadline";
}): { subject: string; body: string } {
  return {
    subject: `Your ${input.brandName} review is in — ${input.submitted} of ${input.invited} judges`,
    body: [
      `Your review closed on ${input.reason === "quorum" ? "quorum" : "the deadline"}.`,
      `${input.submitted} of ${input.invited} judges submitted.`,
      ``,
      `Read the synthesis and approve revisions:`,
      input.url,
      ``,
      `— Terac`,
    ].join("\n"),
  };
}
