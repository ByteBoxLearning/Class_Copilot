import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { canAccessClass } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { getObject } from "@/lib/storage";

// Authenticated + IDOR-guarded download endpoint. Uploaded assignment
// materials are private and never public. The file must belong to a class
// the requester may access — one teacher can't fetch another's materials by
// guessing an id. Single-table check via the denormalized `classId` on
// AssignmentMaterial (see schema.prisma's comment on that field), same trick
// the source CRM used for JobFile.clientId in /api/files/[id]/route.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const material = await prisma.assignmentMaterial.findUnique({ where: { id } });
  if (!material) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await canAccessClass(user, material.classId))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const { bytes, contentType } = await getObject(material.filePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": material.mimeType || contentType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(material.fileName)}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing in storage" }, { status: 404 });
  }
}
