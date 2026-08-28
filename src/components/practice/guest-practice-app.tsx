"use client";

// Guest counterpart to practice-app.tsx — same orchestration shape, but
// calls the guest actions (no classId, no unit/Standard results, no
// PracticeMasteryProposal) and passes hasTeacher={false} into ReviewStep.
// SetupStep/PracticeStep/ReviewStep/ChatPanel themselves are reused
// unchanged — they're already pure/presentational, driven by props only.

import { useEffect, useRef, useState } from "react";
import {
  startGuestPracticeAttempt, saveGuestPracticeProgress, sendGuestPracticeChatMessage, submitGuestPracticeAttempt,
} from "@/actions/guest-practice";
import { computePacing, computeEndTimestamp } from "@/lib/practice/timer";
import { SetupStep, type EligibleClass } from "./setup-step";
import { PracticeStep } from "./practice-step";
import { ReviewStep } from "./review-step";
import type { PracticeConfig, PracticeSet, MCQAnswer, FRQAnswer, FRQScoreResult, ChatMessage, CoachingFeedback } from "@/lib/practice/types";

type Resumable = {
  attemptId: string;
  practiceSet: PracticeSet | null;
  mcqAnswers: Record<string, MCQAnswer>;
  frqAnswers: Record<string, FRQAnswer>;
  endTimestamp: number | null;
} | null;

// One synthetic "class" whose sources list every subject with a practice
// bank (src/lib/enums.ts::EXTERNAL_UNIT_SOURCES) — SetupStep's class picker
// only renders when there's more than one, so a single entry here just
// shows the subject dropdown directly. Adding a new subject to that enum
// makes it available here automatically, no guest-side change needed.
export function GuestPracticeApp({ sources, resumable }: { sources: string[]; resumable: Resumable }) {
  const classes: EligibleClass[] = [{ id: "guest", name: "Practice", sources }];

  const [step, setStep] = useState<"setup" | "practice" | "review">(resumable?.practiceSet ? "practice" : "setup");
  const [attemptId, setAttemptId] = useState<string | null>(resumable?.attemptId ?? null);
  const [practiceSet, setPracticeSet] = useState<PracticeSet | null>(resumable?.practiceSet ?? null);
  const [mcqAnswers, setMcqAnswers] = useState<Record<string, MCQAnswer>>(resumable?.mcqAnswers ?? {});
  const [frqAnswers, setFrqAnswers] = useState<Record<string, FRQAnswer>>(resumable?.frqAnswers ?? {});
  const [frqScores, setFrqScores] = useState<Record<string, FRQScoreResult>>({});
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({});
  const [coachingFeedback, setCoachingFeedback] = useState<CoachingFeedback | null>(null);
  const [endTimestamp, setEndTimestamp] = useState<number | null>(resumable?.endTimestamp ?? null);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (step !== "practice" || !attemptId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveGuestPracticeProgress(attemptId, { mcqAnswers, frqAnswers });
    }, 1000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcqAnswers, frqAnswers, attemptId, step]);

  async function handleStart(_classId: string, config: PracticeConfig) {
    setError(null);
    setStarting(true);
    try {
      const res = await startGuestPracticeAttempt(config);
      if (!res.ok) { setError(res.error); return; }
      setAttemptId(res.data.attemptId);
      setPracticeSet(res.data.practiceSet);
      setMcqAnswers({});
      setFrqAnswers({});
      setFrqScores({});
      setChatHistories({});
      setCoachingFeedback(null);
      if (config.timerEnabled) {
        const pacing = computePacing(config.mcqCount, config.longFrqCount, config.shortFrqCount);
        const end = computeEndTimestamp(pacing.totalSeconds, Date.now());
        setEndTimestamp(end);
        saveGuestPracticeProgress(res.data.attemptId, { endTimestamp: end });
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
      const res = await submitGuestPracticeAttempt(attemptId);
      if (!res.ok) { setError(res.error); return; }
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

    const res = await sendGuestPracticeChatMessage(attemptId, itemId, studentContext, message);
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
      unitResults={null}
      coachingFeedback={coachingFeedback}
      scoring={submitting}
      chatHistories={chatHistories}
      onChatSend={handleChatSend}
      onRestart={handleRestart}
      hasTeacher={false}
    />
  );
}
