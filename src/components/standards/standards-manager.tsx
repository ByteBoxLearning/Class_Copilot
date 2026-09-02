"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Plus, Trash2, Pencil, Upload, Library } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { createStandard, updateStandard, toggleStandard, deleteStandard } from "@/actions/standards";
import type { ActionResult } from "@/actions/types";
import { EXTERNAL_UNIT_SOURCES } from "@/lib/enums";
import { getUnits, getBankMCQs, getBankFRQs } from "@/lib/practice/bank";
import type { UnitSource } from "@/lib/practice/types";
import { QuestionMappingModal } from "./question-mapping-modal";
import { StandardsLibraryModal } from "./standards-library-modal";

type StandardRow = {
  id: string;
  code: string | null;
  title: string;
  description: string | null;
  active: boolean;
  categoryId: string | null;
  externalUnitSource: string | null;
  externalUnitId: string | null;
  externalQuestionIds: string[] | null;
};
type CategoryOpt = { id: string; name: string };

// The per-question checklist that lets several Standards share one unit/
// chapter (see Standard.externalQuestionIdsJson in schema.prisma). A question
// can be checked here even if another standard on the same unit already
// covers it — that's a deliberate one-question-many-standards link, not a
// conflict — so "also linked to" below is purely informational.
function QuestionMappingPicker({
  unitSource,
  unitId,
  selected,
  onChange,
  otherStandardsOnThisUnit,
}: {
  unitSource: UnitSource;
  unitId: string;
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  otherStandardsOnThisUnit: { title: string; externalQuestionIds: string[] | null }[];
}) {
  const unscopedSiblings = otherStandardsOnThisUnit.filter((s) => !s.externalQuestionIds || s.externalQuestionIds.length === 0);
  const alsoLinkedElsewhere = new Map<string, string[]>();
  for (const s of otherStandardsOnThisUnit) {
    for (const qid of s.externalQuestionIds ?? []) {
      alsoLinkedElsewhere.set(qid, [...(alsoLinkedElsewhere.get(qid) ?? []), s.title]);
    }
  }

  const num = Number(unitId);
  const mcq = getBankMCQs(unitSource, [num]);
  const frq = [...getBankFRQs(unitSource, [num], "long"), ...getBankFRQs(unitSource, [num], "short")];
  const items = [
    ...mcq.map((q) => ({ id: q.id, label: q.stem, tag: q.topicTag })),
    ...frq.map((q) => ({ id: q.id, label: q.stem, tag: null })),
  ];

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  }

  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-xs text-slate-400">
        Optionally narrow this standard to specific questions in this unit, so other standards can cover the rest.
        Leave everything unchecked if this is the only standard covering the unit.
      </p>
      {unscopedSiblings.length > 0 && (
        <p className="rounded-md bg-sky-50 px-2.5 py-2 text-xs text-sky-700">
          {unscopedSiblings.map((s) => `"${s.title}"`).join(", ")} {unscopedSiblings.length === 1 ? "is" : "are"} also
          linked to this unit but not yet scoped to specific questions — none of them will get practice evidence
          until scoped (manually here, or via &quot;Map questions to standards&quot;).
        </p>
      )}
      <div className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
        {items.length === 0 ? (
          <p className="px-1 py-1 text-xs text-slate-400">No bank questions found for this unit.</p>
        ) : (
          items.map((q) => {
            const alsoLinkedTo = alsoLinkedElsewhere.get(q.id);
            return (
              <label key={q.id} className="flex items-start gap-2 rounded px-1.5 py-1 text-xs text-slate-600 hover:bg-accent">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={selected.has(q.id)}
                  onChange={() => toggle(q.id)}
                />
                <span className="min-w-0">
                  {q.tag && <span className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">{q.tag}</span>}
                  {q.label}
                  {alsoLinkedTo && (
                    <span className="ml-1 italic text-slate-400">
                      — also linked to {alsoLinkedTo.map((t) => `"${t}"`).join(", ")}
                    </span>
                  )}
                </span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : label}</Button>;
}

function StandardForm({
  classId,
  categories,
  allStandards,
  initial,
  standardId,
  onDone,
}: {
  classId: string;
  categories: CategoryOpt[];
  allStandards: StandardRow[];
  initial?: Partial<StandardRow>;
  standardId?: string;
  onDone: () => void;
}) {
  const action = standardId ? updateStandard.bind(null, standardId) : createStandard;
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false });
  const { toast } = useToast();
  const [unitSource, setUnitSource] = useState(initial?.externalUnitSource ?? "");
  const [unitId, setUnitId] = useState(initial?.externalUnitId ?? "");
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set(initial?.externalQuestionIds ?? []));
  const unitOptions = unitSource ? getUnits(unitSource as UnitSource) : [];

  useEffect(() => {
    if (state.ok) { toast(standardId ? "Standard saved." : "Standard added."); onDone(); }
    else if (state.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const otherStandardsOnThisUnit = allStandards.filter(
    (s) => s.id !== standardId && s.externalUnitSource === unitSource && s.externalUnitId === unitId,
  );

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="externalQuestionIds" value={JSON.stringify([...selectedQuestionIds])} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Code (optional)" className="sm:col-span-1">
          <Input name="code" defaultValue={initial?.code ?? ""} placeholder="e.g. RL.6.2" />
        </Field>
        <Field label="Category (optional)" className="sm:col-span-2">
          <Select name="categoryId" defaultValue={initial?.categoryId ?? ""}>
            <option value="">No category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Title" required error={state.fieldErrors?.title}>
        <Input name="title" defaultValue={initial?.title ?? ""} required autoFocus />
      </Field>
      <Field label="Description (optional)">
        <Textarea name="description" rows={2} defaultValue={initial?.description ?? ""} />
      </Field>
      <div className="rounded-lg border border-border p-3">
        <p className="mb-1.5 text-sm font-medium text-slate-700">Link to a Practice Mode unit (optional)</p>
        <p className="mb-2 text-xs text-slate-400">
          Lets students record practice results against this standard from the student portal — results still go
          through your review before they count as real evidence.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Source" error={state.fieldErrors?.externalUnitId}>
            <Select
              name="externalUnitSource"
              value={unitSource}
              onChange={(e) => { setUnitSource(e.target.value); setUnitId(""); setSelectedQuestionIds(new Set()); }}
            >
              <option value="">Not linked</option>
              {EXTERNAL_UNIT_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <Field label="Unit">
            <Select
              name="externalUnitId"
              value={unitId}
              disabled={!unitSource}
              onChange={(e) => { setUnitId(e.target.value); setSelectedQuestionIds(new Set()); }}
            >
              <option value="">{unitSource ? "Pick a unit" : "—"}</option>
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.title}</option>)}
            </Select>
          </Field>
        </div>
        {unitSource && unitId && (
          <QuestionMappingPicker
            unitSource={unitSource as UnitSource}
            unitId={unitId}
            selected={selectedQuestionIds}
            onChange={setSelectedQuestionIds}
            otherStandardsOnThisUnit={otherStandardsOnThisUnit}
          />
        )}
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <SubmitBtn label={standardId ? "Save changes" : "Add standard"} />
      </div>
    </form>
  );
}

export function StandardsManager({
  classId,
  className,
  standards,
  categories,
}: {
  classId: string;
  className: string;
  standards: StandardRow[];
  categories: CategoryOpt[];
}) {
  const { toast } = useToast();
  const [, start] = useTransition();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<StandardRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<StandardRow | null>(null);
  const [mapping, setMapping] = useState<{ unitSource: UnitSource; unitId: string; unitTitle: string } | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const existingTitles = new Set(standards.map((s) => s.title.toLowerCase()));

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  // Units with 2+ standards linked — the case the fine-grained mapping
  // workaround exists for. A unit with only one standard doesn't need this:
  // the whole unit already applies to it (see mastery-map.ts's wholeUnit
  // special case).
  const unitGroups = new Map<string, StandardRow[]>();
  for (const s of standards) {
    if (!s.externalUnitSource || !s.externalUnitId) continue;
    const key = `${s.externalUnitSource}::${s.externalUnitId}`;
    unitGroups.set(key, [...(unitGroups.get(key) ?? []), s]);
  }
  const mappableGroups = [...unitGroups.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([key, list]) => {
      const [unitSource, unitId] = key.split("::") as [UnitSource, string];
      const unitTitle = getUnits(unitSource).find((u) => String(u.id) === unitId)?.title ?? `Unit ${unitId}`;
      return { unitSource, unitId, unitTitle, standards: list };
    });

  function doDelete(s: StandardRow) {
    setConfirmDelete(null);
    start(async () => {
      const res = await deleteStandard(s.id);
      if (res.ok) toast(`Deleted "${s.title}".`);
      else toast(res.error ?? "Could not delete", "error");
    });
  }

  return (
    <div className="space-y-4">
      {mappableGroups.length > 0 && (
        <Card>
          <CardContent className="space-y-2 py-3">
            <p className="text-sm font-medium text-slate-700">Map questions to standards</p>
            <p className="text-xs text-slate-400">These units have more than one standard linked — assign which questions each one covers.</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {mappableGroups.map((g) => (
                <Button
                  key={`${g.unitSource}::${g.unitId}`}
                  size="sm"
                  variant="outline"
                  onClick={() => setMapping({ unitSource: g.unitSource, unitId: g.unitId, unitTitle: g.unitTitle })}
                >
                  {g.unitTitle} ({g.standards.length})
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Standards for <span className="font-medium text-slate-700">{className}</span></p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setLibraryOpen(true)}><Library className="h-4 w-4" /> Standards library</Button>
          <Link href={`/classes/standards/import?class=${classId}`}>
            <Button variant="outline"><Upload className="h-4 w-4" /> Import from CSV</Button>
          </Link>
          <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4" /> Add standard</Button>
        </div>
      </div>

      {standards.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-slate-400">
          No standards yet for this class. Add your first one to start tracking mastery against it.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {standards.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-start justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {s.code && <Badge color="bg-slate-100 text-slate-600 border-slate-200">{s.code}</Badge>}
                    <p className="truncate text-sm font-medium text-slate-800">{s.title}</p>
                    {s.categoryId && <Badge color="bg-sky-100 text-sky-700 border-sky-200">{categoryName.get(s.categoryId) ?? "?"}</Badge>}
                    {s.externalUnitSource && s.externalUnitId && (
                      <Badge color="bg-violet-100 text-violet-800 border-violet-200">
                        {getUnits(s.externalUnitSource as UnitSource).find((u) => String(u.id) === s.externalUnitId)?.title ?? `Unit ${s.externalUnitId}`}
                        {s.externalQuestionIds && s.externalQuestionIds.length > 0 && ` (${s.externalQuestionIds.length}q)`}
                      </Badge>
                    )}
                  </div>
                  {s.description && <p className="mt-1 text-xs text-slate-500">{s.description}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => start(async () => { await toggleStandard(s.id, !s.active); })}
                    title="Toggle active/inactive"
                  >
                    <Badge color={s.active ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}>
                      {s.active ? "Active" : "Inactive"}
                    </Badge>
                  </button>
                  <button onClick={() => setEditing(s)} className="rounded p-1.5 text-slate-400 hover:bg-accent hover:text-primary" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => setConfirmDelete(s)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a standard" className="max-w-xl">
        <StandardForm classId={classId} categories={categories} allStandards={standards} onDone={() => setAddOpen(false)} />
      </Modal>

      {editing && (
        <Modal open onClose={() => setEditing(null)} title="Edit standard" className="max-w-xl">
          <StandardForm classId={classId} categories={categories} allStandards={standards} initial={editing} standardId={editing.id} onDone={() => setEditing(null)} />
        </Modal>
      )}

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && doDelete(confirmDelete)}
        title="Delete standard?"
        message={`Permanently delete "${confirmDelete?.title ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />

      {mapping && (
        <QuestionMappingModal
          open
          onClose={() => setMapping(null)}
          classId={classId}
          unitSource={mapping.unitSource}
          unitId={mapping.unitId}
          unitTitle={mapping.unitTitle}
        />
      )}

      <StandardsLibraryModal
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        classId={classId}
        existingTitles={existingTitles}
      />
    </div>
  );
}
