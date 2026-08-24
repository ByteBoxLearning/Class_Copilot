import type { ImportSheet } from "./types";

// Hand-rolled RFC-4180 CSV/TSV parser — not a library. This app already
// hand-rolls its JWT auth (jose, not NextAuth) and its encryption (Node
// crypto, not a secrets SDK); a ~30-row class roster doesn't need a
// streaming/worker-thread CSV library's actual value-add. Escape hatch: if a
// real SIS export breaks this, swap in `papaparse` behind this exact
// `parseCsv(text): ImportSheet` signature — a one-file change.
//
// Handles: quoted fields, "" escapes, embedded commas/newlines inside quotes,
// CRLF and LF, a leading UTF-8 BOM, and delimiter sniffing across , / ; / tab
// (so pasting straight out of Excel or Google Sheets, which use tabs, works
// for free via the same parser).

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function sniffDelimiter(firstLine: string): string {
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length - 1]);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function tokenizeRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ""; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }

    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === delimiter) { pushField(); i += 1; continue; }
    if (ch === "\r") { i += 1; continue; } // normalize CRLF -> LF below
    if (ch === "\n") { pushRow(); i += 1; continue; }
    field += ch; i += 1;
  }
  // Final field/row (files don't always end with a trailing newline).
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

export function parseCsv(text: string, sourceLabel = "Pasted text"): ImportSheet {
  const cleaned = stripBom(text).trim();
  if (!cleaned) return { headers: [], rows: [], sourceLabel };

  // Excel sometimes prepends a "sep=," preamble line — skip it if present.
  const firstNewline = cleaned.indexOf("\n");
  const firstLine = (firstNewline === -1 ? cleaned : cleaned.slice(0, firstNewline)).trim();
  const body = /^sep=.$/i.test(firstLine) ? cleaned.slice(firstNewline + 1) : cleaned;

  const delimiter = sniffDelimiter(body.split("\n")[0] ?? "");
  const all = tokenizeRows(body, delimiter);
  if (all.length === 0) return { headers: [], rows: [], sourceLabel };

  const [headers, ...rows] = all;
  return { headers: headers.map((h) => h.trim()), rows, sourceLabel };
}
