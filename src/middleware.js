import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

function secret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

const PROTECTED = ["/dashboard", "/settings", "/paper"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get("session")?.value;

  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, secret());
      valid = true;
    } catch {
      valid = false;
    }
  }

  const needsAuth = PROTECTED.some((p) => pathname.startsWith(p));
  if (needsAuth && !valid) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Already signed in? Bounce away from the auth pages.
  if ((pathname === "/login" || pathname === "/register") && valid) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/settings/:path*", "/paper/:path*", "/login", "/register"],
};
