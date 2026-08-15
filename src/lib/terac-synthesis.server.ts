import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { RevisionDirective, SynthesisDTO } from "./terac-types";
import { getReviewResults } from "./terac.server";

type Client = SupabaseClient<Database>;

const SYSTEM_PROMPT = `You are Terac, the expert review layer for short-form video ads.
You receive judge votes, quick dimension ratings (weak/okay/strong on hook strength,
pacing, product clarity, visual quality, CTA, brand fit) and free-text notes for a set
of ad concepts, plus each concept's existing generation spec.

Return STRICT JSON:
{
  "summary": "plain-English paragraph a founder can act on",
  "consensus_themes": ["short theme phrases judges agreed on"],
  "video_verdicts": [{ "video_id": "uuid", "verdict": "one or two sentences", "standing": "strong|mixed|weak" }],
  "revision_directives": [{
    "video_id": "uuid",
    "rationale": "why, in plain English, referencing the judge signal",
    "changes": [{ "element": "hook|script|caption|differentiator", "action": "replace|adjust|keep", "from": "current text", "to": "new text" }]
  }]
}

Rules:
- revision_directives are a DIFF against the existing generation spec. Name only the
  elements that must change; carry over everything else untouched. Never write a fresh
  generation prompt and never restate the whole spec.
- Only propose a directive for concepts that judges rated weak or mixed.
- Quote the judges' structured signal, not vibes. No marketing filler.`;

export async function synthesizeSession(
  client: Client,
  userId: string,
  sessionId: string,
): Promise<SynthesisDTO> {
  const results = await getReviewResults(client, userId, sessionId);
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const userContent = [
    `Brand: ${results.session.companyName}`,
    `Judges submitted: ${results.session.submittedCount} of ${results.judges.length} (quorum ${results.session.quorum})`,
    "",
    ...results.videos.map((item) =>
      [
        `Video ${item.video.id} — "${item.video.conceptTitle}" (v${item.video.version})`,
        `Hook: ${item.video.hookText}`,
        `Spec: ${JSON.stringify(item.video.generationSpec)}`,
        `Top picks: ${item.picks} | avg rank: ${item.averageRank ?? "n/a"}`,
        `Dimensions: ${JSON.stringify(item.dimensionTally)}`,
        item.comments.length
          ? `Notes: ${item.comments.map((c) => `${c.judgeName}: ${c.body}`).join(" | ")}`
          : "Notes: none",
      ].join("\n"),
    ),
  ].join("\n\n");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3.5-flash",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`AI gateway failed [${response.status}]: ${body}`);
    throw new Error(`Synthesis failed [${response.status}].`);
  }

  const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = (payload.choices?.[0]?.message?.content ?? "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("The synthesis came back unreadable.");

  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    summary?: string;
    consensus_themes?: unknown;
    video_verdicts?: unknown;
    revision_directives?: unknown;
  };

  const validIds = new Set(results.videos.map((item) => item.video.id));
  const themes = Array.isArray(parsed.consensus_themes)
    ? parsed.consensus_themes.filter((item): item is string => typeof item === "string")
    : [];

  const verdicts = (Array.isArray(parsed.video_verdicts) ? parsed.video_verdicts : [])
    .map((item) => item as { video_id?: string; verdict?: string; standing?: string })
    .filter((item) => item.video_id && validIds.has(item.video_id))
    .map((item) => ({
      videoId: item.video_id!,
      verdict: item.verdict ?? "",
      standing:
        item.standing === "strong" ? "strong" : item.standing === "weak" ? "weak" : "mixed",
    })) as SynthesisDTO["videoVerdicts"];

  const directives: RevisionDirective[] = (
    Array.isArray(parsed.revision_directives) ? parsed.revision_directives : []
  )
    .map((item) => item as { video_id?: string; rationale?: string; changes?: unknown })
    .filter((item) => item.video_id && validIds.has(item.video_id))
    .map((item) => ({
      videoId: item.video_id!,
      rationale: item.rationale ?? "",
      changes: (Array.isArray(item.changes) ? item.changes : [])
        .map((change) => change as { element?: string; action?: string; from?: string; to?: string })
        .filter((change) => typeof change.element === "string")
        .map((change) => ({
          element: change.element!,
          action:
            change.action === "replace" ? "replace" : change.action === "keep" ? "keep" : "adjust",
          from: change.from,
          to: change.to,
        })) as RevisionDirective["changes"],
      status: "proposed" as const,
    }));

  const summary = typeof parsed.summary === "string" ? parsed.summary : "";

  const { data, error } = await client
    .from("feedback_syntheses")
    .upsert(
      {
        session_id: sessionId,
        summary,
        consensus_themes: themes,
        video_verdicts: verdicts as never,
        revision_directives: directives as never,
      },
      { onConflict: "session_id" },
    )
    .select("created_at")
    .single();
  if (error) throw new Error(error.message);

  return {
    summary,
    consensusThemes: themes,
    videoVerdicts: verdicts,
    revisionDirectives: directives,
    createdAt: data.created_at,
  };
}
