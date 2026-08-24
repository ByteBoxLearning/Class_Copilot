// A lightweight, dependency-free SVG ring — no recharts needed for a single
// value, unlike MasteryDistributionChart's full bar chart. Purely
// presentational (no hooks/handlers), so it renders fine straight from a
// server component. Color bands mirror BADGE_COLORS' 1-4 mastery hues via
// the same 55/70/85 thresholds grading-math.ts's default level bands use,
// so a student sees the same red/amber/sky/emerald language everywhere else
// mastery is shown.
export function MasteryDial({ percent, label }: { percent: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  const size = 104;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - clamped / 100);
  const color = clamped >= 85 ? "#10b981" : clamped >= 70 ? "#0ea5e9" : clamped >= 55 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-xl font-bold text-slate-800">{Math.round(clamped)}%</span>
      </div>
      <p className="text-center text-xs text-slate-500">{label}</p>
    </div>
  );
}
