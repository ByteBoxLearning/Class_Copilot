// Engines usually return raw JSON when asked (opts.json: true in
// LlmCallOptions), but strip code fences / stray prose just in case — some
// models wrap JSON in ```json fences or add a sentence before/after despite
// being told not to. Domain-neutral (adapted from the source CRM's
// src/lib/cv/prompt.ts::extractJson), used by any feature whose prompt asks
// for a JSON response (the Assignment Builder; the CV builder's source did
// the same for CvDoc).
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1];
  const braces = text.match(/\{[\s\S]*\}/);
  return braces ? braces[0] : text;
}
