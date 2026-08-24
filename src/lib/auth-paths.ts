// Pure, client-safe path helpers (no server-only imports) so both client and
// server code can compute role-based destinations. The existing `/admin` route
// tree is the OWNER area (legacy "ADMIN" == "OWNER"); clients get `/portal`.
export const dashboardPathFor = (role: string) => {
  if (role === "CLIENT") return "/portal/dashboard";
  if (role === "ASSISTANT") return "/assistant/dashboard";
  return "/admin/dashboard"; // OWNER (and legacy ADMIN)
};
