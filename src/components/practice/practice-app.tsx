"use client";

import { useEffect, useRef, useState } from "react";
import { startPracticeAttempt, savePracticeProgress, sendPracticeChatMessage, submitPracticeAttempt } from "@/actions/practice";
import { computePacing, computeEndTimestamp } from "@/lib/practice/timer";
import { SetupStep, type EligibleClass } from "./setup-step";
import { PracticeStep } from "./practice-step";
import { ReviewStep } from "./review-step";
import type { PracticeConfig, PracticeSet, MCQAnswer, FRQAnswer, FRQScoreResult, ChatMessage, UnitResult, CoachingFeedback } from "@/lib/practice/types";

type Resumable = {
  attemptId: string;
  classId: string;
  practiceSet: PracticeSet | null;
  mcqAnswers: Record<string, MCQAnswer>;
  frqAnswers: Record<string, FRQAnswer>;
  endTimestamp: number | null;
} | null;

export function PracticeApp({ classes, resumable }: { classes: EligibleClass[]; resumable: Resumable }) {
  const [step, setStep] = useState<"setup" | "practice" | "review">(resumable?.practiceSet ? "practice" : "setup");
  const [attemptId, setAttemptId] = useState<string | null>(resumable?.attemptId ?? null);
  const [practiceSet, setPracticeSet] = useState<PracticeSet | null>(resumable?.practiceSet ?? null);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, MCQAnswer>>(resumable?.mcqAnswers ?? {});
  const [frqAnswers, setFrqAnswers] = useState<Record<string, FRQAnswer>>(resumable?.frqAnswers ?? {});
  const [frqScores, setFrqScores] = useState<Record<string, FRQScoreResult>>({});
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [unitResults, setUnitResults] = useState<UnitResult[] | null>(null);
  const [coachingFeedback, setCoachingFeedback] = useState<CoachingFeedback | null>(null);
  const [endTimestamp, setEndTimestamp] = useState<number | null>(resumable?.endTimestamp ?? null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced autosave — fires ~1s after the last edit, not per keystroke,
  // mirroring DailyCheck's "upsert on tap" spirit.
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (step !== "practice" || !attemptId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      savePracticeProgress(attemptId, { mcqAnswers, frqAnswers });
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcqAnswers, frqAnswers, attemptId, step]);

  async function handleStart(classId: string, config: PracticeConfig) {
    setError(null);
    setStarting(true);
    try {
      const res = await startPracticeAttempt(classId, config);
      if (!res.ok) { setError(res.error); return; }
      setAttemptId(res.data.attemptId);
      setPracticeSet(res.data.practiceSet);
      setMcqAnswers({});
      setFrqAnswers({});
      setFrqScores({});
      setChatHistories({});
      setUnitResults(null);
      setCoachingFeedback(null);
      if (config.timerEnabled) {
        const pacing = computePacing(config.mcqCount, config.longFrqCount, config.shortFrqCount);
        const end = computeEndTimestamp(pacing.totalSeconds, Date.now());
        setEndTimestamp(end);
        savePracticeProgress(res.data.attemptId, { endTimestamp: end });
      } else {
        setEndTimestamp(null);
      }
      setStep("practice");
    } finally {
      setStarting(false);
    }
  }

  function handleMcqAnswer(itemId: string, selectedIndex: number) {
    setMcqAnswers((prev) => ({ ...prev, [itemId]: { itemId, selectedIndex } }));
  }

  function handleFrqAnswer(itemId: string, partIndex: number, value: string) {
    setFrqAnswers((prev) => {
      const item = practiceSet?.frqItems.find((f) => f.id === itemId);
      const existing = prev[itemId]?.responses ?? (item ? item.parts.map(() => "") : []);
      const responses = [...existing];
      responses[partIndex] = value;
      return { ...prev, [itemId]: { itemId, responses } };
    });
  }

  async function handleSubmit() {
    if (!attemptId) return;
    setSubmitting(true);
    setStep("review");
    try {
      const res = await submitPracticeAttempt(attemptId);
      if (!res.ok) { setError(res.error); return; }
      setUnitResults(res.data.unitResults);
      setFrqScores(res.data.frqScores);
      setCoachingFeedback(res.data.coachingFeedback);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChatSend(itemId: string, message: string) {
    if (!attemptId || !practiceSet) return;
    const mcqItem = practiceSet.mcqItems.find((m) => m.id === itemId);
    const frqItem = practiceSet.frqItems.find((f) => f.id === itemId);
    let studentContext = "";
    if (mcqItem) {
      const answer = mcqAnswers[itemId];
      const correct = answer?.selectedIndex === mcqItem.correctIndex;
      studentContext = answer?.selectedIndex != null
        ? `Student selected "${mcqItem.choices[answer.selectedIndex]}" — ${correct ? "CORRECT" : "INCORRECT"} (correct answer: "${mcqItem.choices[mcqItem.correctIndex]}").`
        : "Student left this question blank.";
    } else if (frqItem) {
      const score = frqScores[itemId];
      const responses = frqAnswers[itemId]?.responses ?? [];
      studentContext = frqItem.parts.map((p, i) => {
        const partScore = score?.partScores.find((ps) => ps.partLabel === p.label);
        return `Part (${p.label}): student wrote "${responses[i] || "(blank)"}" — scored ${partScore ? `${partScore.pointsAwarded}/${partScore.maxPoints} (${partScore.confidence} confidence): ${partScore.reasoning}` : "not yet scored"}.`;
      }).join(" ");
    }

    const res = await sendPracticeChatMessage(attemptId, itemId, studentContext, message);
    if (res.ok) {
      setChatHistories((prev) => ({
        ...prev,
        [itemId]: [...(prev[itemId] ?? []), { role: "user", content: message }, { role: "assistant", content: res.data.reply }],
      }));
    }
  }

  function handleRestart() {
    setStep("setup");
    setAttemptId(null);
    setPracticeSet(null);
    setUnitResults(null);
    setCoachingFeedback(null);
    setError(null);
  }

  if (step === "setup" || !practiceSet) {
    return <SetupStep classes={classes} onStart={handleStart} starting={starting} error={error} />;
  }
  if (step === "practice") {
    return (
      <PracticeStep
        practiceSet={practiceSet}
        mcqAnswers={mcqAnswers}
        frqAnswers={frqAnswers}
        onMcqAnswer={handleMcqAnswer}
        onFrqAnswer={handleFrqAnswer}
        endTimestamp={endTimestamp}
        onSubmit={handleSubmit}
        onTimerExpire={handleSubmit}
        submitting={submitting}
      />
    );
  }
  return (
    <ReviewStep
      practiceSet={practiceSet}
      mcqAnswers={mcqAnswers}
      frqAnswers={frqAnswers}
      frqScores={frqScores}
      unitResults={unitResults}
      coachingFeedback={coachingFeedback}
      scoring={submitting}
      chatHistories={chatHistories}
      onChatSend={handleChatSend}
      onRestart={handleRestart}
    />
  );
}
