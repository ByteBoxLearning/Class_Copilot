import "server-only";
import { getApiKey, getCanvasBaseUrl } from "@/lib/settings";

// Thin wrapper around Canvas's REST API (token auth, not LTI — see
// src/lib/canvas/outcomes.ts / outcome-results.ts for what this powers, and
// CONTEXT.md for why LTI Advantage was ruled out for this phase). Both the
// base URL and token are admin-set from /admin/settings (src/lib/settings.ts).

export class CanvasConfigError extends Error {}
export class CanvasApiError extends Error {}

async function requireCanvasConfig(): Promise<{ baseUrl: string; token: string }> {
  const [baseUrl, token] = await Promise.all([getCanvasBaseUrl(), getApiKey("CANVAS_API_TOKEN")]);
  if (!baseUrl || !token) {
    throw new CanvasConfigError("Canvas isn't configured yet — set the base URL and API token in Admin → Settings.");
  }
  return { baseUrl, token };
}

function buildQuery(params?: Record<string, string | number | boolean | string[] | number[] | undefined>): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) search.append(`${key}[]`, String(v));
    } else {
      search.append(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// Parses the standard Link-header pagination Canvas uses on every list
// endpoint (RFC 5988 style: `<url>; rel="next", <url>; rel="last"`).
function nextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

async function canvasRequest(path: string, params?: Record<string, string | number | boolean | string[] | number[] | undefined>): Promise<Response> {
  const { baseUrl, token } = await requireCanvasConfig();
  const url = path.startsWith("http") ? path : `${baseUrl}${path}${buildQuery(params)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new CanvasApiError(`Canvas API ${res.status} on ${path}: ${body.slice(0, 300)}`);
  }
  return res;
}

// GET a single page — for endpoints that return one object, or when the
// caller wants to handle pagination itself.
export async function canvasGet<T>(path: string, params?: Record<string, string | number | boolean | string[] | number[] | undefined>): Promise<T> {
  const res = await canvasRequest(path, params);
  return res.json() as Promise<T>;
}

// GET every page of a list endpoint, following the Link header until
// exhausted. Canvas caps page size (default ~10, up to 100 with
// per_page=100), so anything list-shaped should go through this rather than
// canvasGet to avoid silently truncating at 10 results.
//
// Most list endpoints (outcome groups, outcomes, subgroups) return a bare
// array per page — the default `unwrap` (identity) handles those. A few
// (outcome_results) wrap each page's array under a named key instead, e.g.
// `{ outcome_results: [...] }`; pass `unwrap` to pull the array out in that
// case.
export async function canvasGetAllPages<T>(
  path: string,
  params?: Record<string, string | number | boolean | string[] | number[] | undefined>,
  unwrap: (page: unknown) => T[] = (page) => page as T[],
): Promise<T[]> {
  const results: T[] = [];
  let res = await canvasRequest(path, { ...params, per_page: 100 });
  for (;;) {
    const page = await res.json();
    results.push(...unwrap(page));
    const next = nextPageUrl(res.headers.get("Link"));
    if (!next) break;
    res = await canvasRequest(next);
  }
  return results;
}
