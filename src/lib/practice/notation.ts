// The one chemistry-notation convention every AI prompt in Practice Mode
// must ask for, so all AI-generated text (bank-shortfall questions, coaching
// feedback, tutor chat) stays consistent with what src/lib/practice/
// chem-text.tsx actually renders as real sub/superscripts. Previously only
// generate.ts's bank-shortfall prompts got this — coaching.ts and chat.ts had
// no notation guidance at all, so their output could drift into stray LaTeX
// or unicode that chem-text.tsx doesn't parse.
export const NOTATION_RULES =
  `Notation convention (used everywhere): write chemical formulas with subscripts as plain digits directly after the element/parenthesis (e.g. "H2O", "Ca(OH)2"). Write charges/exponents with a caret: "Fe^3+", "SO4^2-". Write reaction arrows as "->" or "<->". Physical states in parentheses: "(s)", "(l)", "(g)", "(aq)". Do not use LaTeX or unicode subscripts.`;
