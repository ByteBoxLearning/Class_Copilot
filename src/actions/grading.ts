"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOwner } from "@/lib/auth";
import { assertCanAccessClass } from "@/lib/access";
import { logActivity } from "@/lib/activity-log";
import { gradingPolicySchema } from "@/lib/validations";
import type { ActionResult } from "./types";

function formToObject(fd: FormData): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) obj[k] = v;
  return obj;
}

// Owner-only (co-teachers get a read-only view of how a class's grade is
// computed — they don't set the policy).
export async function saveGradingPolicy(classId: string, _prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const user = await requireOwner();
  await assertCanAccessClass(user, classId);

  const parsed = gradingPolicySchema.safeParse(formToObject(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] = i.message;
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;

  const levelPercent = { "1": d.level1, "2": d.level2, "3": d.level3, "4": d.level4 };
  const config =
    d.type === "WEIGHTED"
      ? {
          levelPercent,
          minEvents: d.minEvents,
          masteryWeight: d.masteryWeight,
          engagementWeight: d.engagementWeight,
          engagementValue: { ENGAGED: d.engagedValue ?? 100, DISTRACTING: d.distractingValue ?? 50 },
          windowDays: null,
        }
      : { levelPercent, minEvents: d.minEvents };

  const masteryConfig = {
    decayRate: d.decayRate,
    windowSize: d.windowSize,
    evidenceWeights: {
      QUIZ: d.evidenceWeightQuiz,
      HOMEWORK: d.evidenceWeightHomework,
      PROJECT: d.evidenceWeightProject,
      OBSERVATION: d.evidenceWeightObservation,
      CONVERSATION: d.evidenceWeightConversation,
      RETAKE: d.evidenceWeightRetake,
      PRACTICE: d.evidenceWeightPractice,
      OTHER: d.evidenceWeightOther,
    },
  };

  await prisma.gradingPolicy.upsert({
    where: { classId },
    update: {
      type: d.type,
      configJson: JSON.stringify(config),
      masteryStrategy: d.masteryStrategy,
      masteryConfigJson: JSON.stringify(masteryConfig),
      updatedById: user.id,
    },
    create: {
      classId,
      type: d.type,
      configJson: JSON.stringify(config),
      masteryStrategy: d.masteryStrategy,
      masteryConfigJson: JSON.stringify(masteryConfig),
      updatedById: user.id,
    },
  });
  await logActivity({ userId: user.id, actionType: "GRADING_POLICY_UPDATED", description: `Set grading policy to ${d.type}` });

  revalidatePath(`/admin/classes/${classId}/grading`);
  revalidatePath(`/admin/classes/${classId}`);
  revalidatePath("/admin/students");
  revalidatePath("/classes/mastery");
  return { ok: true };
}
