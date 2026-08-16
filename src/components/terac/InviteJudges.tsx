/**
 * Terac — getting the link into a judge's inbox.
 *
 * Two small pieces, deliberately separate:
 *
 *   JudgeEmailsField — collects addresses BEFORE a session exists, so the very
 *     press that opens the review also sends it. Its value is handed to
 *     createAds / openReviewForRenders as `judgeEmails`.
 *   SendInviteRow    — sends (or re-sends) an EXISTING session's link, so a
 *     founder is never stuck with a link they only ever copied once.
 *
 * Both feed the one mail adapter in mailer.server.ts. With TERAC_MAIL_DRIVER
 * unset nothing leaves the building: the rendered email lands in
 * terac_email_log, and the UI says so rather than implying delivery.
 */
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { sendReviewInvites } from "@/lib/terac/terac.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

/** "a@b.com, c@d.com  e@f.com" -> ["a@b.com", "c@d.com", "e@f.com"] */
export function parseEmails(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[\s,;]+/)
        .map((value) => value.trim().toLowerCase())
        .filter((value) => EMAIL.test(value)),
    ),
  );
}

export function JudgeEmailsField({
  value,
  onChange,
  label = "Judge emails",
}: {
  value: string;
  onChange: (next: string) => void;
  label?: string;
}) {
  const parsed = parseEmails(value);
  return (
    <label className="block text-sm">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      <Input
        type="text"
        inputMode="email"
        autoComplete="off"
        placeholder="judge@studio.com, second@agency.co"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1"
      />
      <span className="mt-1 block text-xs text-muted-foreground">
        {parsed.length
          ? `${parsed.length} judge${parsed.length === 1 ? "" : "s"} will be emailed their own link.`
          : "Optional — comma separated. Leave empty to just share the link yourself."}
      </span>
    </label>
  );
}

export function SendInviteRow({ sessionId }: { sessionId: string }) {
  const send = useServerFn(sendReviewInvites);
  const [raw, setRaw] = useState("");

  const mutation = useMutation({
    mutationFn: (emails: string[]) => send({ data: { sessionId, emails } }),
    onSuccess: (result) => {
      setRaw("");
      if (result.invited) {
        toast.success(
          result.driver === "resend"
            ? `Emailed the link to ${result.invited} judge${result.invited === 1 ? "" : "s"}.`
            : `Link issued for ${result.invited} judge${result.invited === 1 ? "" : "s"} — mail driver is "log", so nothing was actually delivered.`,
        );
      }
      for (const failure of result.failures) {
        toast.error(`${failure.email}: ${failure.error}`);
      }
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Could not send the invites."),
  });

  function submit() {
    const emails = parseEmails(raw);
    if (!emails.length) {
      toast.info("Enter at least one email address.");
      return;
    }
    mutation.mutate(emails);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="text"
        inputMode="email"
        autoComplete="off"
        aria-label="Judge emails"
        placeholder="Email this link to judges…"
        value={raw}
        onChange={(event) => setRaw(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
        className="max-w-md text-xs"
      />
      <Button variant="outline" size="sm" disabled={mutation.isPending} onClick={submit}>
        {mutation.isPending ? "Sending…" : "Send link"}
      </Button>
    </div>
  );
}
