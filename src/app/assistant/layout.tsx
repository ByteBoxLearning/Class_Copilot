import { requireRole, enforcePasswordReset } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { listAccessibleClasses, resolveCurrentClassId } from "@/lib/classes";
import { APP_NAME } from "@/lib/app-config";

export default async function AssistantLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRole("ASSISTANT");
  enforcePasswordReset(user);
  const [classes, currentClassId] = await Promise.all([
    listAccessibleClasses(user),
    resolveCurrentClassId(user),
  ]);
  return (
    <AppShell user={user} classes={classes} currentClassId={currentClassId} brandName={APP_NAME}>
      {children}
    </AppShell>
  );
}
