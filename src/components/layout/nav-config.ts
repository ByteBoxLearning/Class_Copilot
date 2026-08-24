import {
  LayoutDashboard,
  ListChecks,
  Activity,
  Tags,
  Users,
  UserCog,
  Contact,
  ClipboardCheck,
  Target,
  BookOpen,
  TrendingUp,
  GraduationCap,
  NotebookPen,
  Settings,
  FileText,
  BarChart3,
  FlaskConical,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; href: string; icon: LucideIcon };

// Only routes that actually exist get listed here — see TODO.md for what's
// still coming. Nav items for the stripped Job-pipeline subsystem (Jobs, CV
// Builder, Job Search, Daily Summaries, Time & Productivity) were removed in
// the Milestone A cleanup sweep along with the routes themselves. Settings
// and Reports were both in that original strip too, but came back later —
// Settings scoped to AI keys (Milestone G.1), Reports rebuilt from scratch
// around mastery/engagement data instead of the old job-pipeline metrics
// (Milestone I).
export const OWNER_NAV: NavItem[] = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Monitor", href: "/classes/monitor", icon: ClipboardCheck },
  { label: "Classes", href: "/admin/classes", icon: BookOpen },
  { label: "Standards", href: "/classes/standards", icon: Target },
  { label: "Mastery", href: "/classes/mastery", icon: TrendingUp },
  { label: "Grading", href: "/classes/grading", icon: GraduationCap },
  { label: "Assignments", href: "/classes/assignments", icon: FileText },
  { label: "Practice Review", href: "/classes/practice-review", icon: FlaskConical },
  { label: "Comments", href: "/classes/comments", icon: NotebookPen },
  { label: "Reports", href: "/classes/reports", icon: BarChart3 },
  { label: "Students", href: "/admin/students", icon: Contact },
  { label: "Co-Teachers", href: "/admin/assistants", icon: UserCog },
  { label: "Tasks", href: "/admin/tasks", icon: ListChecks },
  { label: "Activity Log", href: "/admin/activity", icon: Activity },
  { label: "Categories", href: "/admin/categories", icon: Tags },
  { label: "Users", href: "/admin/users", icon: Users },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export const ASSISTANT_NAV: NavItem[] = [
  { label: "Dashboard", href: "/assistant/dashboard", icon: LayoutDashboard },
  { label: "Monitor", href: "/classes/monitor", icon: ClipboardCheck },
  { label: "Standards", href: "/classes/standards", icon: Target },
  { label: "Mastery", href: "/classes/mastery", icon: TrendingUp },
  { label: "Grading", href: "/classes/grading", icon: GraduationCap },
  { label: "Assignments", href: "/classes/assignments", icon: FileText },
  { label: "Practice Review", href: "/classes/practice-review", icon: FlaskConical },
  { label: "Comments", href: "/classes/comments", icon: NotebookPen },
  { label: "Reports", href: "/classes/reports", icon: BarChart3 },
  { label: "My Tasks", href: "/assistant/tasks", icon: ListChecks },
];

// CLIENT portal — a limited view scoped to their own data. No class
// switcher (see app-shell.tsx) — each page shows all the student's active
// classes at once rather than one at a time.
export const CLIENT_NAV: NavItem[] = [
  { label: "Overview", href: "/portal/dashboard", icon: LayoutDashboard },
  { label: "Mastery", href: "/portal/mastery", icon: TrendingUp },
  { label: "Engagement", href: "/portal/engagement", icon: ClipboardCheck },
  { label: "Practice", href: "/portal/practice", icon: FlaskConical },
];

// Legacy alias (some imports may still reference ADMIN_NAV).
export const ADMIN_NAV = OWNER_NAV;

export function navFor(role: string): NavItem[] {
  if (role === "CLIENT") return CLIENT_NAV;
  if (role === "ASSISTANT") return ASSISTANT_NAV;
  return OWNER_NAV; // OWNER / legacy ADMIN
}
