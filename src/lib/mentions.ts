// Lightweight @-mention helpers. Pure/client-safe (no server-only, no prisma) so
// both the mention textarea (client) and the server actions can share them.
//
// A mention is written as `@Handle` where Handle has no spaces. The handle is a
// person's first name, or — if two people share a first name — their full name
// with spaces removed. Parsing matches either form (plus a manually-typed first
// name), so it "just works" for a small team.

export type MentionPerson = { id: string; name: string };

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

function concatName(name: string): string {
  return name.replace(/\s+/g, "");
}

// The handle the picker inserts for a person. First name when unique among the
// given people, otherwise the whole name with spaces removed.
export function mentionHandle(name: string, people: { name: string }[]): string {
  const fn = firstName(name);
  const clash = people.filter((p) => firstName(p.name).toLowerCase() === fn.toLowerCase()).length > 1;
  return clash ? concatName(name) : fn;
}

// Extract the ids of everyone mentioned in a block of text.
export function parseMentionedIds(text: string | null | undefined, people: MentionPerson[]): Set<string> {
  const ids = new Set<string>();
  if (!text) return ids;
  const tokens = [...text.matchAll(/@([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1].toLowerCase());
  if (tokens.length === 0) return ids;
  for (const p of people) {
    const fn = firstName(p.name).toLowerCase();
    const cn = concatName(p.name).toLowerCase();
    if (tokens.some((t) => t === fn || t === cn)) ids.add(p.id);
  }
  return ids;
}

// Ids mentioned in the new text that weren't already mentioned in the old text —
// so editing a note doesn't re-notify people who were already tagged.
export function newlyMentionedIds(
  oldText: string | null | undefined,
  newText: string | null | undefined,
  people: MentionPerson[],
): Set<string> {
  const before = parseMentionedIds(oldText, people);
  const after = parseMentionedIds(newText, people);
  for (const id of before) after.delete(id);
  return after;
}
