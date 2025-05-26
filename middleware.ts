// middleware.ts
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Define paths that are always accessible, regardless of authentication state.
// If your root ("/") is a public landing page, include it here.
const ALWAYS_ACCESSIBLE_PATHS = [
  "/", // Assuming root page is accessible to everyone (e.g., public landing)
  "/login",
  // Add other specific public paths like "/about", "/pricing", etc.
];

// Helper to check if a path is an API auth route for NextAuth
const isApiAuthRoute = (pathname: string) => pathname.startsWith("/api/auth/");

// Helper to check for static assets, Next.js internals, or common image/file types
const isStaticAssetOrInternal = (pathname: string) =>
  pathname.startsWith("/_next/") || // Next.js internal assets
  pathname.startsWith("/static/") || // Your static assets in /public/static (if any)
  pathname.match(
    /\.(ico|png|jpg|jpeg|gif|svg|css|js|webmanifest|txt|xml|well-known)$/i,
  ); // Common file extensions and .well-known

export async function middleware(request: NextRequest) {
  const { pathname, search, origin } = request.nextUrl;
  console.log(`[MIDDLEWARE] Request to: ${pathname}`);

  // 1. Allow static assets, Next.js internals, and NextAuth API routes to pass through immediately.
  if (isStaticAssetOrInternal(pathname) || isApiAuthRoute(pathname)) {
    // A more specific check for .well-known if it's giving false positives for directories
    if (pathname.startsWith("/.well-known/") && !pathname.includes(".")) {
      // Potentially a directory-like request to .well-known, let it pass to token check if not a file
    } else {
      console.log(
        `[MIDDLEWARE] Allowing asset/internal/api-auth path: ${pathname}`,
      );
      return NextResponse.next();
    }
  }

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET, // Ensure this is set in your .env
  });

  // --- Logic for Authenticated Users (token exists) ---
  if (token) {
    console.log(
      `[MIDDLEWARE] Token found - ID: ${token.id}, Name: ${token.name}, mustChangePassword: ${token.mustChangePassword}`,
    );

    // 2. Enforce `mustChangePassword`
    if (token.mustChangePassword === true) {
      // If user must change password and is NOT on the change-password page
      if (pathname !== "/auth/change-password") {
        console.log(
          `[MIDDLEWARE] mustChangePassword is TRUE. Current path: ${pathname}. Redirecting to /auth/change-password.`,
        );
        const changePasswordUrl = new URL("/auth/change-password", origin);
        return NextResponse.redirect(changePasswordUrl);
      }
      // User must change password AND IS already on the change-password page, allow it
      console.log(
        `[MIDDLEWARE] mustChangePassword is TRUE, already on /auth/change-password. Allowing.`,
      );
      return NextResponse.next();
    }

    // --- User is authenticated, and mustChangePassword is FALSE ---

    // 3. If `mustChangePassword` is false, and user tries to access change-password page, redirect them away.
    if (pathname === "/auth/change-password") {
      console.log(
        `[MIDDLEWARE] mustChangePassword is FALSE, but user is on /auth/change-password. Redirecting to dashboard.`,
      );
      const userDashboardPath = token.id ? `/${token.id}` : "/"; // Default to user's page or root
      return NextResponse.redirect(new URL(userDashboardPath, origin));
    }

    // 4. If authenticated user (MCP=false) tries to access /login, redirect to dashboard
    if (pathname === "/login") {
      console.log(
        `[MIDDLEWARE] Authenticated user (MCP:false) on /login. Redirecting to dashboard.`,
      );
      const userDashboardPath = token.id ? `/${token.id}` : "/";
      return NextResponse.redirect(new URL(userDashboardPath, origin));
    }

    // 5. Authenticated user (MCP=false), not on /auth/change-password or /login. Allow access.
    // If '/' is in ALWAYS_ACCESSIBLE_PATHS, an authenticated user can view '/'.
    // Any further redirection from '/' for authenticated users (like to their dashboard,
    // as seen in your logs "Session found... redirecting...")
    // would be handled by client-side logic on the '/' page itself.
    console.log(
      `[MIDDLEWARE] Authenticated (MCP:false). Allowing access to: ${pathname}`,
    );
    return NextResponse.next();
  }

  // --- Logic for Unauthenticated Users (no token) ---
  console.log(`[MIDDLEWARE] No token for path: ${pathname}`);

  // 6. Allow access to explicitly public/always accessible paths.
  if (ALWAYS_ACCESSIBLE_PATHS.includes(pathname)) {
    console.log(
      `[MIDDLEWARE] No token. Path ${pathname} is in ALWAYS_ACCESSIBLE_PATHS. Allowing.`,
    );
    return NextResponse.next();
  }

  // 7. For all other paths, redirect to login.
  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`); // Preserve original destination
  console.log(
    `[MIDDLEWARE] No token. Path ${pathname} is protected. Redirecting to login: ${loginUrl.toString()}`,
  );
  return NextResponse.redirect(loginUrl);
}

// Matcher configuration:
// This applies the middleware to most paths.
// The logic inside the middleware then determines access.
// Exclude common static file paths from the matcher for performance if `isStaticAssetOrInternal` isn't catching them early enough or too broadly.
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - Other specific static assets if needed.
     * The `isStaticAssetOrInternal` check within the middleware provides more fine-grained control.
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
