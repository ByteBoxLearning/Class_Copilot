"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  initial = 0,
}: {
  tabs: { label: string; badge?: number; content: React.ReactNode }[];
  initial?: number;
}) {
  const [active, setActive] = useState(initial);
  return (
    <div>
      <div className="scrollbar-thin mb-4 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setActive(i)}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active === i
                ? "border-primary text-primary"
                : "border-transparent text-slate-500 hover:text-slate-700",
            )}
          >
            {t.label}
            {t.badge != null && t.badge > 0 && (
              <span className="rounded-full bg-slate-200 px-1.5 text-xs text-slate-600">{t.badge}</span>
            )}
          </button>
        ))}
      </div>
      <div>{tabs[active]?.content}</div>
    </div>
  );
}
