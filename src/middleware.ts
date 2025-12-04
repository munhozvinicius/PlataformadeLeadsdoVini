import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";

const PUBLIC_PATHS = ["/login", "/api/auth", "/favicon.ico", "/_next", "/api/health"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublic(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  const needsSecurityReset = Boolean(token.isBlocked);
  const isResetPage = pathname === "/reset-password";
  const isResetApi = pathname.startsWith("/api/users/reset-password");

  if (needsSecurityReset && !isResetPage && !isResetApi) {
    const url = new URL("/reset-password", req.url);
    return NextResponse.redirect(url);
  }

  if (!needsSecurityReset && isResetPage) {
    const url = new URL("/", req.url);
    return NextResponse.redirect(url);
  }

  const role = token.role as Role;
  const isAdminArea = pathname.startsWith("/admin");
  const isBoard = pathname.startsWith("/board");

  if (isAdminArea && role === Role.CONSULTOR) {
    const url = new URL("/board", req.url);
    return NextResponse.redirect(url);
  }

  if (
    isBoard &&
    role !== Role.CONSULTOR &&
    role !== Role.PROPRIETARIO &&
    role !== Role.MASTER
  ) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
