"use client";

import { useMemo, useRef, useState } from "react";
import { AtSign } from "lucide-react";
import { Textarea } from "@/components/ui/field";
import { mentionHandle } from "@/lib/mentions";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; role?: string };

// A textarea with a lightweight @-mention picker. Type "@" to open a dropdown of
// team members; pick one to insert "@Handle". On save, the server parses these
// and notifies the mentioned person. Submits its value via a plain textarea
// named `name`, so it drops into existing <form action> handlers unchanged.
export function MentionTextarea({
  name,
  defaultValue = "",
  people,
  placeholder,
  className,
  rows,
}: {
  name: string;
  defaultValue?: string;
  people: Person[];
  placeholder?: string;
  className?: string;
  rows?: number;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState(0); // index of the '@' being completed
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLTextAreaElement>(null);

  const handled = useMemo(
    () => people.map((p) => ({ ...p, handle: mentionHandle(p.name, people) })),
    [people],
  );

  const matches = useMemo(() => {
    if (!open) return [];
    const q = query.toLowerCase();
    return handled
      .filter((p) => p.handle.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [open, query, handled]);

  function detect(text: string, caret: number) {
    // An active mention is an "@word" ending at the caret, preceded by start/space.
    const upto = text.slice(0, caret);
    const m = upto.match(/(?:^|\s)@([A-Za-z0-9]*)$/);
    if (m) {
      setQuery(m[1]);
      setAnchor(caret - m[1].length - 1);
      setActive(0);
      setOpen(true);
    } else {
      setOpen(false);
    }
  }

  function choose(p: { handle: string }) {
    const before = value.slice(0, anchor);
    const after = value.slice(anchor + 1 + query.length); // skip '@' + typed query
    const insert = `@${p.handle} `;
    const next = before + insert + after;
    setValue(next);
    setOpen(false);
    const pos = (before + insert).length;
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || matches.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % matches.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => (i - 1 + matches.length) % matches.length); }
    else if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); choose(matches[active]); }
    else if (e.key === "Escape") { setOpen(false); }
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        name={name}
        value={value}
        placeholder={placeholder}
        rows={rows}
        className={className}
        onChange={(e) => { setValue(e.target.value); detect(e.target.value, e.target.selectionStart ?? 0); }}
        onKeyDown={onKeyDown}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onClick={(e) => detect(value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
      />
      {open && matches.length > 0 && (
        <div className="absolute left-2 top-full z-20 mt-1 w-56 overflow-hidden rounded-md border border-border bg-white shadow-lg">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wide text-slate-400">
            <AtSign className="h-3 w-3" /> Mention someone
          </div>
          {matches.map((p, i) => (
            <button
              key={p.id}
              type="button"
              // onMouseDown (not onClick) so it fires before the textarea blur closes us.
              onMouseDown={(e) => { e.preventDefault(); choose(p); }}
              className={cn(
                "flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm",
                i === active ? "bg-primary text-white" : "text-slate-700 hover:bg-accent",
              )}
            >
              <span className="truncate">{p.name}</span>
              <span className={cn("shrink-0 text-xs", i === active ? "text-white/70" : "text-slate-400")}>
                @{p.handle}{p.role === "OWNER" ? " · Admin" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-400">Type <span className="font-medium">@</span> to notify a teammate.</p>
    </div>
  );
}
