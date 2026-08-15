import { useState } from "react";
import { Bot, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { ChatWidget } from "@/components/ChatWidget";

/** Floating chat bubble, bottom-right on every page for signed-in users.
 *  Toggles the in-page ChatWidget panel — never navigates. */
export function ChatLauncher() {
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  if (loading || !user) return null;

  return (
    <>
      {open ? <ChatWidget onClose={() => setOpen(false)} /> : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close remix chat" : "Open remix chat"}
        aria-expanded={open}
        className="fixed bottom-6 right-6 z-50 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform hover:scale-105 hover:opacity-90"
      >
        {open ? <X className="size-6" /> : <Bot className="size-6" />}
      </button>
    </>
  );
}
