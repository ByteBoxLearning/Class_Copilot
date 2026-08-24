import "server-only";
import mammoth from "mammoth";

// Extract plain text from an uploaded assignment material. Supports .docx
// (via mammoth), .txt/.md, and anything else served as text/*. PDFs and
// other formats return null — NOT an error, just no extraction (server-side
// PDF parsing is heavy/fragile and a scanned worksheet would need OCR, a
// separate subsystem). The upload itself still succeeds; the UI tells the
// teacher to paste the text instead if they want it to seed an "Improve"
// generation. Adapted from the source CRM's src/lib/cv/parse-upload.ts.
export async function extractTextFromUpload(file: File): Promise<string | null> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".docx")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { value } = await mammoth.extractRawText({ buffer });
    return normalise(value);
  }
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    return normalise(buffer.toString("utf8"));
  }
  return null;
}

function normalise(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
