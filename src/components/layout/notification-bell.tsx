"use client";

import { useEffect, useState, useRef } from "react";
import { Bell, Check } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

type Notification = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) setItems(await res.json());
    } catch {
      /* ignore polling errors */
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const unread = items.filter((i) => !i.read).length;

  async function markAll() {
    await fetch("/api/notifications", { method: "POST", body: JSON.stringify({ all: true }) });
    load();
  }

  async function markOne(id: string) {
    await fetch("/api/notifications", { method: "POST", body: JSON.stringify({ id }) });
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, read: true } : i)));
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5 text-slate-600" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-xl border border-border bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-sm font-semibold">Notifications</span>
            {unread > 0 && (
              <button onClick={markAll} className="flex items-center gap-1 text-xs text-primary hover:underline">
                <Check className="h-3 w-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications</p>
            ) : (
              items.map((n) => {
                const body = (
                  <div
                    className={cn(
                      "border-b border-border px-4 py-3 last:border-0 hover:bg-slate-50",
                      !n.read && "bg-sky-50/50",
                    )}
                    onClick={() => !n.read && markOne(n.id)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{n.title}</p>
                      {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-500" />}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{n.message}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{relativeTime(n.createdAt)}</p>
                  </div>
                );
                return <div key={n.id}>{body}</div>;
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
