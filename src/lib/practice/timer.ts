// Official AP Chemistry pacing (College Board CED), ported verbatim from the
// standalone AP Chem Practice tool's lib/timer.ts — already pure, no changes
// needed. Used for AP_CHEM sessions only; INTRO_CHEM sessions don't offer a
// timer (there's no official pacing standard for a generic intro course).
// Section I: 60 MCQ / 90 minutes -> 90 seconds/question
// Section II: 7 FRQ (3 long @10pts + 4 short @4pts = 46 pts) / 105 minutes -> 6300/46 seconds/point
const SECONDS_PER_MCQ = (90 * 60) / 60;
const SECONDS_PER_FRQ_POINT = (105 * 60) / (3 * 10 + 4 * 4);

export type TimerBreakdown = {
  mcqSeconds: number;
  frqSeconds: number;
  totalSeconds: number;
};

export function computePacing(mcqCount: number, longFrqCount: number, shortFrqCount: number): TimerBreakdown {
  const mcqSeconds = Math.round(mcqCount * SECONDS_PER_MCQ);
  const frqPoints = longFrqCount * 10 + shortFrqCount * 4;
  const frqSeconds = Math.round(frqPoints * SECONDS_PER_FRQ_POINT);
  return { mcqSeconds, frqSeconds, totalSeconds: mcqSeconds + frqSeconds };
}

export function formatDuration(totalSeconds: number): string {
  const clamped = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function computeEndTimestamp(totalSeconds: number, now: number): number {
  return now + totalSeconds * 1000;
}

export function getRemainingSeconds(endTimestamp: number, now: number): number {
  return Math.max(0, Math.round((endTimestamp - now) / 1000));
}
