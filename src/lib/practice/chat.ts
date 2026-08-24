import "server-only";
import { runModel } from "@/lib/ai/run-model";
import { DEFAULT_AI_MODEL } from "@/lib/ai/engines";
import { NOTATION_RULES } from "./notation";
import type { ChatMessage, MCQItem, FRQItem } from "./types";

// A scoped, per-question follow-up chat — ported from the standalone tool's
// app/api/chat/route.ts. That tool used Claude's native multi-turn
// `messages.create({ system, messages })`; this app's runModel/callClaude
// only accepts a single prompt string (the interface every provider shares),
// so history + system framing are folded into one prompt instead of a
// separate system role + message array. Thinner grounding for INTRO_CHEM
// items than AP_CHEM (no workedSolution/explanation field on that bank) is a
// known, accepted limitation — see the Practice Mode decision doc.
function buildContext(itemType: "mcq" | "frq", item: MCQItem | FRQItem): string {
  if (itemType === "mcq") {
    const m = item as MCQItem;
    return [
      `STEM: ${m.stem}`,
      `CHOICES: ${m.choices.join(" | ")}`,
      `CORRECT ANSWER: ${m.choices[m.correctIndex]}`,
      m.workedSolution ? `WORKED SOLUTION: ${m.workedSolution}` : null,
      m.explanation ? `EXPLANATION: ${m.explanation}` : null,
    ].filter(Boolean).join("\n");
  }
  const f = item as FRQItem;
  return `STEM: ${f.stem}\nPARTS: ${JSON.stringify(f.parts)}\nWORKED SOLUTION: ${f.workedSolution}\nRUBRIC: ${JSON.stringify(f.rubric)}`;
}

export async function sendPracticeChatMessage(
  itemType: "mcq" | "frq",
  item: MCQItem | FRQItem,
  studentContext: string,
  history: ChatMessage[],
  message: string,
): Promise<string> {
  const transcript = history.map((h) => `${h.role === "user" ? "Student" : "Tutor"}: ${h.content}`).join("\n");

  const prompt = `You are a helpful chemistry tutor answering a student's follow-up question about ONE specific practice question they have already submitted and had scored. Only discuss this question; do not answer unrelated chemistry questions.

QUESTION CONTEXT:
${buildContext(itemType, item)}

WHAT THE STUDENT ACTUALLY SUBMITTED AND HOW IT WAS SCORED:
${studentContext}

Rules:
- The student has already submitted this question, so it is fine to discuss the correct answer and reasoning.
- Always ground your answer in what the student actually wrote and how it was scored (given above) — never ask them to repeat their answer, since you already have it.
- Explain reasoning and concepts in your own words rather than pasting the raw rubric or worked solution verbatim.
- Keep answers focused, concise, and at the level of the course.
${NOTATION_RULES}
${transcript ? `\nCONVERSATION SO FAR:\n${transcript}\n` : ""}
Student: ${message}
Tutor:`;

  const result = await runModel(prompt, DEFAULT_AI_MODEL);
  return result.text?.trim() || "Sorry, I couldn't come up with a reply just now — try asking again.";
}
