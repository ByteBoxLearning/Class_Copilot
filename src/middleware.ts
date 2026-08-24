import { NextRequest, NextResponse } from "next/server";

// Lightweight edge guard: bounce anyone without a session cookie away from the
// app to /login. Full verification + role checks happen in the server layouts
// (which can use Prisma / the full jose verify).
const PROTECTED = ["/admin", "/assistant", "/portal", "/classes"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isProtected) return NextResponse.next();

  const hasSession = req.cookies.has("crm_session");
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/assistant/:path*",
    "/portal/:path*",
    "/classes/:path*",
  ],
};
