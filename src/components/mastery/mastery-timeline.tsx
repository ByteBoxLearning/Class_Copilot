import { Badge } from "@/components/ui/badge";
import { BADGE_COLORS, labelOf, MASTERY_LEVELS, MASTERY_EVIDENCE_TYPES } from "@/lib/enums";
import { formatDate } from "@/lib/utils";

type EventRow = { id: string; level: number; evidenceType: string; evidenceNote: string | null; recordedAt: Date; recordedByName: string };
type StandardGroup = {
  standardId: string;
  code: string | null;
  title: string;
  current: { level: number | null; rawAverage: number | null; sampleSize: number };
  events: EventRow[];
};

// Read-only display — no client interactivity needed, recording happens on
// the /classes/mastery roster page.
export function MasteryTimeline({ groups }: { groups: StandardGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm text-slate-400">No standards defined yet for this student's classes.</p>;
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <div key={g.standardId} className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {g.code && <Badge color="bg-slate-100 text-slate-600 border-slate-200">{g.code}</Badge>}
              <p className="text-sm font-medium text-slate-800">{g.title}</p>
            </div>
            {g.current.level ? (
              <span className="flex items-center gap-1.5">
                <Badge color={BADGE_COLORS[String(g.current.level)]}>{labelOf(MASTERY_LEVELS, String(g.current.level))}</Badge>
                <span className="text-xs text-slate-400">n={g.current.sampleSize}</span>
              </span>
            ) : (
              <span className="text-xs text-slate-300">No evidence yet</span>
            )}
          </div>
          {g.events.length > 0 && (
            <ul className="mt-2 space-y-1.5 border-t border-border pt-2">
              {g.events.map((e) => (
                <li key={e.id} className="flex items-start gap-2 text-xs text-slate-500">
                  <Badge color={BADGE_COLORS[String(e.level)]}>{e.level}</Badge>
                  <span className="flex-1">
                    {labelOf(MASTERY_EVIDENCE_TYPES, e.evidenceType)}
                    {e.evidenceNote ? ` — "${e.evidenceNote}"` : ""}
                    <span className="ml-1 text-slate-400">by {e.recordedByName}, {formatDate(e.recordedAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
