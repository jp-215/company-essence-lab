import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Bot, X } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { RemixCard } from "@/components/RemixCard";

const compact = new Intl.NumberFormat("en", { notation: "compact" });

/** The floating mini chat bot panel — everything happens in place, no navigation. */
export function ChatWidget({ onClose }: { onClose: () => void }) {
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
    <div className="fixed bottom-24 right-6 z-50 flex h-[min(600px,calc(100vh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl">
      <div className="flex items-center justify-between gap-2 border-b border-border bg-foreground px-4 py-3 text-background">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-full bg-background/15">
            <Bot className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold leading-tight">Vira</p>
            <p className="text-[11px] leading-tight opacity-70">Trend recommendations & remixes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => startMutation.mutate()}
            disabled={!companyId || startMutation.isPending}
            className="rounded-full px-2 py-1 text-[11px] font-medium opacity-80 transition-opacity hover:opacity-100 disabled:opacity-40"
          >
            New chat
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="rounded-full p-1 opacity-80 transition-opacity hover:opacity-100"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {(companies.data?.length ?? 0) > 1 ? (
        <div className="border-b border-border px-3 py-2">
          <Select
            value={companyId ?? ""}
            onValueChange={(value) => {
              setCompanyId(value);
              setChatId(null);
            }}
          >
            <SelectTrigger className="h-8 w-full text-xs">
              <SelectValue placeholder="Select a company" />
            </SelectTrigger>
            <SelectContent>
              {companies.data!.map((company) => (
                <SelectItem key={company.id} value={company.id}>
                  {company.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-3">
        {companies.isSuccess && !companies.data.length ? (
          <p className="p-2 text-sm text-muted-foreground">
            List a company first — recommendations run off your brand profile.
          </p>
        ) : messages.isLoading ||
          (!messages.data &&
            (startMutation.isPending || chats.isLoading || companies.isLoading)) ? (
          <>
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="h-10 w-1/2 self-end" />
          </>
        ) : (
          (messages.data ?? []).map((message) => (
            <WidgetBubble
              key={message.id}
              message={message}
              onChipClick={(trendKey) => chipMutation.mutate(trendKey)}
              chipPending={chipMutation.isPending}
              pendingTrendKey={chipMutation.isPending ? (chipMutation.variables ?? null) : null}
            />
          ))
        )}

        {sendMutation.isPending ? (
          <div className="max-w-[85%] self-end rounded-2xl bg-primary px-3 py-2 text-xs text-primary-foreground opacity-70">
            {sendMutation.variables}
          </div>
        ) : null}
        {sendMutation.isPending || chipMutation.isPending ? (
          <p className="text-[11px] text-muted-foreground">
            {chipMutation.isPending ? "Remixing that trend for you…" : "Vira is thinking…"}
          </p>
        ) : null}
        <div ref={bottomRef} />
      </div>

      <form
        className="flex items-end gap-2 border-t border-border p-2"
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
          placeholder="Ask for a trend… e.g. 'something for a launch'"
          className="min-h-[38px] flex-1 resize-none border-0 text-sm shadow-none focus-visible:ring-0"
          rows={1}
          maxLength={500}
        />
        <button
          type="submit"
          disabled={!draft.trim() || !chatId || sendMutation.isPending}
          className="rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

function WidgetBubble({
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
      <div className="max-w-[85%] self-end rounded-2xl bg-primary px-3 py-2 text-xs text-primary-foreground">
        {message.content}
      </div>
    );
  }

  return (
    <div className="flex max-w-full flex-col gap-2 self-start">
      <div className="max-w-[90%] rounded-2xl bg-secondary/60 px-3 py-2 text-xs text-foreground">
        {message.content}
      </div>

      {message.trendSuggestions.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {message.trendSuggestions.map((chip) => (
            <WidgetChip
              key={`${message.id}-${chip.trendKey}`}
              chip={chip}
              disabled={chipPending}
              pending={pendingTrendKey === chip.trendKey}
              onClick={() => onChipClick(chip.trendKey)}
            />
          ))}
        </div>
      ) : null}

      {message.remix ? (
        <div className="max-w-full text-xs [&_pre]:text-xs">
          <RemixCard remix={message.remix} />
        </div>
      ) : null}
    </div>
  );
}

function WidgetChip({
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
      className="flex max-w-full items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-left text-[11px] transition-colors hover:border-foreground/40 disabled:opacity-60"
    >
      <span className="line-clamp-1 font-medium text-foreground">
        {pending ? "Remixing…" : chip.title}
      </span>
      <span className="shrink-0 text-muted-foreground">{compact.format(chip.views)} views</span>
    </button>
  );
}
