"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { UserPlus, KeyRound, Copy, Check, ShieldCheck, ShieldOff, Clock, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TH, TR, TD } from "@/components/ui/table";
import { Modal, ConfirmModal } from "@/components/ui/modal";
import { Field, Input, Select } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { createUser, resetUserPassword, setUserActive, changeUserRole, updateUser, deleteUser, type CreateUserResult } from "@/actions/users";
import { formatDate } from "@/lib/utils";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};

function CreateBtn() {
  const { pending } = useFormStatus();
  return <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create user"}</Button>;
}

export function UserManager({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const [addOpen, setAddOpen] = useState(false);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [state, formAction] = useActionState<CreateUserResult, FormData>(createUser, { ok: false });
  const { toast } = useToast();
  const [saving, start] = useTransition();

  function saveEdit(id: string, name: string, email: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("email", email);
      const res = await updateUser(id, fd);
      if (res.ok) { toast("User updated."); setEditUser(null); }
      else toast(res.error ?? "Failed", "error");
    });
  }

  useEffect(() => {
    if (state.ok && state.tempPassword && state.email) {
      setAddOpen(false);
      setCredential({ email: state.email, password: state.tempPassword });
    } else if (state.error) {
      toast(state.error, "error");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  function reset(id: string) {
    start(async () => {
      const res = await resetUserPassword(id);
      if (res.ok && res.tempPassword && res.email) setCredential({ email: res.email, password: res.tempPassword });
      else toast(res.error ?? "Failed", "error");
    });
  }

  function toggleActive(id: string, active: boolean) {
    start(async () => {
      const res = await setUserActive(id, active);
      if (res.ok) toast(active ? "User activated." : "User deactivated.");
      else toast(res.error ?? "Failed", "error");
    });
  }

  function changeRole(id: string, role: "OWNER" | "ASSISTANT") {
    start(async () => {
      const res = await changeUserRole(id, role);
      if (res.ok) toast(`Role updated — takes effect on their next login.`);
      else toast(res.error ?? "Failed", "error");
    });
  }

  function del(u: UserRow) {
    setConfirmDelete(null);
    start(async () => {
      const res = await deleteUser(u.id);
      if (res.ok) toast(`${u.name} deleted.`);
      else toast(res.error ?? "Failed", "error"); // e.g. "has history — deactivate instead"
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setAddOpen(true)}><UserPlus className="h-4 w-4" /> Add employee</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <tr>
                <TH>Name</TH><TH>Email</TH><TH>Role</TH><TH>Status</TH><TH>Added</TH><TH></TH>
              </tr>
            </THead>
            <tbody>
              {users.map((u) => (
                <TR key={u.id}>
                  <TD className="font-medium">{u.name}{u.id === currentUserId && <span className="ml-1 text-xs text-slate-400">(you)</span>}</TD>
                  <TD className="text-slate-600">{u.email}</TD>
                  <TD>
                    {u.id === currentUserId ? (
                      <Badge color="bg-primary text-primary-foreground border-primary">Admin</Badge>
                    ) : (
                      <Select
                        value={u.role}
                        onChange={(e) => changeRole(u.id, e.target.value as "OWNER" | "ASSISTANT")}
                        className="h-8 w-auto text-xs"
                      >
                        <option value="ASSISTANT">Assistant</option>
                        <option value="OWNER">Owner</option>
                      </Select>
                    )}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      {u.active
                        ? <Badge color="bg-green-100 text-green-800 border-green-200">Active</Badge>
                        : <Badge color="bg-slate-100 text-slate-500 border-slate-200">Deactivated</Badge>}
                      {u.mustChangePassword && <Badge color="bg-amber-100 text-amber-800 border-amber-200"><Clock className="mr-1 h-3 w-3" />Pending first login</Badge>}
                    </div>
                  </TD>
                  <TD className="text-slate-500">{formatDate(u.createdAt)}</TD>
                  <TD>
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditUser(u)} title="Edit name / email">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => reset(u.id)} title="Reset password">
                        <KeyRound className="h-3.5 w-3.5" /> Reset
                      </Button>
                      {u.id !== currentUserId && (
                        u.active
                          ? <Button size="sm" variant="ghost" onClick={() => toggleActive(u.id, false)} title="Deactivate"><ShieldOff className="h-3.5 w-3.5 text-red-500" /></Button>
                          : <Button size="sm" variant="ghost" onClick={() => toggleActive(u.id, true)} title="Activate"><ShieldCheck className="h-3.5 w-3.5 text-green-600" /></Button>
                      )}
                      {u.id !== currentUserId && (
                        <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(u)} title="Delete user"><Trash2 className="h-3.5 w-3.5 text-red-600" /></Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardContent>
      </Card>

      {/* Add user modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add employee">
        <form action={formAction} className="space-y-3">
          <Field label="Full name" required error={state.fieldErrors?.name}>
            <Input name="name" required autoFocus />
          </Field>
          <Field label="Email" required error={state.fieldErrors?.email}>
            <Input name="email" type="email" required />
          </Field>
          <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-500">
            Creates a co-teacher (Assistant) account. A one-time password will be generated —
            share it with them; they&apos;ll be asked to set their own on first login. To make
            them an independent teacher with their own workspace instead, use the role switcher
            after creating them, or have them sign up separately at /signup.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <CreateBtn />
          </div>
        </form>
      </Modal>

      {/* One-time credential reveal */}
      <CredentialModal credential={credential} onClose={() => setCredential(null)} />

      {/* Edit name / email */}
      <EditUserModal user={editUser} saving={saving} onClose={() => setEditUser(null)} onSave={saveEdit} />

      {/* Delete confirmation (with caution) */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && del(confirmDelete)}
        title={`Delete ${confirmDelete?.name ?? "user"}?`}
        message={
          `⚠️ This permanently deletes the account "${confirmDelete?.email ?? ""}" and cannot be undone. ` +
          `It only works if this person has NO history — if they have added jobs, CVs, comments or activity, ` +
          `the delete is blocked and you'll be told to Deactivate instead (which keeps their work). ` +
          `Deactivate is the safer choice for anyone who has actually used the system.`
        }
        confirmLabel="Delete permanently"
        danger
      />
    </div>
  );
}

function EditUserModal({
  user,
  saving,
  onClose,
  onSave,
}: {
  user: UserRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (id: string, name: string, email: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  // Sync fields when a new user is opened.
  useEffect(() => {
    if (user) { setName(user.name); setEmail(user.email); }
  }, [user]);

  return (
    <Modal open={!!user} onClose={onClose} title="Edit user">
      {user && (
        <div className="space-y-3">
          <Field label="Full name">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
          <Field label="Email (login)">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <p className="rounded-md bg-slate-50 p-2 text-xs text-slate-500">
            Changing the email changes how this person logs in. Their password stays the same.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button disabled={saving} onClick={() => onSave(user.id, name.trim(), email.trim())}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function CredentialModal({ credential, onClose }: { credential: { email: string; password: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  async function copy() {
    if (!credential) return;
    const text = `Login: ${credential.email}\nTemporary password: ${credential.password}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast("Copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast("Copy failed — select the text manually.", "error");
    }
  }

  return (
    <Modal open={!!credential} onClose={onClose} title="One-time password" className="max-w-md">
      {credential && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Share these credentials with the employee now. <strong>The password is shown only once</strong> — it can&apos;t be viewed again (you can reset it later if needed).
          </p>
          <div className="rounded-lg border border-border bg-slate-50 p-3 text-sm">
            <p><span className="text-slate-400">Login: </span><span className="font-medium">{credential.email}</span></p>
            <p><span className="text-slate-400">Password: </span><span className="font-mono font-medium">{credential.password}</span></p>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Copy"}
            </Button>
            <Button onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
