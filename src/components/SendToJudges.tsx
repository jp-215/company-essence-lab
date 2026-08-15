import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { listJudges, saveJudge, startReviewSession } from "@/lib/terac.functions";
import type { RemixDTO } from "@/lib/remix-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MetaLabel, Panel } from "@/components/Page";

/**
 * Flow A — one press, one review session holding every concept selected,
 * with one invite token minted per judge.
 */
export function SendToJudges({
  companyId,
  remixes,
}: {
  companyId: string;
  remixes: RemixDTO[];
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fetchJudges = useServerFn(listJudges);
  const addJudge = useServerFn(saveJudge);
  const createSession = useServerFn(startReviewSession);

  const judges = useQuery({ queryKey: ["terac-judges"], queryFn: () => fetchJudges() });

  const [selected, setSelected] = useState<string[]>(remixes.slice(0, 5).map((item) => item.id));
  const [judgeIds, setJudgeIds] = useState<string[]>([]);
  const [deadlineHours, setDeadlineHours] = useState(72);
  const [form, setForm] = useState({ name: "", email: "", tags: "" });

  const judgeMutation = useMutation({
    mutationFn: () =>
      addJudge({
        data: {
          name: form.name.trim(),
          email: form.email.trim(),
          expertiseTags: form.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
        },
      }),
    onSuccess: (judge) => {
      setForm({ name: "", email: "", tags: "" });
      setJudgeIds((previous) => [...new Set([...previous, judge.id])]);
      void queryClient.invalidateQueries({ queryKey: ["terac-judges"] });
    },
  });

  const sessionMutation = useMutation({
    mutationFn: () =>
      createSession({
        data: {
          companyId,
          remixIds: selected,
          judgeIds,
          quorum: Math.max(1, Math.ceil(judgeIds.length / 2)),
          deadlineHours,
        },
      }),
    onSuccess: (result) => {
      void navigate({ to: "/reviews/$sessionId", params: { sessionId: result.sessionId } });
    },
  });

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  return (
    <Panel className="mt-10 p-6">
      <MetaLabel>Terac · expert review</MetaLabel>
      <h2 className="mt-3 font-serif text-2xl font-bold tracking-tight">Send these to judges</h2>
      <p className="mt-2 max-w-xl text-sm text-muted-foreground">
        Judges review on their phone with no login. The round closes when half of them have
        submitted, or when the deadline hits — whichever comes first.
      </p>

      <div className="mt-6 grid gap-8 md:grid-cols-2">
        <div>
          <MetaLabel>Concepts in this round</MetaLabel>
          <ul className="mt-3 space-y-2">
            {remixes.map((remix) => (
              <li key={remix.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.includes(remix.id)}
                    onChange={() => setSelected((previous) => toggle(previous, remix.id))}
                    className="mt-1 size-4 accent-[currentColor]"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{remix.hook || remix.trendTitle}</span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {remix.trendKey} · {remix.platform}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <MetaLabel>Judges</MetaLabel>
          <ul className="mt-3 space-y-2">
            {(judges.data ?? []).map((judge) => (
              <li key={judge.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={judgeIds.includes(judge.id)}
                    onChange={() => setJudgeIds((previous) => toggle(previous, judge.id))}
                    className="size-4"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{judge.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {judge.expertiseTags.join(" · ") || judge.email}
                    </span>
                  </span>
                </label>
              </li>
            ))}
            {!judges.data?.length ? (
              <li className="text-sm text-muted-foreground">No judges yet — add your first below.</li>
            ) : null}
          </ul>

          <div className="mt-4 space-y-2">
            <Input
              placeholder="Judge name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
            <Input
              type="email"
              placeholder="judge@email.com"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
            />
            <Input
              placeholder="Expertise tags (comma separated)"
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={judgeMutation.isPending || form.name.length < 2 || !form.email.includes("@")}
              onClick={() => judgeMutation.mutate()}
            >
              {judgeMutation.isPending ? "Adding…" : "Add judge"}
            </Button>
            {judgeMutation.error ? (
              <p className="text-sm text-destructive">{(judgeMutation.error as Error).message}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-end gap-4">
        <label className="space-y-1">
          <MetaLabel>Deadline (hours)</MetaLabel>
          <Input
            type="number"
            min={1}
            max={720}
            value={deadlineHours}
            onChange={(event) => setDeadlineHours(Number(event.target.value) || 72)}
            className="w-28"
          />
        </label>
        <Button
          type="button"
          className="h-12 rounded-xl px-6 text-base font-semibold bg-foreground text-background hover:bg-foreground/90"
          disabled={sessionMutation.isPending || selected.length === 0 || judgeIds.length === 0}
          onClick={() => sessionMutation.mutate()}
        >
          {sessionMutation.isPending
            ? "Creating round…"
            : `Send ${selected.length} to ${judgeIds.length} judge${judgeIds.length === 1 ? "" : "s"}`}
        </Button>
        {sessionMutation.error ? (
          <p className="text-sm text-destructive">{(sessionMutation.error as Error).message}</p>
        ) : null}
      </div>
    </Panel>
  );
}
