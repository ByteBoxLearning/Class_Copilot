// Scripted test for the End-of-Term Comments generator + the revived AI
// settings infra. Run:
// node --env-file=.env --import tsx scripts/comments-test.mts
//
// comments/format.ts has no server-only/Prisma imports, so it's imported
// directly, same as grading-math.ts/mastery-math.ts. Everything with
// "server-only" (crypto.ts, settings.ts, comments/summary.ts, ai/*) can't be
// resolved by plain tsx/Node the way Next.js's bundler does — see
// roster-import-test.mts for the same constraint — so those pieces' logic is
// re-implemented inline against a fully self-contained fixture, matching the
// precedent set by mastery-test.mts and grading-test.mts.
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { buildCommentsPrompt, DIMENSION_KEYS, type StudentTermSummary } from "../src/lib/comments/format";
import { computeMastery } from "../src/lib/mastery-math";
import { DEFAULT_COMMENTS_PROMPT } from "../src/lib/comments/prompt-defaults";
import { AI_MODELS, AI_PROVIDER_ORDER, AI_PROVIDER_META, defaultEnabledValues } from "../src/lib/ai/engines";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

// --- crypto.ts's algorithm, reimplemented inline (server-only blocks direct import) ---
function secretKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set.");
  return crypto.createHash("sha256").update(secret).digest();
}
function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, enc].map((b) => b.toString("base64")).join(".");
}
function decryptSecret(blob: string): string {
  const [iv, tag, enc] = blob.split(".").map((s) => Buffer.from(s, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

async function main() {
  console.log("Pure prompt formatting (comments/format.ts):");

  const emptySummary: StudentTermSummary = {
    studentName: "Ava Thompson",
    className: "Math — Period 3",
    dateRange: "2026-06-01 to 2026-08-01",
    dimensionTallies: Object.fromEntries(DIMENSION_KEYS.map((k) => [k, { positiveLabel: "Positive", negativeLabel: "Negative", positive: 0, negative: 0 }])) as StudentTermSummary["dimensionTallies"],
    dailyNotes: [],
    standards: [],
    totalDailyChecks: 0,
  };
  const emptyPrompt = buildCommentsPrompt(DEFAULT_COMMENTS_PROMPT, emptySummary);
  check("placeholders are fully substituted (no {{ }} left)", !/\{\{[A-Z_]+\}\}/.test(emptyPrompt));
  check("student name appears in the assembled prompt", emptyPrompt.includes("Ava Thompson"));
  check("no daily checks -> a plain 'no data' sentence, not an empty section", emptyPrompt.includes("No daily check-ins were logged"));
  check("no mastery evidence -> a plain 'no data' sentence, not an empty section", emptyPrompt.includes("No standards-mastery evidence"));

  const fullSummary: StudentTermSummary = {
    ...emptySummary,
    dimensionTallies: {
      ...emptySummary.dimensionTallies,
      engagement: { positiveLabel: "Engaged", negativeLabel: "Distracting", positive: 5, negative: 1 },
      collaboration: { positiveLabel: "Collaborative", negativeLabel: "Uncooperative", positive: 3, negative: 0 },
    },
    dailyNotes: [{ date: "2026-06-15", text: "Helped a classmate after a rough start to group work." }],
    standards: [{ code: "6.RP.1", title: "Understands ratio concepts", levelLabel: "Proficient", sampleSize: 3 }],
  };
  const fullPrompt = buildCommentsPrompt(DEFAULT_COMMENTS_PROMPT, fullSummary);
  check("engagement tally (5 positive, 1 negative) appears", fullPrompt.includes('Engagement: 5x "Engaged", 1x "Distracting"'));
  check("a dimension with zero activity (Discipline) is omitted, not shown as 0/0", !fullPrompt.includes("Discipline: 0x"));
  check("the free-text daily note appears verbatim", fullPrompt.includes("Helped a classmate after a rough start to group work."));
  check("mastery standard + level appears", fullPrompt.includes("[6.RP.1] Understands ratio concepts: Proficient (3 pieces of evidence)"));

  console.log("\nAI engine registry (ai/engines.ts) — lock-state derivation logic:");
  // Reimplements getAiModelChoices()'s core logic (settings.ts is server-only)
  // against a manually-supplied key-presence map, to verify the actual
  // lock/enabled derivation without touching Prisma.
  const enabled = new Set(defaultEnabledValues());
  const keyPresence: Record<string, boolean> = { GEMINI: false, OPENAI: true, CLAUDE: false, OPENROUTER: false };
  const choices = AI_MODELS.map((m) => {
    const hasKey = keyPresence[m.provider];
    const locked = !enabled.has(m.value) || !hasKey;
    return { value: m.value, provider: m.provider, hasKey, locked };
  });
  check("with zero keys configured except OpenAI, only OpenAI models are unlocked", choices.filter((c) => !c.locked).every((c) => c.provider === "OPENAI"));
  check("at least one OpenAI model is unlocked", choices.some((c) => c.provider === "OPENAI" && !c.locked));
  check("Gemini/Claude/OpenRouter models are all locked (needs key) when their keys are absent", choices.filter((c) => c.provider !== "OPENAI").every((c) => c.locked));
  check("every provider is represented in AI_PROVIDER_ORDER", AI_PROVIDER_ORDER.every((p) => AI_PROVIDER_META[p]));

  console.log("\nCrypto round trip (crypto.ts's algorithm, reimplemented inline):");
  const plaintext = "sk-test-1234567890abcdef";
  const encrypted = encryptSecret(plaintext);
  check("encrypted blob is not the plaintext", encrypted !== plaintext);
  check("decrypting returns the original plaintext", decryptSecret(encrypted) === plaintext);
  let tamperDetected = false;
  try {
    const [iv, tag, enc] = encrypted.split(".");
    const tampered = [iv, tag, Buffer.from("tampered-ciphertext").toString("base64")].join(".");
    decryptSecret(tampered);
  } catch {
    tamperDetected = true;
  }
  check("a tampered ciphertext fails to decrypt (auth tag catches it)", tamperDetected);

  console.log("\nSetting table round trip (real DB, self-contained key):");
  const testKeyName = "TEST_COMMENTS_SCRIPT_KEY";
  await prisma.setting.deleteMany({ where: { key: testKeyName } });
  const enc = encryptSecret("test-secret-value");
  await prisma.setting.upsert({ where: { key: testKeyName }, create: { key: testKeyName, value: enc }, update: { value: enc } });
  const row = await prisma.setting.findUnique({ where: { key: testKeyName } });
  check("a Setting row round-trips through the real database", !!row && decryptSecret(row.value) === "test-secret-value");
  await prisma.setting.deleteMany({ where: { key: testKeyName } });
  const afterDelete = await prisma.setting.findUnique({ where: { key: testKeyName } });
  check("clearing a key removes the row (falls back to env, matching getApiKey's contract)", afterDelete === null);

  console.log("\nStudent term summary — self-contained fixture, range-scoped mastery:");
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });
  const cls = await prisma.class.upsert({
    where: { id: "test-comments-class" }, update: {},
    create: { id: "test-comments-class", name: "[test fixture] Comments", teacherId: teacher.id },
  });
  const student = await prisma.student.upsert({
    where: { id: "test-comments-student" }, update: {},
    create: { id: "test-comments-student", displayName: "[test fixture] Student", createdByUserId: teacher.id },
  });
  await prisma.enrollment.upsert({
    where: { studentId_classId: { studentId: student.id, classId: cls.id } },
    update: { status: "ACTIVE" }, create: { studentId: student.id, classId: cls.id, status: "ACTIVE" },
  });
  const standard = await prisma.standard.upsert({
    where: { id: "test-comments-standard" }, update: {},
    create: { id: "test-comments-standard", classId: cls.id, code: "T.1", title: "[test fixture] Standard" },
  });
  await prisma.masteryEvent.deleteMany({ where: { standardId: standard.id } });
  await prisma.dailyCheck.deleteMany({ where: { classId: cls.id } });

  const FROM = "2026-06-01";
  const TO = "2026-06-30";
  // In-range evidence.
  await prisma.masteryEvent.create({ data: { studentId: student.id, standardId: standard.id, level: 3, recordedById: teacher.id, recordedAt: new Date("2026-06-15T12:00:00") } });
  // Out-of-range evidence — must NOT affect the term summary.
  await prisma.masteryEvent.create({ data: { studentId: student.id, standardId: standard.id, level: 1, recordedById: teacher.id, recordedAt: new Date("2026-01-01T12:00:00") } });
  await prisma.dailyCheck.create({ data: { studentId: student.id, classId: cls.id, date: "2026-06-10", engagement: "ENGAGED", note: "Great focus today.", loggedById: teacher.id } });
  await prisma.dailyCheck.create({ data: { studentId: student.id, classId: cls.id, date: "2026-07-15", engagement: "DISTRACTING", loggedById: teacher.id } }); // out of range

  // Re-derive buildStudentTermSummary's query shape inline against the real rows just written.
  const dailyChecks = await prisma.dailyCheck.findMany({ where: { studentId: student.id, classId: cls.id, date: { gte: FROM, lte: TO } } });
  const events = await prisma.masteryEvent.findMany({
    where: { studentId: student.id, standardId: standard.id, recordedAt: { gte: new Date(`${FROM}T00:00:00`), lte: new Date(`${TO}T23:59:59.999`) } },
    select: { level: true, recordedAt: true, evidenceType: true },
  });
  const masteryResult = computeMastery(events);

  check("only the in-range DailyCheck is counted (1, not 2)", dailyChecks.length === 1);
  check("only the in-range MasteryEvent is counted (1, not 2)", events.length === 1);
  check("range-scoped mastery level is Proficient (3), unaffected by the out-of-range level-1 event", masteryResult.level === 3);

  const summary: StudentTermSummary = {
    studentName: student.displayName,
    className: cls.name,
    dateRange: `${FROM} to ${TO}`,
    dimensionTallies: {
      ...emptySummary.dimensionTallies,
      engagement: { positiveLabel: "Engaged", negativeLabel: "Distracting", positive: dailyChecks.filter((c) => c.engagement === "ENGAGED").length, negative: dailyChecks.filter((c) => c.engagement === "DISTRACTING").length },
    },
    dailyNotes: dailyChecks.filter((c) => c.note).map((c) => ({ date: c.date, text: c.note as string })),
    standards: [{ code: standard.code, title: standard.title, levelLabel: "Proficient", sampleSize: masteryResult.sampleSize }],
    totalDailyChecks: dailyChecks.length,
  };
  const realPrompt = buildCommentsPrompt(DEFAULT_COMMENTS_PROMPT, summary);
  check("the real-DB-derived prompt contains the fixture student's name", realPrompt.includes(student.displayName));
  check("the real-DB-derived prompt contains the in-range note, not the out-of-range one", realPrompt.includes("Great focus today.") && !realPrompt.includes("2026-07-15"));
  check("the real-DB-derived prompt reflects range-scoped mastery (Proficient), not the out-of-range level-1 event", realPrompt.includes("Proficient (1 piece of evidence)"));

  // Cleanup — leave no fixture data behind.
  await prisma.dailyCheck.deleteMany({ where: { classId: cls.id } });
  await prisma.masteryEvent.deleteMany({ where: { standardId: standard.id } });
  await prisma.standard.delete({ where: { id: standard.id } });
  await prisma.enrollment.deleteMany({ where: { classId: cls.id } });
  await prisma.student.delete({ where: { id: student.id } });
  await prisma.class.delete({ where: { id: cls.id } });

  console.log(`\n${failures === 0 ? "✅ All comments/AI-settings checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
