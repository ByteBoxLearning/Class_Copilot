// One-time setup: create the private "job-files" Storage bucket in Supabase.
// Idempotent — safe to run more than once. Run with: npx tsx prisma/setup-storage.ts
import { createClient } from "@supabase/supabase-js";

// Keep in sync with STORAGE_BUCKET in src/lib/supabase-storage.ts.
// (Defined locally so this script doesn't import the "server-only" module.)
const STORAGE_BUCKET = "job-files";

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env first.");

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const { data: buckets } = await supabase.storage.listBuckets();
  if (buckets?.some((b) => b.name === STORAGE_BUCKET)) {
    console.log(`✓ Bucket "${STORAGE_BUCKET}" already exists.`);
    return;
  }

  const { error } = await supabase.storage.createBucket(STORAGE_BUCKET, {
    public: false, // private — files are served only via the authenticated route
    fileSizeLimit: "15MB",
  });
  if (error) throw new Error(`Failed to create bucket: ${error.message}`);
  console.log(`✅ Created private bucket "${STORAGE_BUCKET}".`);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
