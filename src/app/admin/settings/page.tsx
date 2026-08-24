import { Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Wand2, BarChart3 } from "lucide-react";
import { requireOwner } from "@/lib/auth";
import {
  getKeyStatuses, getAiModelChoices, getAiTemps, getCommentsPrompt,
  getAssignmentGeneratePrompt, getAssignmentImprovePrompt, getAiDisclosureAck,
} from "@/lib/settings";
import { getAssignmentUsageStats } from "@/lib/assignments/usage";
import { allowedEmailDomain } from "@/lib/allowed-email";
import { listAllowedEmails } from "@/actions/allowed-emails";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysForm } from "@/components/settings/api-keys-form";
import { AiModelToggles } from "@/components/settings/ai-model-toggles";
import { AiTemperatureControl } from "@/components/settings/ai-temperature-control";
import { CommentsPromptForm } from "@/components/settings/comments-prompt-form";
import { AssignmentGeneratePromptForm, AssignmentImprovePromptForm } from "@/components/settings/assignment-prompt-forms";
import { AiUsagePanel } from "@/components/settings/ai-usage-panel";
import { RosterAllowlistForm } from "@/components/settings/roster-allowlist-form";
import { AiDisclosureAck } from "@/components/settings/ai-disclosure-ack";

export default async function AdminSettingsPage() {
  await requireOwner();
  const [statuses, aiModels, aiTemps, commentsPrompt, assignmentGeneratePrompt, assignmentImprovePrompt, usageStats, allowedEmails, aiAck] = await Promise.all([
    getKeyStatuses(), getAiModelChoices(), getAiTemps(), getCommentsPrompt(),
    getAssignmentGeneratePrompt(), getAssignmentImprovePrompt(), getAssignmentUsageStats(), listAllowedEmails(), getAiDisclosureAck(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        subtitle="AI provider keys and engines — managed here, no redeploy needed."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> Approved sign-up roster
          </CardTitle>
          <p className="text-xs text-slate-400">
            Who's allowed to create a teacher account or link a student portal login via Google — see TODO.md's security section.
          </p>
        </CardHeader>
        <CardContent>
          <RosterAllowlistForm rows={allowedEmails} domain={allowedEmailDomain()} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" /> AI data-sharing disclosure
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AiDisclosureAck acknowledged={aiAck} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> API keys
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ApiKeysForm statuses={statuses} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" /> AI engines
          </CardTitle>
          <p className="text-xs text-slate-400">
            Controls the engine picker in every AI feature (End-of-Term Comments and the Assignment Builder).
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <AiModelToggles models={aiModels} />
          <AiTemperatureControl temps={aiTemps} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> AI usage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AiUsagePanel stats={usageStats} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wand2 className="h-4 w-4 text-indigo-600" /> Prompts
          </CardTitle>
          <p className="text-xs text-slate-400">
            The AI prompts behind every AI feature. Edit them to change tone or emphasis — no code needed.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <CommentsPromptForm prompt={commentsPrompt} />
          <div className="border-t border-border pt-6">
            <AssignmentGeneratePromptForm prompt={assignmentGeneratePrompt} />
          </div>
          <div className="border-t border-border pt-6">
            <AssignmentImprovePromptForm prompt={assignmentImprovePrompt} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 text-sm text-slate-500">
          <p className="mb-2 flex items-center gap-2 font-medium text-slate-700">
            <ShieldCheck className="h-4 w-4 text-green-600" /> How this works
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>A key saved here is <strong>encrypted</strong> and stored in the database, then used by every AI feature — for you and your co-teachers (they never see it).</li>
            <li>A key set here <strong>overrides</strong> the matching environment variable; clear it to fall back to the env var.</li>
            <li>Keys are <strong>masked</strong> — the full value is never shown again after saving.</li>
            <li>The Google OAuth keys are reserved for the still-blocked Google Sheets roster import — safe to leave unset for now.</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
