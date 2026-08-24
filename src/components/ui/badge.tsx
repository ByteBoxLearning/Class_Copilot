import { cn } from "@/lib/utils";
import { BADGE_COLORS, labelOf, PRIORITIES, type Option } from "@/lib/enums";

export function Badge({
  className,
  color,
  children,
}: {
  className?: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
        color ?? "bg-slate-100 text-slate-700 border-slate-200",
        className,
      )}
    >
      {children}
    </span>
  );
}

function EnumBadge({ value, options }: { value?: string | null; options: Option[] }) {
  if (!value) return <span className="text-slate-400">—</span>;
  return <Badge color={BADGE_COLORS[value]}>{labelOf(options, value)}</Badge>;
}

export const PriorityBadge = ({ value }: { value?: string | null }) => (
  <EnumBadge value={value} options={PRIORITIES} />
);
