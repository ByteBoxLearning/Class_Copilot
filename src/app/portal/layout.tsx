import { redirect } from "next/navigation";
import { requireUser, enforcePasswordReset } from "@/lib/auth";
import { dashboardPathFor } from "@/lib/auth-paths";
import { AppShell } from "@/components/layout/app-shell";
import { APP_NAME } from "@/lib/app-config";

// The CLIENT (Student) portal — a limited area scoped to the student's own
// data. Staff are redirected to their own workspace.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (user.role !== "CLIENT") redirect(dashboardPathFor(user.role));
  enforcePasswordReset(user);
  return <AppShell user={user} brandName={APP_NAME}>{children}</AppShell>;
}
