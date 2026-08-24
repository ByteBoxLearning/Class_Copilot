"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmModal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { addCategory, toggleCategory, deleteCategory } from "@/actions/categories";

type Category = { id: string; name: string; description: string | null; active: boolean };

function AddBtn() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}><Plus className="h-4 w-4" /> {pending ? "Adding…" : "Add"}</Button>;
}

export function CategoryManager({ categories }: { categories: Category[] }) {
  const [state, action] = useActionState(addCategory, { ok: false } as { ok: boolean; error?: string });
  const { toast } = useToast();
  const [, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState<Category | null>(null);

  useEffect(() => {
    if (state.ok) toast("Category added.");
    else if (state.error) toast(state.error, "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function doDelete(cat: Category) {
    setConfirmDelete(null);
    start(async () => {
      const res = await deleteCategory(cat.id);
      if (res.ok) toast(`Deleted "${cat.name}".`);
      else toast(res.error ?? "Could not delete", "error");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="New category" className="flex-1"><Input name="name" placeholder="e.g. Combustion Engineer" required /></Field>
            <Field label="Description (optional)" className="flex-1"><Input name="description" /></Field>
            <AddBtn />
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((c) => (
          <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">{c.name}</p>
              {c.description && <p className="truncate text-xs text-slate-400">{c.description}</p>}
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button onClick={() => start(async () => { await toggleCategory(c.id, !c.active); })} title="Toggle active/inactive">
                <Badge color={c.active ? "bg-green-100 text-green-800 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}>
                  {c.active ? "Active" : "Inactive"}
                </Badge>
              </button>
              <button
                onClick={() => setConfirmDelete(c)}
                className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Delete category"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <ConfirmModal
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && doDelete(confirmDelete)}
        title="Delete category?"
        message={`Permanently delete "${confirmDelete?.name ?? ""}"? Jobs already using it will block the delete — deactivate instead to keep them. This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
