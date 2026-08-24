// Structured, editable assignment model — a header plus an ordered list of
// typed sections, each rendered/edited according to its `kind`. Mirrors the
// source CRM's CvDoc shape (src/lib/cv/types.ts) deliberately: same
// header-plus-typed-sections pattern, same lenient parsing posture. No
// Prisma, no "server-only" — used by the server (generate.ts, actions) AND
// the client-side section editor.

export type RubricCriterion = {
  name: string;
  // Exactly 4 descriptors, positionally matching the mastery scale
  // (Beginning/Developing/Proficient/Advanced — see enums.ts::MASTERY_LEVELS)
  // so a generated rubric is directly reusable as evidence language when
  // recording a MasteryEvent. The parser doesn't hard-reject a row with a
  // different length (lenient, per the "who authored it" principle) — the
  // editor UI always renders exactly 4 columns and pads/truncates.
  levels: string[];
};

export type AssignmentSection =
  | { kind: "instructions"; heading: string; text: string }
  | { kind: "questions"; heading: string; items: string[] }
  | { kind: "activity"; heading: string; text: string }
  | { kind: "materials"; heading: string; items: string[] }
  | { kind: "rubric"; heading: string; criteria: RubricCriterion[] }
  | { kind: "answer_key"; heading: string; text: string }
  | { kind: "notes"; heading: string; text: string };

export type AssignmentSectionKind = AssignmentSection["kind"];

export type AssignmentDoc = {
  title: string;
  summary: string;
  gradeLevel?: string;
  estimatedMinutes?: number;
  standardCodes: string[];
  sections: AssignmentSection[];
};

export function emptyAssignmentDoc(): AssignmentDoc {
  return { title: "", summary: "", standardCodes: [], sections: [] };
}

const TEXT_KINDS = new Set(["instructions", "activity", "answer_key", "notes"]);
const ITEMS_KINDS = new Set(["questions", "materials"]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Best-effort validation of ONE section — drops it (returns null) rather
// than failing the whole document if it's malformed. Lenient by design: this
// parses AI output, not a teacher-authored formula (contrast with
// GradingPolicy.configJson's strict zod validation — see CONTEXT.md).
function parseSection(raw: unknown): AssignmentSection | null {
  if (!isPlainObject(raw)) return null;
  const kind = raw.kind;
  const heading = typeof raw.heading === "string" ? raw.heading : "";

  if (typeof kind === "string" && TEXT_KINDS.has(kind)) {
    const text = typeof raw.text === "string" ? raw.text : "";
    return { kind, heading, text } as AssignmentSection;
  }
  if (typeof kind === "string" && ITEMS_KINDS.has(kind)) {
    const items = Array.isArray(raw.items) ? raw.items.filter((i): i is string => typeof i === "string") : [];
    return { kind, heading, items } as AssignmentSection;
  }
  if (kind === "rubric") {
    const criteria = Array.isArray(raw.criteria)
      ? raw.criteria
          .filter(isPlainObject)
          .map((c): RubricCriterion => ({
            name: typeof c.name === "string" ? c.name : "",
            levels: Array.isArray(c.levels) ? c.levels.filter((l): l is string => typeof l === "string") : [],
          }))
      : [];
    return { kind: "rubric", heading, criteria };
  }
  return null;
}

// Best-effort parse of a stored/generated contentJson string into an
// AssignmentDoc. Never throws — falls back to an empty doc on anything
// unparseable, same posture as the source CRM's parseCvDoc.
export function parseAssignmentDoc(json: string): AssignmentDoc {
  try {
    const d = JSON.parse(json);
    if (!isPlainObject(d)) return emptyAssignmentDoc();
    const sections = Array.isArray(d.sections)
      ? d.sections.map(parseSection).filter((s): s is AssignmentSection => s !== null)
      : [];
    return {
      title: typeof d.title === "string" ? d.title : "",
      summary: typeof d.summary === "string" ? d.summary : "",
      gradeLevel: typeof d.gradeLevel === "string" ? d.gradeLevel : undefined,
      estimatedMinutes: typeof d.estimatedMinutes === "number" ? d.estimatedMinutes : undefined,
      standardCodes: Array.isArray(d.standardCodes) ? d.standardCodes.filter((s: unknown): s is string => typeof s === "string") : [],
      sections,
    };
  } catch {
    return emptyAssignmentDoc();
  }
}
