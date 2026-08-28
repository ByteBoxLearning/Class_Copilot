import "server-only";
import { canvasGetAllPages } from "./client";

export type CanvasOutcomeResult = {
  id: number;
  score: number;
  percent: number | null; // 0-1 fraction, null if the outcome had no mastery_points to scale against
  submitted_or_assessed_at: string | null;
  links: { user: string; learning_outcome: string };
};

export async function fetchCourseOutcomeResults(courseId: number, outcomeIds: number[]): Promise<CanvasOutcomeResult[]> {
  if (outcomeIds.length === 0) return [];
  return canvasGetAllPages<CanvasOutcomeResult>(
    `/api/v1/courses/${courseId}/outcome_results`,
    { outcome_ids: outcomeIds },
    (page) => (page as { outcome_results?: CanvasOutcomeResult[] }).outcome_results ?? [],
  );
}

// A course's roster with each student's email — used to match a Canvas
// outcome result's `links.user` (a Canvas user id) to a Class Copilot
// Student, since the two systems obviously don't share user ids. Uses the
// well-documented course-roster endpoint rather than betting on exactly how
// outcome_results' own include[]=users sideloading is shaped.
export async function fetchCourseStudentEmails(courseId: number): Promise<Map<string, string>> {
  const users = await canvasGetAllPages<{ id: number; email?: string | null; login_id?: string | null }>(
    `/api/v1/courses/${courseId}/users`,
    { enrollment_type: ["student"], include: ["email"] },
  );
  const byId = new Map<string, string>();
  for (const u of users) {
    const email = u.email || u.login_id;
    if (email) byId.set(String(u.id), email.toLowerCase().trim());
  }
  return byId;
}
