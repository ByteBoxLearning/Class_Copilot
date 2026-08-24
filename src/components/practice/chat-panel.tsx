"use client";

import { useState } from "react";
import { MessageCircle, ChevronDown, ChevronUp, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { ChemText } from "@/lib/practice/chem-text";
import type { ChatMessage } from "@/lib/practice/types";

export function ChatPanel({
  history,
  onSend,
}: {
  history: ChatMessage[];
  onSend: (message: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const text = message.trim();
    if (!text || sending) return;
    setMessage("");
    setSending(true);
    try {
      await onSend(text);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
        <MessageCircle className="h-3.5 w-3.5" /> Ask a follow-up {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {history.length > 0 && (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-border bg-slate-50 p-2">
              {history.map((m, i) => (
                <p key={i} className={`text-xs ${m.role === "user" ? "text-slate-700" : "text-slate-600"}`}>
                  <span className="font-medium">{m.role === "user" ? "You: " : "Tutor: "}</span><ChemText text={m.content} />
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Ask why this answer is correct…"
              disabled={sending}
            />
            <Button size="sm" onClick={send} disabled={sending || !message.trim()}><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      )}
    </div>
  );
}
