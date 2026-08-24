import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { accessibleStudentIds } from "./access";
import type { SessionUser } from "./auth";

type LogArgs = {
  userId: string;
  studentId?: string | null;
  actionType: string;
  fieldChanged?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  description?: string | null;
};

// Records a single activity-log entry. Never throws into the caller — logging
// must not break the primary action. `studentId` scopes the entry so staff
// can filter activity per student.
export async function logActivity(args: LogArgs): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        userId: args.userId,
        studentId: args.studentId ?? null,
        actionType: args.actionType,
        fieldChanged: args.fieldChanged ?? null,
        oldValue: args.oldValue ?? null,
        newValue: args.newValue ?? null,
        description: args.description ?? null,
      },
    });
  } catch (e) {
    console.error("[activity-log] failed to write entry", e);
  }
}

// A Prisma `where` fragment scoping ActivityLog rows to what this user may
// see: rows tied to a student they can access, plus account-management rows
// (no studentId at all — user create/delete/etc.) performed within their own
// workspace. Without this, every OWNER would see every workspace's activity
// platform-wide (the pre-multi-tenant assumption).
export async function activityScopeWhere(
  user: Pick<SessionUser, "id" | "role" | "studentId" | "allClientsAccess" | "ownerId">,
): Promise<Prisma.ActivityLogWhereInput> {
  const studentIds = await accessibleStudentIds(user);
  const workspaceOwnerId = user.role === "OWNER" ? user.id : (user.ownerId ?? user.id);
  return {
    OR: [
      studentIds === "ALL" ? { studentId: { not: null } } : { studentId: { in: studentIds } },
      { studentId: null, user: { OR: [{ id: workspaceOwnerId }, { ownerId: workspaceOwnerId }] } },
    ],
  };
}
