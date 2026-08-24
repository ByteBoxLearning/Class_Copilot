// Scripted test for the Assignment Builder. Run:
// node --env-file=.env --import tsx scripts/assignments-test.mts
//
// assignments/types.ts, assignments/prompt.ts, and ai/json.ts have no
// server-only/Prisma imports, so they're imported directly. Everything with
// "server-only" (generate.ts, extract-upload.ts, storage.ts, actions/*) is
// re-implemented inline against a self-contained fixture, matching the
// precedent set by mastery-test.mts / grading-test.mts / comments-test.mts.
import { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import path from "path";
import { parseAssignmentDoc, emptyAssignmentDoc, type AssignmentDoc } from "../src/lib/assignments/types";
import { buildAssignmentPrompt, type AssignmentPromptContext } from "../src/lib/assignments/prompt";
import { DEFAULT_ASSIGNMENT_GENERATE_PROMPT, DEFAULT_ASSIGNMENT_IMPROVE_PROMPT, ASSIGNMENT_PROMPT_PLACEHOLDERS } from "../src/lib/assignments/prompt-defaults";
import { extractJson } from "../src/lib/ai/json";

const prisma = new PrismaClient();

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? "  ✓" : "  ✗ FAIL"} ${name}`);
  if (!cond) failures++;
}

async function main() {
  console.log("extractJson (ai/json.ts):");
  check("plain JSON passes through unchanged", extractJson('{"a":1}') === '{"a":1}');
  check("strips ```json fences", extractJson('```json\n{"a":1}\n```').trim() === '{"a":1}');
  check("strips prose around a JSON object", extractJson('Sure, here you go:\n{"a":1}\nHope that helps!').includes('{"a":1}'));

  console.log("\nparseAssignmentDoc (lenient — types.ts):");
  check("garbage input -> empty doc, never throws", JSON.stringify(parseAssignmentDoc("not json at all")) === JSON.stringify(emptyAssignmentDoc()));
  check("empty object -> empty doc", parseAssignmentDoc("{}").sections.length === 0);

  const wellFormed: AssignmentDoc = {
    title: "Fractions Practice",
    summary: "Adding fractions with unlike denominators.",
    gradeLevel: "Grade 6",
    estimatedMinutes: 20,
    standardCodes: ["6.NS.A.1"],
    sections: [
      { kind: "instructions", heading: "Instructions", text: "Solve each problem." },
      { kind: "questions", heading: "Problems", items: ["1/2 + 1/3", "2/5 + 1/4"] },
      { kind: "rubric", heading: "Rubric", criteria: [{ name: "Accuracy", levels: ["Beginning desc", "Developing desc", "Proficient desc", "Advanced desc"] }] },
      { kind: "answer_key", heading: "Answers", text: "5/6, 13/20" },
    ],
  };
  const roundTripped = parseAssignmentDoc(JSON.stringify(wellFormed));
  check("a well-formed doc round-trips exactly", JSON.stringify(roundTripped) === JSON.stringify(wellFormed));

  const messy = {
    title: "Messy Doc",
    summary: 42, // wrong type — should be dropped, not crash
    sections: [
      { kind: "instructions", heading: "Fine", text: "This one is valid." },
      { kind: "unknown_kind", heading: "Bad", text: "Should be dropped." },
      { kind: "questions", heading: "No items field", text: "not items" }, // items missing -> defaults to []
      "not even an object",
      { kind: "rubric", heading: "Short rubric", criteria: [{ name: "X", levels: ["only one level"] }] }, // lenient: not rejected for wrong length
    ],
  };
  const parsedMessy = parseAssignmentDoc(JSON.stringify(messy));
  check("wrong-typed summary doesn't crash the parse, falls back to empty string", parsedMessy.summary === "");
  check("an unknown section kind is dropped, not kept or crashed on", parsedMessy.sections.length === 3);
  check("a non-object entry in sections[] is dropped", parsedMessy.sections.every((s) => typeof s === "object"));
  check("a questions section with a missing items field defaults to an empty array, not a crash", parsedMessy.sections.some((s) => s.kind === "questions" && "items" in s && s.items.length === 0));
  check("a rubric row with the wrong level count is kept, not rejected (lenient — UI pads it)", parsedMessy.sections.some((s) => s.kind === "rubric"));

  console.log("\nbuildAssignmentPrompt (pure — prompt.ts):");
  const ctx: AssignmentPromptContext = {
    assignmentType: "Worksheet",
    standards: [{ code: "6.NS.A.1", title: "Adds and subtracts fractions", description: "with unlike denominators" }],
    className: "Math — Period 3",
    subject: "Math",
    teacherNotes: "Keep it to 5 questions.",
  };
  const generatePrompt = buildAssignmentPrompt(DEFAULT_ASSIGNMENT_GENERATE_PROMPT, ctx);
  check("no placeholders survive substitution in the GENERATE prompt", !/\{\{[A-Z_]+\}\}/.test(generatePrompt));
  check("standard code + title appear", generatePrompt.includes("[6.NS.A.1] Adds and subtracts fractions"));
  check("teacher notes appear", generatePrompt.includes("Keep it to 5 questions."));
  check("class name appears", generatePrompt.includes("Math — Period 3"));

  const improveCtx: AssignmentPromptContext = { ...ctx, sourceMaterial: "1) 1/2+1/3=? 2) 2/5+1/4=?" };
  const improvePrompt = buildAssignmentPrompt(DEFAULT_ASSIGNMENT_IMPROVE_PROMPT, improveCtx);
  check("no placeholders survive substitution in the IMPROVE prompt", !/\{\{[A-Z_]+\}\}/.test(improvePrompt));
  check("source material appears", improvePrompt.includes("1) 1/2+1/3=? 2) 2/5+1/4=?"));

  const noNotes = buildAssignmentPrompt(DEFAULT_ASSIGNMENT_GENERATE_PROMPT, { ...ctx, teacherNotes: undefined });
  check("empty teacher notes render as a placeholder sentence, not a blank", noNotes.includes("(none)"));

  console.log("\nDefault prompts keep the placeholders they claim to (prompt-defaults.ts):");
  check("GENERATE prompt contains ASSIGNMENT_TYPE placeholder", DEFAULT_ASSIGNMENT_GENERATE_PROMPT.includes(ASSIGNMENT_PROMPT_PLACEHOLDERS.assignmentType));
  check("GENERATE prompt contains the JSON 'sections' contract", DEFAULT_ASSIGNMENT_GENERATE_PROMPT.includes('"sections"'));
  check("IMPROVE prompt contains SOURCE_MATERIAL placeholder", DEFAULT_ASSIGNMENT_IMPROVE_PROMPT.includes(ASSIGNMENT_PROMPT_PLACEHOLDERS.sourceMaterial));

  console.log("\nLocal-disk storage round trip (storage.ts's algorithm, reimplemented inline):");
  const LOCAL_ROOT = path.join(process.cwd(), "uploads");
  const testObjectPath = "test-fixture/assignments-test/sample.txt";
  const testFull = path.join(LOCAL_ROOT, testObjectPath);
  await fs.mkdir(path.dirname(testFull), { recursive: true });
  await fs.writeFile(testFull, Buffer.from("hello assignment material"));
  await fs.writeFile(`${testFull}.type`, "text/plain", "utf8");
  const readBack = await fs.readFile(testFull);
  check("a written object reads back with identical bytes", readBack.toString() === "hello assignment material");
  await fs.unlink(testFull);
  await fs.unlink(`${testFull}.type`);
  const stillThere = await fs.access(testFull).then(() => true).catch(() => false);
  check("removing an object actually deletes it from disk", !stillThere);
  await fs.rm(path.join(LOCAL_ROOT, "test-fixture"), { recursive: true, force: true });

  console.log("\nReal-DB fixture — Assignment + AssignmentStandard + AssignmentMaterial:");
  const teacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@classroom.test" } });
  const cls = await prisma.class.upsert({
    where: { id: "test-assignments-class" }, update: {},
    create: { id: "test-assignments-class", name: "[test fixture] Assignments", teacherId: teacher.id },
  });
  const standard = await prisma.standard.upsert({
    where: { id: "test-assignments-standard" }, update: {},
    create: { id: "test-assignments-standard", classId: cls.id, code: "T.1", title: "[test fixture] Standard" },
  });
  await prisma.assignment.deleteMany({ where: { classId: cls.id } });

  const assignment = await prisma.assignment.create({
    data: {
      classId: cls.id,
      title: "[test fixture] Worksheet",
      assignmentType: "WORKSHEET",
      summary: "A test worksheet.",
      contentJson: JSON.stringify(wellFormed),
      status: "DRAFT",
      source: "MANUAL",
      createdById: teacher.id,
      standards: { create: [{ standardId: standard.id }] },
    },
  });
  const material = await prisma.assignmentMaterial.create({
    data: {
      assignmentId: assignment.id,
      classId: cls.id,
      kind: "ORIGINAL",
      fileName: "original.txt",
      filePath: `${cls.id}/${assignment.id}/fake-path.txt`,
      mimeType: "text/plain",
      sizeBytes: 100,
      extractedText: "extracted text here",
      uploadedById: teacher.id,
    },
  });

  const fetched = await prisma.assignment.findUnique({
    where: { id: assignment.id },
    include: { standards: true, materials: true },
  });
  check("assignment round-trips with its standard join row", fetched?.standards.length === 1 && fetched.standards[0].standardId === standard.id);
  check("assignment round-trips with its material", fetched?.materials.length === 1 && fetched.materials[0].id === material.id);
  check("contentJson parses back into the same doc via parseAssignmentDoc", JSON.stringify(parseAssignmentDoc(fetched!.contentJson)) === JSON.stringify(wellFormed));

  // Cascade delete: deleting the Assignment should remove its
  // AssignmentStandard/AssignmentMaterial rows without deleting the Standard
  // or Class themselves.
  await prisma.assignment.delete({ where: { id: assignment.id } });
  const standardStillExists = await prisma.standard.findUnique({ where: { id: standard.id } });
  const orphanJoinRows = await prisma.assignmentStandard.findMany({ where: { standardId: standard.id } });
  const orphanMaterials = await prisma.assignmentMaterial.findMany({ where: { assignmentId: assignment.id } });
  check("deleting an Assignment cascades away its AssignmentStandard rows", orphanJoinRows.length === 0);
  check("deleting an Assignment cascades away its AssignmentMaterial rows", orphanMaterials.length === 0);
  check("deleting an Assignment does NOT delete the Standard it referenced", !!standardStillExists);

  // Cleanup.
  await prisma.standard.delete({ where: { id: standard.id } });
  await prisma.class.delete({ where: { id: cls.id } });

  console.log(`\n${failures === 0 ? "✅ All assignment checks passed." : `❌ ${failures} check(s) FAILED.`}`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
