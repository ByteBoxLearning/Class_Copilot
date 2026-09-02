import { randomBytes, randomInt } from "crypto";

// Generates a readable, reasonably strong temporary password. Avoids ambiguous
// characters (0/O, 1/l/I) so it can be copied/typed without confusion.
const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGIT = "23456789";
const ALL = UPPER + LOWER + DIGIT;

export function generateTempPassword(length = 12): string {
  // Guarantee at least one of each class, then fill the rest randomly.
  const chars = [
    UPPER[randomInt(UPPER.length)],
    LOWER[randomInt(LOWER.length)],
    DIGIT[randomInt(DIGIT.length)],
  ];
  for (let i = chars.length; i < length; i++) chars.push(ALL[randomInt(ALL.length)]);
  // Fisher–Yates shuffle so the guaranteed chars aren't always at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

// Unguessable token embedded in a self-service student invite link
// (/invite/[token]). URL-safe, 256 bits of entropy.
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

// Shared by actions/students.ts (single invite) and actions/classes.ts (bulk
// invite) — how long a generated invite link stays valid.
export const INVITE_TTL_DAYS = 7;

// Placeholder passwordHash input for accounts that only ever sign in via
// Google (User.passwordHash is NOT NULL, but there's no real password to
// hash) — never shown or usable to log in with, just filler for the column.
export function generateOpaqueSecret(): string {
  return randomBytes(24).toString("hex");
}
