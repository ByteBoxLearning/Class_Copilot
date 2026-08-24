import { requireStaff, enforcePasswordReset } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import { listAccessibleClasses, resolveCurrentClassId } from "@/lib/classes";
import { APP_NAME } from "@/lib/app-config";

// Shared staff workspace routes (Monitor, Standards) — reachable by both the
// Teacher (OWNER) and any Co-Teacher (ASSISTANT), unlike /admin and
// /assistant which are role-specific. A CLIENT (Student) portal user must
// never reach these; requireStaff() enforces that.
export default async function ClassesLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
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
