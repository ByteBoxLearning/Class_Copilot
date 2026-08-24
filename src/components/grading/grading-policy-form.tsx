"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { Info } from "lucide-react";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { saveGradingPolicy } from "@/actions/grading";
import type { ActionResult } from "@/actions/types";
import { GRADING_POLICY_TYPES, MASTERY_STRATEGIES, MASTERY_STRATEGY_HINTS } from "@/lib/enums";
import { levelToPercent, weightedAverage, roundPercent, letterFor, type LevelPercentMap } from "@/lib/grading-math";
import { computeMastery, type MasteryStrategyName, type EvidenceWeightMap } from "@/lib/mastery-math";

type PreviewStudent = {
  id: string;
  name: string;
  engagedCount: number;
  distractingCount: number;
};

type PreviewMasteryEvent = {
  studentId: string;
  standardId: string;
  level: number;
  recordedAt: string;
  evidenceType: string;
};

type CurrentConfig = {
  levelPercent: LevelPercentMap;
  minEvents: number;
  masteryWeight: number;
  engagementWeight: number;
  engagementValue: { ENGAGED: number; DISTRACTING: number };
  masteryStrategy: string;
  decayRate: number;
  windowSize: number;
  evidenceWeights: EvidenceWeightMap;
};

function SubmitBtn() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save grading policy"}</Button>;
}

const EVIDENCE_WEIGHT_FIELDS: { key: keyof EvidenceWeightsState; name: string; label: string }[] = [
  { key: "QUIZ", name: "evidenceWeightQuiz", label: "Quiz" },
  { key: "HOMEWORK", name: "evidenceWeightHomework", label: "Homework" },
  { key: "PROJECT", name: "evidenceWeightProject", label: "Project" },
  { key: "OBSERVATION", name: "evidenceWeightObservation", label: "Observation" },
  { key: "CONVERSATION", name: "evidenceWeightConversation", label: "Conversation" },
  { key: "RETAKE", name: "evidenceWeightRetake", label: "Retake" },
  { key: "PRACTICE", name: "evidenceWeightPractice", label: "AI Practice" },
  { key: "OTHER", name: "evidenceWeightOther", label: "Other" },
];

type EvidenceWeightsState = Record<"QUIZ" | "HOMEWORK" | "PROJECT" | "OBSERVATION" | "CONVERSATION" | "RETAKE" | "PRACTICE" | "OTHER", number>;

function initialEvidenceWeights(w: EvidenceWeightMap): EvidenceWeightsState {
  return {
    QUIZ: w.QUIZ ?? 1,
    HOMEWORK: w.HOMEWORK ?? 1,
    PROJECT: w.PROJECT ?? 1,
    OBSERVATION: w.OBSERVATION ?? 1,
    CONVERSATION: w.CONVERSATION ?? 1,
    RETAKE: w.RETAKE ?? 1,
    PRACTICE: w.PRACTICE ?? 1,
    OTHER: w.OTHER ?? 1,
  };
}

export function GradingPolicyForm({
  classId,
  currentType,
  currentConfig,
  canEdit,
  previewStudents,
  previewMasteryEvents,
}: {
  classId: string;
  currentType: string;
  currentConfig: CurrentConfig;
  canEdit: boolean;
  previewStudents: PreviewStudent[];
  previewMasteryEvents: PreviewMasteryEvent[];
}) {
  const { toast } = useToast();
  const [state, formAction] = useActionState<ActionResult, FormData>(saveGradingPolicy.bind(null, classId), { ok: false });

  const [type, setType] = useState(currentType === "WEIGHTED" ? "WEIGHTED" : "STANDARDS_ONLY");
  const [level1, setLevel1] = useState(currentConfig.levelPercent["1"]);
  const [level2, setLevel2] = useState(currentConfig.levelPercent["2"]);
  const [level3, setLevel3] = useState(currentConfig.levelPercent["3"]);
  const [level4, setLevel4] = useState(currentConfig.levelPercent["4"]);
  const [minEvents, setMinEvents] = useState(currentConfig.minEvents);
  const [masteryWeight, setMasteryWeight] = useState(currentConfig.masteryWeight);
  const [engagementWeight, setEngagementWeight] = useState(currentConfig.engagementWeight);
  const [engagedValue, setEngagedValue] = useState(currentConfig.engagementValue.ENGAGED);
  const [distractingValue, setDistractingValue] = useState(currentConfig.engagementValue.DISTRACTING);
  const [masteryStrategy, setMasteryStrategy] = useState<MasteryStrategyName>(
    (currentConfig.masteryStrategy as MasteryStrategyName) || "RECENCY_WEIGHTED",
  );
  const [decayRate, setDecayRate] = useState(currentConfig.decayRate);
  const [windowSize, setWindowSize] = useState(currentConfig.windowSize);
  const [evidenceWeights, setEvidenceWeights] = useState<EvidenceWeightsState>(initialEvidenceWeights(currentConfig.evidenceWeights));

  useEffect(() => {
    if (state.ok) toast("Grading policy saved.");
    else if (state.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Group raw preview events by student -> standard once; recomputed only
  // when the underlying data changes, not on every keystroke.
  const eventsByStudentStandard = useMemo(() => {
    const map = new Map<string, Map<string, PreviewMasteryEvent[]>>();
    for (const e of previewMasteryEvents) {
      let byStandard = map.get(e.studentId);
      if (!byStandard) { byStandard = new Map(); map.set(e.studentId, byStandard); }
      const arr = byStandard.get(e.standardId) ?? [];
      arr.push(e);
      byStandard.set(e.standardId, arr);
    }
    return map;
  }, [previewMasteryEvents]);

  const preview = useMemo(() => {
    const levelPercent: LevelPercentMap = { "1": level1, "2": level2, "3": level3, "4": level4 };
    const strategyConfig = { strategy: masteryStrategy, decayRate, windowSize, evidenceWeights };

    return previewStudents.map((s) => {
      // Recompute mastery per standard under the currently-selected (not yet
      // saved) strategy — same computeMastery() the server uses — then
      // average the per-standard raw levels, same approximation grading.ts's
      // masteryComponentForStudents makes (average of percents), just one
      // level up so a single levelToPercent call suffices for the preview.
      const byStandard = eventsByStudentStandard.get(s.id);
      const levels: number[] = [];
      let sampleSize = 0;
      if (byStandard) {
        for (const events of byStandard.values()) {
          const result = computeMastery(events, strategyConfig);
          if (result.rawAverage !== null && result.sampleSize >= minEvents) {
            levels.push(result.rawAverage);
            sampleSize += result.sampleSize;
          }
        }
      }
      const avgMasteryLevel = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : null;
      const masteryPercent = avgMasteryLevel !== null ? levelToPercent(avgMasteryLevel, levelPercent) : null;

      if (type === "STANDARDS_ONLY") {
        const percent = masteryPercent !== null ? roundPercent(masteryPercent) : null;
        return { ...s, percent, letter: percent !== null ? letterFor(percent) : null, masterySampleSize: sampleSize };
      }

      const totalEng = s.engagedCount + s.distractingCount;
      const engagementPercent = totalEng > 0 ? (s.engagedCount * engagedValue + s.distractingCount * distractingValue) / totalEng : null;
      const raw = weightedAverage([
        { percent: masteryPercent, weight: masteryWeight },
        { percent: engagementPercent, weight: engagementWeight },
      ]);
      const percent = raw !== null ? roundPercent(raw) : null;
      return { ...s, percent, letter: percent !== null ? letterFor(percent) : null, masterySampleSize: sampleSize };
    });
  }, [
    previewStudents, eventsByStudentStandard, type, level1, level2, level3, level4, minEvents,
    masteryWeight, engagementWeight, engagedValue, distractingValue, masteryStrategy, decayRate, windowSize, evidenceWeights,
  ]);

  const weightsValid = type !== "WEIGHTED" || masteryWeight + engagementWeight === 100;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <form action={formAction} className="space-y-4">
        <Field label="Grading model">
          <Select name="type" value={type} onChange={(e) => setType(e.target.value)} disabled={!canEdit}>
            {GRADING_POLICY_TYPES.map((o) => (
              <option key={o.value} value={o.value} disabled={!o.available}>{o.label}{!o.available ? " (coming soon)" : ""}</option>
            ))}
          </Select>
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium text-slate-700">Mastery level → percent</p>
          <div className="grid grid-cols-4 gap-2">
            <Field label="1 · Beginning" error={state.fieldErrors?.level1}>
              <Input name="level1" type="number" min={0} max={100} value={level1} onChange={(e) => setLevel1(Number(e.target.value))} disabled={!canEdit} />
            </Field>
            <Field label="2 · Developing">
              <Input name="level2" type="number" min={0} max={100} value={level2} onChange={(e) => setLevel2(Number(e.target.value))} disabled={!canEdit} />
            </Field>
            <Field label="3 · Proficient">
              <Input name="level3" type="number" min={0} max={100} value={level3} onChange={(e) => setLevel3(Number(e.target.value))} disabled={!canEdit} />
            </Field>
            <Field label="4 · Advanced">
              <Input name="level4" type="number" min={0} max={100} value={level4} onChange={(e) => setLevel4(Number(e.target.value))} disabled={!canEdit} />
            </Field>
          </div>
        </div>

        <Field label="Minimum evidence points before a standard counts" hint="Standards with fewer MasteryEvents than this are excluded from the average, not zeroed.">
          <Input name="minEvents" type="number" min={1} max={20} value={minEvents} onChange={(e) => setMinEvents(Number(e.target.value))} disabled={!canEdit} className="w-24" />
        </Field>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <Field label="Mastery calculation model" hint={MASTERY_STRATEGY_HINTS[masteryStrategy]}>
            <Select
              name="masteryStrategy"
              value={masteryStrategy}
              onChange={(e) => setMasteryStrategy(e.target.value as MasteryStrategyName)}
              disabled={!canEdit}
            >
              {MASTERY_STRATEGIES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>

          {masteryStrategy === "DECAYING_AVERAGE" && (
            <Field label="Decay rate" hint="How hard each new event pulls the average toward itself. Higher = more recency-heavy.">
              <Input
                name="decayRate" type="number" min={0} max={1} step={0.05}
                value={decayRate} onChange={(e) => setDecayRate(Number(e.target.value))} disabled={!canEdit} className="w-24"
              />
            </Field>
          )}

          {(masteryStrategy === "MOST_RECENT_N" || masteryStrategy === "HIGHEST_RECENT_N") && (
            <Field label="Window size (N)" hint="How many of the most recent pieces of evidence are considered.">
              <Input
                name="windowSize" type="number" min={1} max={20}
                value={windowSize} onChange={(e) => setWindowSize(Number(e.target.value))} disabled={!canEdit} className="w-24"
              />
            </Field>
          )}

          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Evidence type weight</p>
            <p className="mb-2 text-xs text-slate-400">
              How much each kind of evidence counts. Set a type to 0 to exclude it entirely (e.g. treat homework as practice only).
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {EVIDENCE_WEIGHT_FIELDS.map((f) => (
                <Field key={f.key} label={f.label}>
                  <Input
                    name={f.name} type="number" min={0} max={5} step={0.25}
                    value={evidenceWeights[f.key]}
                    onChange={(e) => setEvidenceWeights((prev) => ({ ...prev, [f.key]: Number(e.target.value) }))}
                    disabled={!canEdit || masteryStrategy === "HIGHEST_RECENT_N"}
                  />
                </Field>
              ))}
            </div>
            {masteryStrategy === "HIGHEST_RECENT_N" && (
              <p className="mt-1 text-xs text-slate-400">Not used by Highest of Recent Evidence — it only asks whether a level was ever shown.</p>
            )}
          </div>
        </div>

        {type === "WEIGHTED" && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mastery weight (%)" error={state.fieldErrors?.masteryWeight}>
                <Input name="masteryWeight" type="number" min={0} max={100} value={masteryWeight} onChange={(e) => setMasteryWeight(Number(e.target.value))} disabled={!canEdit} />
              </Field>
              <Field label="Engagement weight (%)">
                <Input name="engagementWeight" type="number" min={0} max={100} value={engagementWeight} onChange={(e) => setEngagementWeight(Number(e.target.value))} disabled={!canEdit} />
              </Field>
            </div>
            {!weightsValid && <p className="text-xs text-red-600">Weights must add up to 100 (currently {masteryWeight + engagementWeight}).</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Engaged day = ">
                <Input name="engagedValue" type="number" min={0} max={100} value={engagedValue} onChange={(e) => setEngagedValue(Number(e.target.value))} disabled={!canEdit} />
              </Field>
              <Field label="Distracting day = ">
                <Input name="distractingValue" type="number" min={0} max={100} value={distractingValue} onChange={(e) => setDistractingValue(Number(e.target.value))} disabled={!canEdit} />
              </Field>
            </div>
            <p className="flex items-start gap-1.5 text-xs text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Days with no engagement check logged are excluded from the average — never counted as a low score.
            </p>
          </>
        )}

        {canEdit && (
          <div className="flex justify-end pt-1">
            <SubmitBtn />
          </div>
        )}
        {!canEdit && (
          <p className="text-xs text-slate-400">Only the teacher can change the grading policy — you have a read-only view.</p>
        )}
      </form>

      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-700">Live preview</p>
        <p className="text-xs text-slate-400">Recomputed instantly as you adjust values above — nothing is saved until you submit.</p>
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 font-medium">Student</th>
                <th className="px-3 py-2 font-medium">Grade</th>
              </tr>
            </thead>
            <tbody>
              {preview.length === 0 ? (
                <tr><td colSpan={2} className="px-3 py-6 text-center text-xs text-slate-400">No enrolled students yet to preview against.</td></tr>
              ) : (
                preview.map((s) => (
                  <tr key={s.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-slate-700">{s.name}</td>
                    <td className="px-3 py-2">
                      {s.percent !== null ? (
                        <span className="flex items-center gap-1.5">
                          <Badge color="bg-slate-100 text-slate-700 border-slate-200">{s.letter}</Badge>
                          <span className="text-xs text-slate-500">{s.percent}%</span>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-300">Not enough data yet</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
