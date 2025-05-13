// src/middleware.ts
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
// Role import might not be strictly needed anymore if Owner doesn't get special access here
// import { Role } from "@prisma/client";

export async function middleware(req: NextRequest) {
  const secret = process.env.NEXTAUTH_SECRET;
  const { pathname } = req.nextUrl;
  console.log(`--- Middleware Start: Path = ${pathname} ---`);

  // --- Config ---
  const loginPath = "/login";
  const apiAuthPrefix = "/api/auth";
  const unauthorizedPath = "/unauthorized"; // Keep for potential generic errors
  const publicPaths = [loginPath, unauthorizedPath, "/favicon.ico"];

  // --- Exclusions ---
  if (pathname.startsWith(apiAuthPrefix)) {
    console.log(`Middleware: Allowing API auth path: ${pathname}`);
    return NextResponse.next();
  }
  if (
    pathname.startsWith("/_next") ||
    /\.(png|jpg|jpeg|gif|svg|ico|css|js|map|webmanifest)$/.test(pathname)
  ) {
    console.log(`Middleware: Allowing static/internal path: ${pathname}`);
    return NextResponse.next();
  }
  if (publicPaths.some((path) => pathname === path)) {
    console.log(`Middleware: Allowing public path: ${pathname}`);
    return NextResponse.next();
  }

  // --- Auth Check ---
  console.log(`Middleware: Path "${pathname}" requires authentication check.`);
  if (!secret) {
    console.error("Middleware Error: Missing NEXTAUTH_SECRET.");
    return new NextResponse("Internal Server Error", { status: 500 });
  }

  const token = await getToken({ req, secret });
  console.log(
    `Middleware: Token for "${pathname}": ${token ? `User ID ${token.id}` : "null"}`, // Simplified log, role not needed for this check
  );

  // --- Unauthenticated ---
  if (!token) {
    // Allow access to the root landing page without a token
    if (pathname === "/") {
      console.log(
        "Middleware: Allowing root path '/' for unauthenticated user.",
      );
      return NextResponse.next();
    }
    // Redirect all other paths to login if no token
    console.log(
      `Middleware: No token for protected path "${pathname}". Redirecting to login.`,
    );
    const loginUrl = new URL(loginPath, req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // --- Authenticated ---
  console.log(
    `Middleware: User ${token.id} is authenticated. Path: "${pathname}".`,
  );

  // Handle Root Path for Authenticated Users (Redirect to their own page)
  if (pathname === "/") {
    console.log(
      `Middleware: Authenticated user ${token.id} at root. Redirecting to /${token.id}.`,
    );
    const userAccountUrl = new URL(`/${token.id}`, req.nextUrl.origin);
    return NextResponse.redirect(userAccountUrl);
  }

  // --- Authorization for Dynamic /accountID Routes ---
  // Regex to match /<id> or /<id>/ or /<id>/subpath or /<id>?query etc.
  const accountIdMatch = pathname.match(/^\/([a-zA-Z0-9-]+)(?:[\/?#]|$)/);

  if (accountIdMatch) {
    const accountIdFromPath = accountIdMatch[1];
    const loggedInUserId = token.id as string;

    console.log(`Middleware: Authorization Check for /${accountIdFromPath}`);
    console.log(`  -> Logged in User ID: ${loggedInUserId}`);

    // *** MODIFIED AUTHORIZATION LOGIC ***
    // Access is ONLY allowed if the logged-in user's ID matches the ID in the path.
    const isOwnPage = loggedInUserId === accountIdFromPath;
    console.log(`  -> Is Own Page? ${isOwnPage}`);

    if (!isOwnPage) {
      // If it's not the user's own page, redirect them to their own page.
      console.warn(
        `Middleware: AUTHORIZATION FAILED for user ${loggedInUserId} accessing /${accountIdFromPath}. Redirecting to own page /${loggedInUserId}.`,
      );
      const userAccountUrl = new URL(`/${loggedInUserId}`, req.nextUrl.origin);
      return NextResponse.redirect(userAccountUrl);
      // Alternatively, redirect to a generic unauthorized page:
      // const deniedUrl = new URL(unauthorizedPath, req.nextUrl.origin);
      // return NextResponse.redirect(deniedUrl);
    }
    // *** END MODIFIED LOGIC ***

    // If isOwnPage is true, allow access.
    console.log(
      `Middleware: Authorization OK (Own Page) for user ${loggedInUserId} accessing /${accountIdFromPath}.`,
    );
    return NextResponse.next();
  } else {
    console.warn(
      `Middleware: Authenticated user ${token.id} at unexpected path "${pathname}". Redirecting to own dashboard.`,
    );
    const userAccountUrl = new URL(`/${token.id}`, req.nextUrl.origin);
    return NextResponse.redirect(userAccountUrl);
  }
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
