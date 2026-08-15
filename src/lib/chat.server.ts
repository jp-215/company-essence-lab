import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { RemixDTO } from "./remix-types";
import type { RecommendedTrendDTO } from "./recommendations.server";
import type { loadCompanyContext } from "./remix.server";

type Client = SupabaseClient<Database>;

/** Compact chip snapshot persisted on messages so history renders deterministically. */
export type TrendChip = {
  trendKey: string;
  title: string;
  platform: string;
  views: number;
  similarity: number;
  matchType: "semantic" | "community" | "category";
};

export type ChatDTO = {
  id: string;
  companyId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessageDTO = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  trendSuggestions: TrendChip[];
  remix: RemixDTO | null;
  createdAt: string;
};

export function toChip(trend: RecommendedTrendDTO): TrendChip {
  return {
    trendKey: trend.trendKey,
    title: trend.title || trend.caption.slice(0, 70),
    platform: trend.platform,
    views: trend.views,
    similarity: trend.similarity,
    matchType: trend.matchType,
  };
}

function toChat(row: {
  id: string;
  company_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}): ChatDTO {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type MessageRow = {
  id: string;
  chat_id: string;
  role: string;
  content: string;
  trend_suggestions: Json | null;
  remix_id: string | null;
  created_at: string;
  company_remixes: {
    id: string;
    company_id: string;
    trend_key: string | null;
    trend_title: string;
    source_url: string;
    platform: string;
    hook: string;
    script: string;
    caption: string;
    hashtags: string[] | null;
    differentiator: string;
    created_at: string;
  } | null;
};

const MESSAGE_SELECT =
  "id, chat_id, role, content, trend_suggestions, remix_id, created_at, company_remixes(id, company_id, trend_key, trend_title, source_url, platform, hook, script, caption, hashtags, differentiator, created_at)";

function toMessage(row: MessageRow): ChatMessageDTO {
  const remix = row.company_remixes;
  return {
    id: row.id,
    chatId: row.chat_id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
    trendSuggestions: Array.isArray(row.trend_suggestions)
      ? (row.trend_suggestions as unknown as TrendChip[])
      : [],
    remix: remix
      ? {
          id: remix.id,
          companyId: remix.company_id,
          trendKey: remix.trend_key ?? "",
          trendTitle: remix.trend_title,
          sourceUrl: remix.source_url,
          platform: remix.platform,
          hook: remix.hook,
          script: remix.script,
          caption: remix.caption,
          hashtags: remix.hashtags ?? [],
          differentiator: remix.differentiator,
          createdAt: remix.created_at,
        }
      : null,
    createdAt: row.created_at,
  };
}

export async function createChat(
  client: Client,
  userId: string,
  companyId: string,
  title: string,
): Promise<ChatDTO> {
  const { data, error } = await client
    .from("remix_chats")
    .insert({ company_id: companyId, owner_id: userId, title })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toChat(data);
}

export async function listChats(
  client: Client,
  userId: string,
  companyId: string,
): Promise<ChatDTO[]> {
  const { data, error } = await client
    .from("remix_chats")
    .select("*")
    .eq("owner_id", userId)
    .eq("company_id", companyId)
    .order("updated_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return (data ?? []).map(toChat);
}

/** Returns the chat only if the signed-in user owns it (RLS also enforces this). */
export async function getOwnedChat(
  client: Client,
  userId: string,
  chatId: string,
): Promise<ChatDTO> {
  const { data, error } = await client
    .from("remix_chats")
    .select("*")
    .eq("id", chatId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Chat not found.");
  return toChat(data);
}

export async function listMessages(client: Client, chatId: string): Promise<ChatMessageDTO[]> {
  const { data, error } = await client
    .from("remix_chat_messages")
    .select(MESSAGE_SELECT)
    .eq("chat_id", chatId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as MessageRow[]).map(toMessage);
}

export async function appendMessage(
  client: Client,
  userId: string,
  input: {
    chatId: string;
    role: "user" | "assistant";
    content: string;
    chips?: TrendChip[];
    remixId?: string;
  },
): Promise<ChatMessageDTO> {
  const { data, error } = await client
    .from("remix_chat_messages")
    .insert({
      chat_id: input.chatId,
      owner_id: userId,
      role: input.role,
      content: input.content,
      trend_suggestions: input.chips ? (input.chips as unknown as Json) : null,
      remix_id: input.remixId ?? null,
    })
    .select(MESSAGE_SELECT)
    .single();
  if (error) throw new Error(error.message);

  // Bump the thread so the sidebar sorts by recency.
  await client
    .from("remix_chats")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", input.chatId);

  return toMessage(data as unknown as MessageRow);
}

type CompanyContext = Awaited<ReturnType<typeof loadCompanyContext>>;

const CHAT_HISTORY_LIMIT = 12;

/**
 * Conversational reply only — trend chips always come from the recommendation
 * engine, never from the model, so trend keys can't be hallucinated.
 */
export async function assistantReply(payload: {
  company: CompanyContext;
  recommendations: RecommendedTrendDTO[];
  history: ChatMessageDTO[];
  userMessage: string;
}): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const { company, recommendations, history, userMessage } = payload;
  const trendLines = recommendations
    .map(
      (trend, index) =>
        `${index + 1}. [${trend.trendKey}] ${trend.title || trend.caption.slice(0, 70)} — ${trend.format || "viral format"}, ${trend.views} views, match ${(trend.similarity * 100).toFixed(0)}%`,
    )
    .join("\n");

  const systemPrompt = [
    "You are Vira, a viral-ad strategist chatting with a brand owner.",
    "The app shows the recommended trends below as tappable suggestion chips under your reply.",
    "Write 1-3 short sentences framing why these trends fit what the user asked for.",
    "Only reference trends from the provided list. Never invent trends, keys or metrics.",
    "Do not list the trends one by one — the chips already do that. No markdown.",
    "",
    `Brand: ${company.name}`,
    `Category: ${company.category}`,
    `Bio: ${company.bio}`,
    `Mission: ${company.mission}`,
    company.positioning ? `Positioning: ${company.positioning}` : "",
    company.tone ? `Tone: ${company.tone}` : "",
    company.adThemes?.length ? `Ad themes: ${company.adThemes.join(", ")}` : "",
    "",
    "Recommended trends (shown as chips):",
    trendLines || "(none — tell the user to try describing what they want differently)",
  ]
    .filter(Boolean)
    .join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-CHAT_HISTORY_LIMIT).map((message) => ({
      role: message.role,
      content: message.content,
    })),
    { role: "user", content: userMessage },
  ];

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "google/gemini-3.5-flash", messages }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error(`AI gateway failed [${response.status}]: ${body}`);
    throw new Error(`Chat reply failed [${response.status}].`);
  }

  const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const reply = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!reply) throw new Error("The reply came back empty.");
  return reply;
}
