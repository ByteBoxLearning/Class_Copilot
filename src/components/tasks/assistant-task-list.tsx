"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Repeat, ChevronDown, Save } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, PriorityBadge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { toggleTask, updateTaskNotes } from "@/actions/tasks";
import { cn } from "@/lib/utils";

type Task = {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  recurring: boolean;
  completed: boolean;
  notes: string | null;
  evidenceUrl: string | null;
  studentName?: string | null;
};

export function AssistantTaskList({ tasks }: { tasks: Task[] }) {
  const [state, setState] = useState(tasks);
  const [, start] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);
  const { toast } = useToast();

  const done = state.filter((t) => t.completed).length;

  function toggle(id: string) {
    const next = !state.find((t) => t.id === id)?.completed;
    setState((prev) => prev.map((t) => (t.id === id ? { ...t, completed: next } : t)));
    start(() => { toggleTask(id, next); });
  }

  function saveNotes(id: string, notes: string, evidenceUrl: string) {
    setState((prev) => prev.map((t) => (t.id === id ? { ...t, notes, evidenceUrl } : t)));
    start(async () => { await updateTaskNotes(id, notes, evidenceUrl); toast("Saved."); });
  }

  if (state.length === 0) {
    return <p className="text-sm text-slate-400">No tasks assigned to you yet.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">{done}/{state.length} completed</p>
      {state.map((t) => (
        <Card key={t.id}>
          <CardContent className="py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <button onClick={() => toggle(t.id)} className="mt-0.5">
                  {t.completed ? <CheckCircle2 className="h-5 w-5 text-green-600" /> : <Circle className="h-5 w-5 text-slate-300 hover:text-slate-400" />}
                </button>
                <div>
                  <p className={cn("text-sm font-medium", t.completed ? "text-slate-400 line-through" : "text-slate-800")}>{t.title}</p>
                  {t.description && <p className="text-xs text-slate-500">{t.description}</p>}
                  <div className="mt-1 flex items-center gap-2">
                    <PriorityBadge value={t.priority} />
                    {t.recurring && <Badge color="bg-indigo-100 text-indigo-700 border-indigo-200"><Repeat className="mr-1 h-3 w-3" /> Daily</Badge>}
                    {t.studentName && <Badge color="bg-slate-100 text-slate-600 border-slate-200">{t.studentName}</Badge>}
                  </div>
                </div>
              </div>
              <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} className="rounded p-1 text-slate-400 hover:bg-accent">
                <ChevronDown className={cn("h-4 w-4 transition-transform", expanded === t.id && "rotate-180")} />
              </button>
            </div>

            {expanded === t.id && <NotesEditor task={t} onSave={saveNotes} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function NotesEditor({ task, onSave }: { task: Task; onSave: (id: string, notes: string, evidence: string) => void }) {
  const [notes, setNotes] = useState(task.notes ?? "");
  const [evidence, setEvidence] = useState(task.evidenceUrl ?? "");
  return (
    <div className="mt-3 space-y-2 border-t border-border pt-3">
      <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Task notes / blockers…" />
      <Input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence URL (optional)" type="url" />
      <div className="flex justify-end">
        <Button size="sm" onClick={() => onSave(task.id, notes, evidence)}><Save className="h-4 w-4" /> Save</Button>
      </div>
    </div>
  );
}
