import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const cookie = request.cookies.get("cms_session")?.value;
  const hasValidFormat = cookie && cookie.includes(".");
  if (request.nextUrl.pathname.startsWith("/dashboard") && !hasValidFormat) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
