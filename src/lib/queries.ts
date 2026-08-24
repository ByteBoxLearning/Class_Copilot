import "server-only";

// A student-scope constraint for dashboard/report aggregates. Pass "ALL"
// (owner / whole roster) or a list of student ids (a co-teacher's
// accessible students). An empty list yields a match-nothing filter, never
// "all". Reused by src/lib/reports.ts's Milestone I aggregates — the same
// shape `accessibleStudentIds()` (src/lib/access.ts) already returns.
export type StatScope = "ALL" | string[];
