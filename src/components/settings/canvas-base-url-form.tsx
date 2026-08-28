"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Field, Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { saveCanvasBaseUrl } from "@/actions/settings";

export function CanvasBaseUrlForm({ baseUrl }: { baseUrl: string }) {
  const [value, setValue] = useState(baseUrl);
  const [pending, start] = useTransition();
  const { toast } = useToast();

  function save() {
    start(async () => {
      const res = await saveCanvasBaseUrl(value);
      if (res.ok) toast("Canvas base URL saved.");
      else toast(res.error || "Could not save.", "error");
    });
  }

  return (
    <div className="space-y-2">
      <Field label="Canvas base URL" hint="Your school's Canvas domain, no trailing path — e.g. https://peddie.instructure.com">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://yourschool.instructure.com" />
      </Field>
      <Button size="sm" onClick={save} disabled={pending}>
        <Check className="h-3.5 w-3.5" /> {pending ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
