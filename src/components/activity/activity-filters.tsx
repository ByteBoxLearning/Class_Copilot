"use client";

import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/field";

// Owner-only filters for the activity log: by student and by user. Updates
// the URL search params (server re-queries).
export function ActivityFilters({
  students,
  users,
  currentStudent,
  currentUser,
}: {
  students: { id: string; displayName: string }[];
  users: { id: string; name: string }[];
  currentStudent: string;
  currentUser: string;
}) {
  const router = useRouter();

  function update(next: { student?: string; user?: string }) {
    const p = new URLSearchParams();
    const student = next.student ?? currentStudent;
    const user = next.user ?? currentUser;
    if (student) p.set("student", student);
    if (user) p.set("user", user);
    router.push(`/admin/activity${p.toString() ? `?${p}` : ""}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <span>Student</span>
        <Select value={currentStudent} onChange={(e) => update({ student: e.target.value })} className="h-9 w-auto">
          <option value="">All students</option>
          {students.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </Select>
      </label>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <span>User</span>
        <Select value={currentUser} onChange={(e) => update({ user: e.target.value })} className="h-9 w-auto">
          <option value="">Everyone</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </label>
      {(currentStudent || currentUser) && (
        <button onClick={() => router.push("/admin/activity")} className="text-xs text-primary hover:underline">Clear filters</button>
      )}
    </div>
  );
}
