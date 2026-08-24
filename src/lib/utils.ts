import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---- Date helpers ---------------------------------------------------------

export function formatDate(d?: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(d?: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(d?: Date | string | null): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDate(date);
}

// Local YYYY-MM-DD (used for per-day checklist keys and summaries).
export function localDayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function startOfWeek(): Date {
  const d = startOfToday();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

// ---- Deadline logic -------------------------------------------------------

export type DeadlineState = {
  label: string;
  className: string;
  urgent: boolean;
  daysLeft: number | null;
};

export function deadlineState(closingDate?: Date | string | null): DeadlineState {
  if (!closingDate) {
    return {
      label: "Deadline not provided",
      className: "bg-slate-100 text-slate-500 border-slate-200",
      urgent: false,
      daysLeft: null,
    };
  }
  const date = typeof closingDate === "string" ? new Date(closingDate) : closingDate;
  const today = startOfToday();
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);

  if (days < 0)
    return { label: "Deadline passed", className: "bg-slate-200 text-slate-600 border-slate-300", urgent: false, daysLeft: days };
  if (days === 0)
    return { label: "Deadline today", className: "bg-red-100 text-red-800 border-red-200", urgent: true, daysLeft: 0 };
  if (days === 1)
    return { label: "Deadline tomorrow", className: "bg-red-100 text-red-800 border-red-200", urgent: true, daysLeft: 1 };
  if (days <= 3)
    return { label: `Deadline in ${days} days`, className: "bg-orange-100 text-orange-800 border-orange-200", urgent: true, daysLeft: days };
  if (days <= 7)
    return { label: `Deadline in ${days} days`, className: "bg-amber-100 text-amber-800 border-amber-200", urgent: true, daysLeft: days };
  return { label: `Deadline in ${days} days`, className: "bg-slate-100 text-slate-600 border-slate-200", urgent: false, daysLeft: days };
}

// ---- Misc -----------------------------------------------------------------

export function titleCaseFromEnum(value?: string | null): string {
  if (!value) return "—";
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Human label for a camelCase field name, e.g. "companyName" → "Company name",
// "jobTitle" → "Job title". Used for the "Missing: …" badge.
export function fieldLabel(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// The set of fields we consider "important" for judging completeness.
export const IMPORTANT_JOB_FIELDS = [
  "jobTitle",
  "companyName",
  "location",
  "country",
] as const;

// Returns which important fields are missing, given a partial job.
export function missingImportantFields(job: Record<string, unknown>): string[] {
  return IMPORTANT_JOB_FIELDS.filter((f) => {
    const v = job[f];
    return v === null || v === undefined || v === "";
  });
}
