"use client";

import { useState, useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Save } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { createClass, updateClass } from "@/actions/classes";
import type { ActionResult } from "@/actions/types";

export type ClassFormValues = {
  name: string;
  subject: string | null;
  period: string | null;
  academicYear: string | null;
};

// Owner-only "Add class" button that opens the create modal.
export function AddClassButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Add class</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Add a class" className="max-w-lg">
        <ClassFields mode="create" onDone={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function SubmitBtn({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Save className="h-4 w-4" /> {pending ? "Saving…" : label}</Button>;
}

export function ClassFields({
  mode,
  classId,
  initial,
  onDone,
}: {
  mode: "create" | "edit";
  classId?: string;
  initial?: ClassFormValues;
  onDone?: () => void;
}) {
  const action = mode === "create" ? createClass : updateClass.bind(null, classId!);
  const [state, formAction] = useActionState<ActionResult, FormData>(action, { ok: false });
  const { toast } = useToast();

  useEffect(() => {
    if (state.ok && mode === "edit") toast("Class saved.");
    else if (state.error) toast(state.error, "error");
    if (state.ok) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form action={formAction} className="space-y-4">
      <Field label="Class name" required error={state.fieldErrors?.name}>
        <Input name="name" defaultValue={initial?.name ?? ""} placeholder="Algebra I — Period 3" required autoFocus />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Subject">
          <Input name="subject" defaultValue={initial?.subject ?? ""} placeholder="Algebra I" />
        </Field>
        <Field label="Period">
          <Input name="period" defaultValue={initial?.period ?? ""} placeholder="P3" />
        </Field>
        <Field label="Academic year">
          <Input name="academicYear" defaultValue={initial?.academicYear ?? ""} placeholder="2026-2027" />
        </Field>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        {onDone && <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>}
        <SubmitBtn label={mode === "create" ? "Create class" : "Save changes"} />
      </div>
    </form>
  );
}
