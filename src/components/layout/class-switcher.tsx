"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown, Check, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { switchClass } from "@/actions/classes";

export type SwitcherClass = { id: string; name: string; subject: string | null; archived: boolean };

// Header control for staff to pick the "current class" they're working on.
// Persisted per user.
export function ClassSwitcher({
  classes,
  currentClassId,
}: {
  classes: SwitcherClass[];
  currentClassId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const current = classes.find((c) => c.id === currentClassId) ?? classes[0];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function pick(id: string) {
    setOpen(false);
    if (id === currentClassId) return;
    start(() => { void switchClass(id, pathname); });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={pending}
        className="flex max-w-[220px] items-center gap-1.5 rounded-md border border-border bg-white px-2.5 py-1.5 text-sm hover:bg-accent disabled:opacity-60"
        title="Switch class"
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <span className="truncate font-medium text-slate-700">{current?.name ?? "Pick class"}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 max-h-[60vh] w-64 overflow-auto rounded-xl border border-border bg-white py-1 shadow-lg">
          <p className="px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">Working on</p>
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                c.id === currentClassId ? "text-primary" : "text-slate-700",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.name}</span>
                <span className="block truncate text-xs text-slate-400">
                  {c.subject ?? "—"}{c.archived ? " · archived" : ""}
                </span>
              </span>
              {c.id === currentClassId && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
