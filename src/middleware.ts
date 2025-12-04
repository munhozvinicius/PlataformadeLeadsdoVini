import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { Role } from "@prisma/client";

const PUBLIC_PATHS = ["/login", "/api/auth", "/favicon.ico", "/_next", "/_next/static", "/_next/image"];

function isPublicPath(pathname: string) {
  return PUBLIC_PATHS.some((publicPath) => pathname.startsWith(publicPath));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  if (!token || !token.role) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const role = token.role as Role;
  if (pathname.startsWith("/admin")) {
    if (role === Role.CONSULTOR) {
      return NextResponse.redirect(new URL("/board", req.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/board") {
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/board"],
};
