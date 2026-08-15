import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { listMyCompanies } from "@/lib/owner.functions";
import {
  getChatMessages,
  listMyChats,
  remixTrendInChat,
  sendChatMessage,
  startChat,
} from "@/lib/chat.functions";
import type { ChatMessageDTO, TrendChip } from "@/lib/chat.server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RemixCard } from "@/components/RemixCard";

export const Route = createFileRoute("/_authenticated/chat")({
  head: () => ({
    meta: [
      { title: "Remix chat — Vira" },
      {
        name: "description",
        content:
          "Chat with Vira: it recommends the viral trends that fit your brand and remixes them into ads in the thread.",
      },
      { property: "og:title", content: "Remix chat — Vira" },
      {
        property: "og:description",
        content: "Trend recommendations and ad generation, in one conversation.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RemixChat,
});

const compact = new Intl.NumberFormat("en", { notation: "compact" });

function RemixChat() {
  const queryClient = useQueryClient();
  const fetchCompanies = useServerFn(listMyCompanies);
  const fetchChats = useServerFn(listMyChats);
  const fetchMessages = useServerFn(getChatMessages);
  const createChat = useServerFn(startChat);
  const sendMessage = useServerFn(sendChatMessage);
  const remixChip = useServerFn(remixTrendInChat);

  const [companyId, setCompanyId] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const companies = useQuery({ queryKey: ["my-companies"], queryFn: () => fetchCompanies() });

  useEffect(() => {
    if (!companyId && companies.data?.length) {
      setCompanyId(companies.data[0]!.id);
    }
  }, [companies.data, companyId]);

  const chats = useQuery({
    queryKey: ["chats", companyId],
    queryFn: () => fetchChats({ data: { companyId: companyId! } }),
    enabled: Boolean(companyId),
  });

  const startMutation = useMutation({
    mutationFn: () => createChat({ data: { companyId: companyId! } }),
    onSuccess: (result) => {
      queryClient.setQueryData(["chat-messages", result.chat.id], result.messages);
      void queryClient.invalidateQueries({ queryKey: ["chats", companyId] });
      setChatId(result.chat.id);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Couldn't start the chat."),
  });

  // Resume the latest thread for the selected company, or start a fresh one.
  useEffect(() => {
    if (!companyId || !chats.data || chatId) return;
    if (chats.data.length > 0) {
      setChatId(chats.data[0]!.id);
    } else if (!startMutation.isPending) {
      startMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, chats.data, chatId]);

  const messages = useQuery({
    queryKey: ["chat-messages", chatId],
    queryFn: () => fetchMessages({ data: { chatId: chatId! } }),
    enabled: Boolean(chatId),
  });

  const appendToThread = (incoming: ChatMessageDTO[]) => {
    queryClient.setQueryData<ChatMessageDTO[]>(["chat-messages", chatId], (existing) => [
      ...(existing ?? []),
      ...incoming,
    ]);
  };

  const sendMutation = useMutation({
    mutationFn: (message: string) => sendMessage({ data: { chatId: chatId!, message } }),
    onSuccess: (result) => appendToThread(result.messages),
    onError: (error) => toast.error(error instanceof Error ? error.message : "Send failed."),
  });

  const chipMutation = useMutation({
    mutationFn: (trendKey: string) => remixChip({ data: { chatId: chatId!, trendKey } }),
    onSuccess: (result) => {
      appendToThread([result.message]);
      void queryClient.invalidateQueries({ queryKey: ["remixes", companyId] });
      toast.success("Your version is ready.");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Remix failed."),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.data?.length, sendMutation.isPending, chipMutation.isPending]);

  const handleSend = () => {
    const message = draft.trim();
    if (!message || !chatId || sendMutation.isPending) return;
    setDraft("");
    sendMutation.mutate(message);
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-4 py-10">
      <header>
        <p className="text-xs uppercase tracking-[0.25em] text-muted-foreground">Remix chat</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight text-foreground">
          Tell Vira what you're launching
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Vira recommends the viral trends most talked about right now that fit your brand — tap a
          suggestion to remix it into a shoot-ready ad, or describe what you want in your own words.
        </p>
      </header>

      {companies.isLoading ? (
        <Skeleton className="mt-8 h-24 w-full" />
      ) : !companies.data?.length ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-start gap-3 p-6">
            <p className="text-sm text-muted-foreground">
              List a company first — recommendations run off your brand profile.
            </p>
            <Button asChild size="sm">
              <Link to="/studio/new">List a company</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            {companies.data.map((company) => (
              <Button
                key={company.id}
                variant={company.id === companyId ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setCompanyId(company.id);
                  setChatId(null);
                }}
              >
                {company.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={!companyId || startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              {startMutation.isPending ? "Starting…" : "New chat"}
            </Button>
          </div>

          <div className="mt-6 flex flex-col gap-4">
            {messages.isLoading ||
            (!messages.data && (startMutation.isPending || chats.isLoading)) ? (
              <>
                <Skeleton className="h-20 w-3/4" />
                <Skeleton className="h-12 w-1/2 self-end" />
              </>
            ) : (
              (messages.data ?? []).map((message) => (
                <ChatBubble
                  key={message.id}
                  message={message}
                  onChipClick={(trendKey) => chipMutation.mutate(trendKey)}
                  chipPending={chipMutation.isPending}
                  pendingTrendKey={chipMutation.isPending ? (chipMutation.variables ?? null) : null}
                />
              ))
            )}

            {sendMutation.isPending ? (
              <div className="self-end rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground opacity-70">
                {sendMutation.variables}
              </div>
            ) : null}
            {sendMutation.isPending || chipMutation.isPending ? (
              <p className="text-xs text-muted-foreground">
                {chipMutation.isPending ? "Remixing that trend for you…" : "Vira is thinking…"}
              </p>
            ) : null}
            <div ref={bottomRef} />
          </div>

          <form
            className="sticky bottom-4 mt-8 flex items-end gap-2 rounded-xl border border-border bg-background p-3 shadow-sm"
            onSubmit={(event) => {
              event.preventDefault();
              handleSend();
            }}
          >
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSend();
                }
              }}
              placeholder='e.g. "something for a product launch" or "funny, low budget"'
              className="min-h-[44px] resize-none border-0 shadow-none focus-visible:ring-0"
              rows={1}
              maxLength={500}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!draft.trim() || !chatId || sendMutation.isPending}
            >
              Send
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

function ChatBubble({
  message,
  onChipClick,
  chipPending,
  pendingTrendKey,
}: {
  message: ChatMessageDTO;
  onChipClick: (trendKey: string) => void;
  chipPending: boolean;
  pendingTrendKey: string | null;
}) {
  if (message.role === "user") {
    return (
      <div className="max-w-[85%] self-end rounded-2xl bg-primary px-4 py-3 text-sm text-primary-foreground">
        {message.content}
      </div>
    );
  }

  return (
    <div className="flex max-w-full flex-col gap-3 self-start">
      <div className="max-w-[85%] rounded-2xl bg-secondary/60 px-4 py-3 text-sm text-foreground">
        {message.content}
      </div>

      {message.trendSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {message.trendSuggestions.map((chip) => (
            <TrendChipButton
              key={`${message.id}-${chip.trendKey}`}
              chip={chip}
              disabled={chipPending}
              pending={pendingTrendKey === chip.trendKey}
              onClick={() => onChipClick(chip.trendKey)}
            />
          ))}
        </div>
      ) : null}

      {message.remix ? <RemixCard remix={message.remix} /> : null}
    </div>
  );
}

function TrendChipButton({
  chip,
  disabled,
  pending,
  onClick,
}: {
  chip: TrendChip;
  disabled: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex max-w-full items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-left text-xs transition-colors hover:border-foreground/40 disabled:opacity-60"
    >
      <span className="line-clamp-1 font-medium text-foreground">
        {pending ? "Remixing…" : chip.title}
      </span>
      <Badge variant="secondary" className="shrink-0">
        {compact.format(chip.views)} views
      </Badge>
      {chip.matchType === "semantic" && chip.similarity > 0 ? (
        <span className="shrink-0 text-muted-foreground">
          {Math.round(chip.similarity * 100)}% match
        </span>
      ) : (
        <span className="shrink-0 text-muted-foreground">from your category</span>
      )}
    </button>
  );
}
