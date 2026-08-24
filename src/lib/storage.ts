import "server-only";
import { promises as fs } from "fs";
import path from "path";

// File-storage seam, LOCAL-DISK ONLY — no cloud bucket branch. Adapted from
// the source CRM's src/lib/storage.ts, which picks between Supabase and
// local disk; that branch (and supabase-storage.ts / @supabase/supabase-js)
// is deliberately NOT revived here, since it's a real dependency that would
// do nothing until actually deploying online. Restore that branch then —
// this module's call shape (putObject/getObject/removeObject) is unchanged,
// so swapping the backend back in later is a small, contained edit.

const LOCAL_ROOT = path.join(process.cwd(), "uploads");

function localPathFor(objectPath: string): string {
  // Normalise and prevent path traversal.
  const clean = objectPath.replace(/\\/g, "/").split("/").filter((s) => s && s !== "..").join("/");
  return path.join(LOCAL_ROOT, clean);
}

export async function putObject(objectPath: string, data: Buffer, contentType?: string): Promise<string> {
  const full = localPathFor(objectPath);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, data);
  // Persist the content type alongside so downloads can serve it.
  if (contentType) {
    try { await fs.writeFile(`${full}.type`, contentType, "utf8"); } catch { /* best effort */ }
  }
  return objectPath;
}

export async function getObject(objectPath: string): Promise<{ bytes: Buffer; contentType: string }> {
  const full = localPathFor(objectPath);
  const bytes = await fs.readFile(full);
  let contentType = "application/octet-stream";
  try { contentType = (await fs.readFile(`${full}.type`, "utf8")).trim() || contentType; } catch { /* default */ }
  return { bytes, contentType };
}

export async function removeObject(objectPath: string): Promise<void> {
  const full = localPathFor(objectPath);
  try { await fs.unlink(full); } catch { /* already gone */ }
  try { await fs.unlink(`${full}.type`); } catch { /* ignore */ }
}
