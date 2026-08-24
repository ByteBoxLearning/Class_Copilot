"use client";

import { useState } from "react";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Input } from "@/components/ui/field";
import { ASSIGNMENT_SECTION_KINDS, MASTERY_LEVELS } from "@/lib/enums";
import type { AssignmentSection, AssignmentSectionKind, RubricCriterion } from "@/lib/assignments/types";

const TEXT_KINDS = new Set<AssignmentSectionKind>(["instructions", "activity", "answer_key", "notes"]);
const ITEMS_KINDS = new Set<AssignmentSectionKind>(["questions", "materials"]);

function blankSection(kind: AssignmentSectionKind): AssignmentSection {
  if (TEXT_KINDS.has(kind)) return { kind, heading: "", text: "" } as AssignmentSection;
  if (ITEMS_KINDS.has(kind)) return { kind, heading: "", items: [] } as AssignmentSection;
  return { kind: "rubric", heading: "", criteria: [] };
}

// Exactly-4-columns view of a rubric row's levels, regardless of what's
// actually stored — pads/truncates for display, always writes back 4. See
// assignments/types.ts's comment on RubricCriterion for why.
function fourLevels(levels: string[]): string[] {
  const out = levels.slice(0, 4);
  while (out.length < 4) out.push("");
  return out;
}

export function SectionEditor({
  sections,
  onChange,
}: {
  sections: AssignmentSection[];
  onChange: (sections: AssignmentSection[]) => void;
}) {
  const [newKind, setNewKind] = useState<AssignmentSectionKind>("instructions");

  function update(index: number, next: AssignmentSection) {
    onChange(sections.map((s, i) => (i === index ? next : s)));
  }
  function remove(index: number) {
    onChange(sections.filter((_, i) => i !== index));
  }
  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }
  function add() {
    onChange([...sections, blankSection(newKind)]);
  }

  return (
    <div className="space-y-3">
      {sections.length === 0 && (
        <p className="rounded-lg border border-dashed border-border py-6 text-center text-sm text-slate-400">
          No sections yet — generate a draft, or add one manually below.
        </p>
      )}

      {sections.map((section, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <GripVertical className="h-4 w-4 shrink-0 text-slate-300" />
            <span className="shrink-0 rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
              {ASSIGNMENT_SECTION_KINDS.find((k) => k.value === section.kind)?.label ?? section.kind}
            </span>
            <Input
              value={section.heading}
              onChange={(e) => update(i, { ...section, heading: e.target.value })}
              placeholder="Heading"
              className="h-8 flex-1"
            />
            <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:bg-accent disabled:opacity-30" title="Move up">↑</button>
            <button type="button" onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="rounded p-1 text-slate-400 hover:bg-accent disabled:opacity-30" title="Move down">↓</button>
            <button type="button" onClick={() => remove(i)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" title="Remove section">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {TEXT_KINDS.has(section.kind) && "text" in section && (
            <Textarea
              value={section.text}
              onChange={(e) => update(i, { ...section, text: e.target.value })}
              className="min-h-[100px]"
              placeholder="Content…"
            />
          )}

          {ITEMS_KINDS.has(section.kind) && "items" in section && (
            <Textarea
              value={section.items.join("\n")}
              onChange={(e) => update(i, { ...section, items: e.target.value.split("\n") })}
              className="min-h-[100px]"
              placeholder={"One item per line…"}
            />
          )}

          {section.kind === "rubric" && (
            <RubricEditor
              criteria={section.criteria}
              onChange={(criteria) => update(i, { ...section, criteria })}
            />
          )}
        </div>
      ))}

      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-2">
        <Select value={newKind} onChange={(e) => setNewKind(e.target.value as AssignmentSectionKind)} className="h-8 w-auto">
          {ASSIGNMENT_SECTION_KINDS.map((k) => (
            <option key={k.value} value={k.value}>{k.label}</option>
          ))}
        </Select>
        <Button type="button" size="sm" variant="outline" onClick={add}><Plus className="h-3.5 w-3.5" /> Add section</Button>
      </div>
    </div>
  );
}

function RubricEditor({ criteria, onChange }: { criteria: RubricCriterion[]; onChange: (criteria: RubricCriterion[]) => void }) {
  function updateRow(i: number, next: RubricCriterion) {
    onChange(criteria.map((c, idx) => (idx === i ? next : c)));
  }
  function removeRow(i: number) {
    onChange(criteria.filter((_, idx) => idx !== i));
  }
  function addRow() {
    onChange([...criteria, { name: "", levels: ["", "", "", ""] }]);
  }

  return (
    <div className="space-y-2">
      {criteria.length === 0 && <p className="py-2 text-center text-xs text-slate-400">No rubric rows yet.</p>}
      {criteria.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="text-left text-slate-400">
                <th className="w-40 pb-1 pr-2 font-medium">Criterion</th>
                {MASTERY_LEVELS.map((l) => (
                  <th key={l.value} className="pb-1 pr-2 font-medium">{l.label}</th>
                ))}
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {criteria.map((row, i) => {
                const levels = fourLevels(row.levels);
                return (
                  <tr key={i} className="align-top">
                    <td className="pr-2 pb-2">
                      <Input value={row.name} onChange={(e) => updateRow(i, { ...row, name: e.target.value })} placeholder="e.g. Accuracy" className="h-8" />
                    </td>
                    {levels.map((level, li) => (
                      <td key={li} className="pr-2 pb-2">
                        <Textarea
                          value={level}
                          onChange={(e) => {
                            const nextLevels = [...levels];
                            nextLevels[li] = e.target.value;
                            updateRow(i, { ...row, levels: nextLevels });
                          }}
                          className="min-h-[60px] text-xs"
                        />
                      </td>
                    ))}
                    <td className="pb-2">
                      <button type="button" onClick={() => removeRow(i)} className="rounded p-1 text-red-400 hover:bg-red-50 hover:text-red-600" title="Remove row">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Button type="button" size="sm" variant="outline" onClick={addRow}><Plus className="h-3.5 w-3.5" /> Add criterion</Button>
    </div>
  );
}
