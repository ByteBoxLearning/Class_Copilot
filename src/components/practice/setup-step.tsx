"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { getUnits } from "@/lib/practice/bank";
import { computePacing, formatDuration } from "@/lib/practice/timer";
import { EXTERNAL_UNIT_SOURCES, labelOf } from "@/lib/enums";
import type { PracticeConfig, UnitSource } from "@/lib/practice/types";

export type EligibleClass = { id: string; name: string; sources: string[] };

export function SetupStep({
  classes,
  onStart,
  starting,
  error,
}: {
  classes: EligibleClass[];
  onStart: (classId: string, config: PracticeConfig) => void;
  starting: boolean;
  error: string | null;
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const activeClass = classes.find((c) => c.id === classId) ?? classes[0];
  const [source, setSource] = useState<UnitSource>((activeClass?.sources[0] as UnitSource) ?? "AP_CHEM");
  const units = useMemo(() => getUnits(source), [source]);
  const [unitIds, setUnitIds] = useState<number[]>([]);
  const [mcqCount, setMcqCount] = useState(10);
  const [longFrqCount, setLongFrqCount] = useState(0);
  const [shortFrqCount, setShortFrqCount] = useState(0);
  const [timerEnabled, setTimerEnabled] = useState(false);

  const isAp = source === "AP_CHEM";
  const pacing = computePacing(mcqCount, longFrqCount, shortFrqCount);

  function toggleUnit(id: number) {
    setUnitIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function changeClass(id: string) {
    setClassId(id);
    const cls = classes.find((c) => c.id === id);
    const nextSource = (cls?.sources[0] as UnitSource) ?? "AP_CHEM";
    setSource(nextSource);
    setUnitIds([]);
  }

  function changeSource(s: UnitSource) {
    setSource(s);
    setUnitIds([]);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-5">
          {classes.length > 1 && (
            <Field label="Class">
              <Select value={classId} onChange={(e) => changeClass(e.target.value)}>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
          )}
          {activeClass && activeClass.sources.length > 1 && (
            <Field label="Subject">
              <Select value={source} onChange={(e) => changeSource(e.target.value as UnitSource)}>
                {activeClass.sources.map((s) => <option key={s} value={s}>{labelOf(EXTERNAL_UNIT_SOURCES, s)}</option>)}
              </Select>
            </Field>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Units</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {units.map((u) => (
                <label key={u.id} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent">
                  <input type="checkbox" checked={unitIds.includes(u.id)} onChange={() => toggleUnit(u.id)} className="h-4 w-4" />
                  <span className="truncate">{u.title}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Multiple choice questions">
              <Input type="number" min={0} max={60} value={mcqCount} onChange={(e) => setMcqCount(Math.max(0, Number(e.target.value)))} />
            </Field>
            <Field label="Long free-response (10 pts)">
              <Input type="number" min={0} max={3} value={longFrqCount} onChange={(e) => setLongFrqCount(Math.max(0, Number(e.target.value)))} />
            </Field>
            <Field label="Short response (4 pts)">
              <Input type="number" min={0} max={4} value={shortFrqCount} onChange={(e) => setShortFrqCount(Math.max(0, Number(e.target.value)))} />
            </Field>
          </div>

          {isAp && (
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={timerEnabled} onChange={(e) => setTimerEnabled(e.target.checked)} className="h-4 w-4" />
              Time me under official AP pacing ({formatDuration(pacing.totalSeconds)})
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end">
            <Button
              disabled={starting || unitIds.length === 0 || (mcqCount === 0 && longFrqCount === 0 && shortFrqCount === 0)}
              onClick={() => onStart(classId, { source, unitIds, mcqCount, longFrqCount, shortFrqCount, timerEnabled: isAp && timerEnabled })}
            >
              {starting ? "Preparing questions…" : "Start practice"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
