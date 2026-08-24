"use client";

import { useState, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createStudent, updateStudent } from "@/actions/students";
import type { ActionResult } from "@/actions/types";

export type StudentFormValues = {
  displayName: string;
  gradeLevel: string | null;
  status: string;
  notes: string | null;
  email: string | null;
};

// Owner-only "Add student" button that opens the create modal.
export function AddStudentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add student</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a student" className="max-w-2xl">
        <StudentFields mode="create" onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Save className="h-4 w-4" /> {pending ? "Saving…" : label}</Button>;
}

// The shared field set, used by both the create modal and the edit page.
export function StudentFields({
  mode,
  studentId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  studentId?: string;
  initial?: StudentFormValues;
  onDone?: () => void;
}) {
  const action = mode === "create" ? createStudent : updateStudent.bind(null, studentId!);
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false });
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && mode === "edit") toast("Student saved.");
    else if (state.error) toast(state.error, "error");
    if (state.ok) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Student name" required error={state.fieldErrors?.displayName}>
          <Input name="displayName" defaultValue={initial?.displayName ?? ""} required autoFocus />
        </Field>
        <Field label="Grade level" hint="Free text — e.g. Grade 6, 9th.">
          <Input name="gradeLevel" defaultValue={initial?.gradeLevel ?? ""} placeholder="Grade 6" />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select name="status" defaultValue={initial?.status ?? "ACTIVE"}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ARCHIVED">Archived</option>
          </Select>
        </Field>
        <Field label="Email" hint="Used for roster-import dedupe and portal invites." error={state.fieldErrors?.email}>
          <Input name="email" type="email" defaultValue={initial?.email ?? ""} placeholder="student@school.example" />
        </Field>
      </div>

      <Field label="Teacher notes (private)" hint="Only staff see these.">
        <Textarea name="notes" rows={2} defaultValue={initial?.notes ?? ""} />
      </Field>

      <div className="flex justify-end gap-2 pt-1">
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        <SubmitBtn label={mode === "create" ? "Create student" : "Save changes"} />
      </div>
    </form>
  );
}
