"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { deleteAssignment } from "@/actions/assignments";
import { ASSIGNMENT_TYPES, ASSIGNMENT_STATUSES, BADGE_COLORS, labelOf } from "@/lib/enums";

export type AssignmentRow = {
  id: string;
  title: string;
  assignmentType: string;
  status: string;
  standardsCount: number;
  updatedAt: string;
};

export function AssignmentList({ assignments }: { assignments: AssignmentRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; title: string } | null>(null);

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await deleteAssignment(confirmDelete.id);
    if (res.ok) { toast("Assignment deleted."); router.refresh(); }
    else toast(res.error || "Could not delete.", "error");
    setConfirmDelete(null);
  }

  if (assignments.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-white py-8 text-center text-sm text-slate-400">
        No assignments yet for this class.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2 font-medium">Title</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Standards</th>
            <th className="px-3 py-2 font-medium">Updated</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => (
            <tr key={a.id} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-2.5">
                <Link href={`/classes/assignments/${a.id}`} className="font-medium text-slate-800 hover:underline">{a.title}</Link>
              </td>
              <td className="px-3 py-2.5 text-slate-600">{labelOf(ASSIGNMENT_TYPES, a.assignmentType)}</td>
              <td className="px-3 py-2.5">
                <Badge color={BADGE_COLORS[a.status] ?? "bg-slate-100 text-slate-600 border-slate-200"}>{labelOf(ASSIGNMENT_STATUSES, a.status)}</Badge>
              </td>
              <td className="px-3 py-2.5 text-slate-500">{a.standardsCount}</td>
              <td className="px-3 py-2.5 text-slate-400">{a.updatedAt}</td>
              <td className="px-3 py-2.5">
                <div className="flex justify-end gap-1">
                  <Link href={`/classes/assignments/${a.id}`} className="rounded p-1.5 text-slate-400 hover:bg-accent hover:text-slate-600" title="Edit">
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button type="button" onClick={() => setConfirmDelete({ id: a.id, title: a.title })} className="rounded p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Delete">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        title="Delete this assignment?"
        message={`"${confirmDelete?.title}" and any attached files will be permanently deleted. This can't be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
