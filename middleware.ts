// middleware.ts
import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Define paths that are always accessible, regardless of authentication state.
const ALWAYS_ACCESSIBLE_PATHS = [
  "/", // Root page is accessible to everyone
  "/login",
];

// Cache for static asset patterns (optimized)
const STATIC_PATTERN = /\.(ico|png|jpg|jpeg|gif|svg|css|js|webmanifest|txt|xml|well-known)$/i;

// Helper to check if a path is an API auth route for NextAuth
const isApiAuthRoute = (pathname: string): boolean => 
  pathname.startsWith("/api/auth/");

// Helper to check for static assets, Next.js internals
const isStaticAssetOrInternal = (pathname: string): boolean =>
  pathname.startsWith("/_next/") ||
  pathname.startsWith("/static/") ||
  STATIC_PATTERN.test(pathname);

// Optimized: Only log in development
const isDevelopment = process.env.NODE_ENV === "development";
const log = (message: string) => {
  if (isDevelopment) {
    console.log(message);
  }
};

/**
 * Get the default dashboard path for a user
 */
const getDashboardPath = (accountId: string | undefined): string => {
  return accountId ? `/${accountId}` : "/";
};

export async function middleware(request: NextRequest) {
  const { pathname, search, origin } = request.nextUrl;
  log(`[MIDDLEWARE] Request to: ${pathname}`);

  // 1. Early return for static assets, Next.js internals, and NextAuth API routes
  if (isStaticAssetOrInternal(pathname) || isApiAuthRoute(pathname)) {
    return NextResponse.next();
  }

  // 2. Get authentication token (optimized with cache)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // --- Logic for Authenticated Users (token exists) ---
  if (token) {
    log(
      `[MIDDLEWARE] Token found - ID: ${token.id}, mustChangePassword: ${token.mustChangePassword}`,
    );

    const dashboardPath = getDashboardPath(token.id);

    // 3. Enforce `mustChangePassword` - highest priority
    if (token.mustChangePassword === true) {
      // If user must change password and is NOT on the change-password page
      if (pathname !== "/auth/change-password") {
        log(
          `[MIDDLEWARE] mustChangePassword is TRUE. Redirecting to /auth/change-password.`,
        );
        const changePasswordUrl = new URL("/auth/change-password", origin);
        // Preserve callbackUrl for after password change
        const currentUrl = new URL(request.url);
        const callbackUrl = currentUrl.searchParams.get("callbackUrl");
        if (callbackUrl) {
          changePasswordUrl.searchParams.set("callbackUrl", callbackUrl);
        } else if (pathname !== "/" && pathname !== "/login") {
          // Preserve current path as callbackUrl if not already set
          changePasswordUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
        }
        return NextResponse.redirect(changePasswordUrl);
      }
      // User must change password AND IS already on the change-password page, allow it
      return NextResponse.next();
    }

    // --- User is authenticated, and mustChangePassword is FALSE ---

    // 4. If `mustChangePassword` is false, and user tries to access change-password page, redirect to dashboard
    if (pathname === "/auth/change-password") {
      // Get callbackUrl if it exists, otherwise use dashboard
      const currentUrl = new URL(request.url);
      const callbackUrl = currentUrl.searchParams.get("callbackUrl") || dashboardPath;
      return NextResponse.redirect(new URL(callbackUrl, origin));
    }

    // 5. If authenticated user tries to access /login, redirect to dashboard or callbackUrl
    if (pathname === "/login") {
      const currentUrl = new URL(request.url);
      const callbackUrl = currentUrl.searchParams.get("callbackUrl") || dashboardPath;
      return NextResponse.redirect(new URL(callbackUrl, origin));
    }

    // 6. Authenticated user (MCP=false), allow access to other routes
    return NextResponse.next();
  }

  // --- Logic for Unauthenticated Users (no token) ---
  log(`[MIDDLEWARE] No token for path: ${pathname}`);

  // 7. Allow access to explicitly public/always accessible paths
  if (ALWAYS_ACCESSIBLE_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  // 8. For all other paths, redirect to login with callbackUrl
  const loginUrl = new URL("/login", origin);
  const fullPath = `${pathname}${search}`;
  // Only add callbackUrl if it's not already the login page
  if (fullPath !== "/login" && !fullPath.startsWith("/login?")) {
    loginUrl.searchParams.set("callbackUrl", fullPath);
  }

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
