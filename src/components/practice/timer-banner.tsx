"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { getRemainingSeconds, formatDuration } from "@/lib/practice/timer";

export function TimerBanner({ endTimestamp, onExpire }: { endTimestamp: number; onExpire: () => void }) {
  const [remaining, setRemaining] = useState(() => getRemainingSeconds(endTimestamp, Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      const r = getRemainingSeconds(endTimestamp, Date.now());
      setRemaining(r);
      if (r <= 0) { clearInterval(id); onExpire(); }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endTimestamp]);

  const low = remaining <= 60;

  return (
    <div className={`sticky top-0 z-10 flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium ${low ? "border-red-200 bg-red-50 text-red-700" : "border-border bg-slate-50 text-slate-600"}`}>
      <Clock className="h-4 w-4" /> {formatDuration(remaining)} remaining
    </div>
  );
}
