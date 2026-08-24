"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Lightbulb } from "lucide-react";
import { ChatPanel } from "./chat-panel";
import { ChemText } from "@/lib/practice/chem-text";
import { BADGE_COLORS, MASTERY_LEVELS, labelOf } from "@/lib/enums";
import type { PracticeSet, MCQAnswer, FRQAnswer, FRQScoreResult, ChatMessage, UnitResult, CoachingFeedback } from "@/lib/practice/types";

export function ReviewStep({
  practiceSet,
  mcqAnswers,
  frqAnswers,
  frqScores,
  unitResults,
  coachingFeedback,
  scoring,
  chatHistories,
  onChatSend,
  onRestart,
}: {
  practiceSet: PracticeSet;
  mcqAnswers: Record<string, MCQAnswer>;
  frqAnswers: Record<string, FRQAnswer>;
  frqScores: Record<string, FRQScoreResult>;
  unitResults: UnitResult[] | null;
  coachingFeedback: CoachingFeedback | null;
  scoring: boolean;
  chatHistories: Record<string, ChatMessage[]>;
  onChatSend: (itemId: string, message: string) => Promise<void>;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-4">
      {unitResults && unitResults.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-5">
            <p className="text-sm font-semibold text-slate-800">Predicted mastery</p>
            <p className="text-xs text-slate-400">
              A preview of where this practice suggests you stand — it does not affect your official grade unless
              your teacher reviews and approves it.
            </p>
            {unitResults.map((r) => (
              <div key={r.unitId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
                <div>
                  <p className="text-sm text-slate-700">{r.unitTitle}</p>
                  <p className="text-xs text-slate-400">
                    {r.standardTitle ? <>Sent to your teacher for review, toward &quot;{r.standardTitle}&quot;</> : "Not linked to a standard yet — ask your teacher to link one"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">{r.scorePercent}%</span>
                  <Badge color={BADGE_COLORS[String(r.suggestedLevel)]}>{labelOf(MASTERY_LEVELS, String(r.suggestedLevel))}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {coachingFeedback && (
        <Card>
          <CardContent className="space-y-2.5 pt-5">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <Lightbulb className="h-4 w-4 text-amber-500" /> What to improve
            </p>
            <p className="text-sm text-slate-600"><ChemText text={coachingFeedback.whatToImprove} /></p>
            <p className="text-sm font-medium text-slate-700">Strategies to try</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
              {coachingFeedback.strategies.map((s, i) => <li key={i}><ChemText text={s} /></li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {practiceSet.mcqItems.map((item, i) => {
        const answer = mcqAnswers[item.id];
        const correct = answer?.selectedIndex === item.correctIndex;
        return (
          <Card key={item.id}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-start gap-2">
                {correct ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
                <p className="text-sm font-medium text-slate-800">Q{i + 1}. <ChemText text={item.stem} /></p>
              </div>
              <div className="space-y-1 pl-6">
                {item.choices.map((choice, idx) => (
                  <p key={idx} className={`text-sm ${idx === item.correctIndex ? "font-medium text-green-700" : idx === answer?.selectedIndex ? "text-red-600" : "text-slate-500"}`}>
                    <ChemText text={choice} />{idx === item.correctIndex ? " ✓" : idx === answer?.selectedIndex ? " (your answer)" : ""}
                  </p>
                ))}
              </div>
              {item.explanation && <p className="pl-6 text-xs text-slate-500"><ChemText text={item.explanation} /></p>}
              <div className="pl-6"><ChatPanel history={chatHistories[item.id] ?? []} onSend={(m) => onChatSend(item.id, m)} /></div>
            </CardContent>
          </Card>
        );
      })}

      {practiceSet.frqItems.map((item, i) => {
        const score = frqScores[item.id];
        return (
          <Card key={item.id}>
            <CardContent className="space-y-2 pt-5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-slate-800">FRQ {i + 1}</p>
                {score ? (
                  <Badge color="bg-sky-100 text-sky-800 border-sky-200">{score.totalAwarded} / {score.totalPossible} pts</Badge>
                ) : scoring ? (
                  <span className="text-xs text-slate-400">Scoring…</span>
                ) : (
                  <span className="text-xs text-amber-600">Could not be scored</span>
                )}
              </div>
              {score?.partScores.map((p) => (
                <div key={p.partLabel} className="rounded-md border border-border p-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-600">Part ({p.partLabel})</p>
                    <span className="text-xs text-slate-500">{p.pointsAwarded} / {p.maxPoints} pts{p.confidence === "low" ? " · flagged for your teacher's review" : ""}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500"><ChemText text={p.reasoning} /></p>
                </div>
              ))}
              <div><ChatPanel history={chatHistories[item.id] ?? []} onSend={(m) => onChatSend(item.id, m)} /></div>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-end">
        <Button variant="outline" onClick={onRestart}>Practice again</Button>
      </div>
    </div>
  );
}
