import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  appendMessage,
  assistantReply,
  createChat,
  getOwnedChat,
  listChats,
  listMessages,
  toChip,
} from "./chat.server";
import { getRecommendedTrends, getTrendByKey } from "./recommendations.server";
import { loadCompanyContext, remixTrend, saveRemix } from "./remix.server";

const CHIP_COUNT = 6;

export const listMyChats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) =>
    listChats(context.supabase, context.userId, data.companyId),
  );

export const getChatMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ chatId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    await getOwnedChat(context.supabase, context.userId, data.chatId);
    return listMessages(context.supabase, data.chatId);
  });

export const startChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const company = await loadCompanyContext(context.supabase, context.userId, data.companyId);
    const chat = await createChat(
      context.supabase,
      context.userId,
      data.companyId,
      `${company.name} — remix chat`,
    );

    // No explicit seed: the server draws a fresh random one, so every new chat
    // opens with a different mix.
    const recommendations = await getRecommendedTrends(context.supabase, data.companyId, {
      limit: CHIP_COUNT,
      surface: "chat",
      ownerId: context.userId,
    });

    // Templated greeting — no LLM call, so opening a chat is instant.
    const greeting = await appendMessage(context.supabase, context.userId, {
      chatId: chat.id,
      role: "assistant",
      content: recommendations.length
        ? `Here's what's blowing up right now that fits ${company.name} — tap one to remix it into an ad, or tell me what you're launching.`
        : `I couldn't find trends for ${company.name} yet — the trend index may still be building. Tell me what you're launching and I'll try to match something.`,
      chips: recommendations.map(toChip),
    });

    return { chat, messages: [greeting] };
  });

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ chatId: z.string().uuid(), message: z.string().trim().min(1).max(500) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const chat = await getOwnedChat(context.supabase, context.userId, data.chatId);
    const company = await loadCompanyContext(context.supabase, context.userId, chat.companyId);
    const history = await listMessages(context.supabase, chat.id);

    const userMessage = await appendMessage(context.supabase, context.userId, {
      chatId: chat.id,
      role: "user",
      content: data.message,
    });

    const recommendations = await getRecommendedTrends(context.supabase, chat.companyId, {
      limit: CHIP_COUNT,
      queryText: data.message,
      surface: "chat",
      ownerId: context.userId,
    });

    let reply: string;
    try {
      reply = await assistantReply({
        company,
        recommendations,
        history,
        userMessage: data.message,
      });
    } catch (error) {
      // Chips still ship even when the LLM is down or unconfigured.
      console.error("Assistant reply failed", error);
      reply = recommendations.length
        ? "Here are the trends that best match that — tap one to remix it."
        : "I couldn't match any trends to that yet — try describing the product or the moment you want to capture.";
    }

    const assistantMessage = await appendMessage(context.supabase, context.userId, {
      chatId: chat.id,
      role: "assistant",
      content: reply,
      chips: recommendations.map(toChip),
    });

    return { messages: [userMessage, assistantMessage] };
  });

export const remixTrendInChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ chatId: z.string().uuid(), trendKey: z.string().trim().min(3).max(60) })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const chat = await getOwnedChat(context.supabase, context.userId, data.chatId);
    const company = await loadCompanyContext(context.supabase, context.userId, chat.companyId);
    const trend = await getTrendByKey(context.supabase, data.trendKey);
    if (!trend) throw new Error("That trend no longer exists.");

    const output = await remixTrend({ trend, company });
    const remix = await saveRemix(context.supabase, context.userId, {
      companyId: chat.companyId,
      trend,
      output,
    });

    const message = await appendMessage(context.supabase, context.userId, {
      chatId: chat.id,
      role: "assistant",
      content: `Done — here's your take on "${trend.title || trend.trendKey}".`,
      remixId: remix.id,
    });

    return { message };
  });
