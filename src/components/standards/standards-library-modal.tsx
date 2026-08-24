"use client";

import { useEffect, useState, useTransition } from "react";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { listLibraryStandards, copyStandardIntoClass, type LibraryStandard } from "@/actions/standards-library";

const NO_SUBJECT = "Other / no subject set";

// Browses every OTHER class's standards this teacher can already see
// (scoped through the same access rules as the rest of the app — see
// standards-library.ts's comment) and copies one into the current class.
// Grouped by Class.subject since the library spans many classes/teachers —
// the per-standard `category` grouping on the main Standards page answers a
// different question (strands within one subject), not this one.
export function StandardsLibraryModal({
  open,
  onClose,
  classId,
  existingTitles,
}: {
  open: boolean;
  onClose: () => void;
  classId: string;
  existingTitles: Set<string>;
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [standards, setStandards] = useState<LibraryStandard[]>([]);
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedIds, setCopiedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    const timer = setTimeout(() => {
      listLibraryStandards(classId, search).then((res) => {
        setLoading(false);
        if (res.ok) setStandards(res.standards);
        else toast(res.error, "error");
      });
    }, 250); // debounce search keystrokes
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classId, search]);

  useEffect(() => {
    if (!open) { setSearch(""); setCopiedIds(new Set()); }
  }, [open]);

  function copy(standard: LibraryStandard) {
    setCopyingId(standard.id);
    start(async () => {
      const res = await copyStandardIntoClass(standard.id, classId);
      setCopyingId(null);
      if (res.ok) {
        toast(`Copied "${standard.title}" into this class.`);
        setCopiedIds((prev) => new Set(prev).add(standard.id));
      } else {
        toast(res.error ?? "Could not copy that standard.", "error");
      }
    });
  }

  const groups = new Map<string, LibraryStandard[]>();
  for (const s of standards) {
    const key = s.classSubject?.trim() || NO_SUBJECT;
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const sortedGroups = [...groups.entries()].sort(([a], [b]) => (a === NO_SUBJECT ? 1 : b === NO_SUBJECT ? -1 : a.localeCompare(b)));

  return (
    <Modal open={open} onClose={onClose} title="Standards library" className="max-w-2xl">
      <div className="space-y-3">
        <p className="text-xs text-slate-400">
          Browse standards from other classes and copy one into this class — including any Practice Mode unit link
          and question mapping already set up on it.
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            className="pl-8"
            placeholder="Search by title or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="max-h-[28rem] space-y-4 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-slate-400">Loading…</p>
          ) : standards.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              {search ? "No standards match that search." : "No standards found in your other classes yet."}
            </p>
          ) : (
            sortedGroups.map(([subject, list]) => (
              <div key={subject}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{subject}</p>
                <div className="space-y-1.5">
                  {list.map((s) => {
                    const alreadyHere = existingTitles.has(s.title.toLowerCase()) || copiedIds.has(s.id);
                    return (
                      <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {s.code && <Badge color="bg-slate-100 text-slate-600 border-slate-200">{s.code}</Badge>}
                            <span className="truncate text-sm font-medium text-slate-800">{s.title}</span>
                            {s.externalUnitSource && s.externalUnitId && (
                              <Badge color="bg-violet-100 text-violet-800 border-violet-200">
                                {s.externalUnitSource} #{s.externalUnitId}{s.hasQuestionMapping ? " · mapped" : ""}
                              </Badge>
                            )}
                          </div>
                          <p className="truncate text-xs text-slate-400">{s.className}</p>
                        </div>
                        <Button
                          size="sm"
                          variant={alreadyHere ? "outline" : "primary"}
                          disabled={copyingId === s.id}
                          onClick={() => copy(s)}
                        >
                          {copyingId === s.id ? "Copying…" : alreadyHere ? "Copy again" : "Copy into this class"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Done</Button>
        </div>
      </div>
    </Modal>
  );
}
