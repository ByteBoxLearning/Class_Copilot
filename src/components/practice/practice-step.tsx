"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { TimerBanner } from "./timer-banner";
import { ChemText } from "@/lib/practice/chem-text";
import type { PracticeSet, MCQAnswer, FRQAnswer } from "@/lib/practice/types";

// Progressive hint reveal — local state only, never persisted or scored.
// Each click reveals the next hint in order; the button disappears once
// they're all shown.
function HintReveal({ hints }: { hints?: string[] }) {
  const [revealed, setRevealed] = useState(0);
  if (!hints || hints.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {hints.slice(0, revealed).map((hint, i) => (
        <p key={i} className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
          <ChemText text={hint} />
        </p>
      ))}
      {revealed < hints.length && (
        <button
          type="button"
          onClick={() => setRevealed((r) => r + 1)}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Lightbulb className="h-3.5 w-3.5" /> {revealed === 0 ? "Need a hint?" : "Show another hint"}
        </button>
      )}
    </div>
  );
}

export function PracticeStep({
  practiceSet,
  mcqAnswers,
  frqAnswers,
  onMcqAnswer,
  onFrqAnswer,
  endTimestamp,
  onSubmit,
  onTimerExpire,
  submitting,
}: {
  practiceSet: PracticeSet;
  mcqAnswers: Record<string, MCQAnswer>;
  frqAnswers: Record<string, FRQAnswer>;
  onMcqAnswer: (itemId: string, index: number) => void;
  onFrqAnswer: (itemId: string, partIndex: number, value: string) => void;
  endTimestamp: number | null;
  onSubmit: () => void;
  onTimerExpire: () => void;
  submitting: boolean;
}) {
  const answeredCount =
    Object.values(mcqAnswers).filter((a) => a.selectedIndex !== null).length +
    Object.values(frqAnswers).filter((a) => a.responses.some((r) => r.trim())).length;
  const totalCount = practiceSet.mcqItems.length + practiceSet.frqItems.length;

  return (
    <div className="space-y-4">
      {endTimestamp && <TimerBanner endTimestamp={endTimestamp} onExpire={onTimerExpire} />}

      {practiceSet.generationFallbackNotice && (
        <Card><CardContent className="py-3 text-sm text-amber-700">{practiceSet.generationFallbackNotice}</CardContent></Card>
      )}

      {practiceSet.mcqItems.map((item, i) => (
        <Card key={item.id}>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-medium text-slate-800">Q{i + 1}. <ChemText text={item.stem} /></p>
            <div className="space-y-1.5">
              {item.choices.map((choice, idx) => (
                <label key={idx} className="flex items-center gap-2 rounded-md border border-border p-2 text-sm hover:bg-accent">
                  <input
                    type="radio"
                    name={item.id}
                    checked={mcqAnswers[item.id]?.selectedIndex === idx}
                    onChange={() => onMcqAnswer(item.id, idx)}
                    className="h-4 w-4"
                  />
                  <ChemText text={choice} />
                </label>
              ))}
            </div>
            <HintReveal hints={item.hints} />
          </CardContent>
        </Card>
      ))}

      {practiceSet.frqItems.map((item, i) => (
        <Card key={item.id}>
          <CardContent className="space-y-3 pt-5">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-slate-800">FRQ {i + 1}</p>
              <Badge color="bg-slate-100 text-slate-600 border-slate-200">{item.points} pts</Badge>
            </div>
            <p className="text-sm text-slate-700"><ChemText text={item.stem} /></p>
            <HintReveal hints={item.hints} />
            {item.parts.map((part, pi) => (
              <div key={part.label}>
                <p className="mb-1 text-xs font-medium text-slate-500">({part.label}) <ChemText text={part.prompt} /> — {part.maxPoints} pt{part.maxPoints === 1 ? "" : "s"}</p>
                <Textarea
                  rows={3}
                  value={frqAnswers[item.id]?.responses[pi] ?? ""}
                  onChange={(e) => onFrqAnswer(item.id, pi, e.target.value)}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-between rounded-md border border-border bg-slate-50 px-4 py-3">
        <p className="text-sm text-slate-500">{answeredCount} of {totalCount} answered</p>
        <Button onClick={onSubmit} disabled={submitting}>{submitting ? "Scoring…" : "Submit for scoring"}</Button>
      </div>
    </div>
  );
}
