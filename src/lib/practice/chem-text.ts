import { createElement, Fragment, type ReactNode } from "react";

// Renders the plain-ASCII chemistry shorthand used throughout the question
// banks and AI-generated content (see notation.ts's NOTATION_RULES, which is
// what keeps AI output consistent with this) as real sub/superscripts —
// "H2O" -> H₂O, "Fe^3+" -> Fe³⁺, "7.20 x 10^-3" -> 7.20 × 10⁻³ — instead of
// literal caret/digit text. No LaTeX/markdown dependency: this targets the
// one convention already in use everywhere, so it improves every existing
// bank file retroactively with no content rewrite.
//
// Uses React.createElement directly rather than JSX so this file has no
// dependency on any particular JSX runtime configuration — it needs to run
// identically inside the Next.js app AND under a plain `tsx` test script
// (see scripts/practice-test.mts), which don't share the same JSX transform.
//
// Rules, applied in order:
// 1. Plain substitutions: "->"/"-->" -> "→", "<->"/"<-->" -> "⇌", a bare x/X
//    right before "10^" -> "×" (scientific notation).
// 2. Electron configuration ("2p6", "3d10", "1s2" — confirmed present in real
//    content) is special-cased AHEAD of the generic rules below: the leading
//    digit and orbital letter stay plain text, the TRAILING digit (electron
//    count) is a superscript — the opposite of rule 4. Safe to special-case
//    because orbital letters are always lowercase s/p/d/f immediately
//    preceded by a digit, which never happens in a real (capitalized)
//    element symbol.
// 3. Superscript: "^" followed by digits/sign/letters — charges ("Fe^3+"),
//    exponents ("10^-3"), isotope mass numbers ("^235"), or a variable
//    exponent from a rate law ("k^n") — all confirmed present in real content.
// 4. Subscript: a digit run immediately preceded (no space) by a letter or
//    ")" — correctly renders "H2O", "Ca(OH)2", "Al2(SO4)3", and gas-law
//    variable pairs like "V1"/"P2", while correctly leaving a leading
//    stoichiometric coefficient ("2H2O") and a plain number ("10^-3") alone,
//    since neither is immediately preceded by a letter/")".

const TEXT_SUBSTITUTIONS: [RegExp, string][] = [
  [/-->/g, "→"],
  [/<-->/g, "⇌"],
  [/<->/g, "⇌"],
  [/->/g, "→"],
  [/(?<=[\d\s]|^)[xX](?=\s*10\^)/g, "×"],
];

// The superscript alternative is EITHER digits/sign (a charge like "3+" or an
// isotope mass number like "235" — critically, NOT swallowing an element
// symbol that immediately follows, e.g. "^235U") OR a single bare letter (a
// variable exponent like "^n"/"^m") — never a mix of the two, so "^235U"
// superscripts only "235" and leaves "U" as normal text.
const TOKEN_RE =
  /(?<econf>\d+)(?<orb>[spdf])(?<econfnum>\d+)\b|\^(?<sup>[\d+-]+|[A-Za-z])|(?<=[A-Za-z)])(?<sub>\d+)/g;

function applyTextSubstitutions(text: string): string {
  let result = text;
  for (const [pattern, replacement] of TEXT_SUBSTITUTIONS) result = result.replace(pattern, replacement);
  return result;
}

export function renderChemText(text: string): ReactNode[] {
  const substituted = applyTextSubstitutions(text);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of substituted.matchAll(TOKEN_RE)) {
    const groups = match.groups;
    const start = match.index ?? 0;
    if (!groups) continue;
    if (start > lastIndex) nodes.push(substituted.slice(lastIndex, start));

    if (groups.econf !== undefined) {
      nodes.push(groups.econf + groups.orb, createElement("sup", { key: key++ }, groups.econfnum));
    } else if (groups.sup !== undefined) {
      nodes.push(createElement("sup", { key: key++ }, groups.sup));
    } else if (groups.sub !== undefined) {
      nodes.push(createElement("sub", { key: key++ }, groups.sub));
    }
    lastIndex = start + match[0].length;
  }
  if (lastIndex < substituted.length) nodes.push(substituted.slice(lastIndex));
  return nodes;
}

// Convenience wrapper for JSX call sites — replaces raw `{text}` interpolation
// anywhere a bank/generated question, explanation, hint, or AI feedback
// string is displayed.
export function ChemText({ text }: { text: string }) {
  return createElement(Fragment, null, ...renderChemText(text));
}
