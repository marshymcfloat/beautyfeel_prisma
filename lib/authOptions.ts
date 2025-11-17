// lib/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient, Role } from "@prisma/client";
import { compare } from "bcryptjs";

const prisma = new PrismaClient();
const isDevelopment = process.env.NODE_ENV === "development";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET, // Essential: Set this in your .env

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "jsmith" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // Validate input
        if (!credentials?.username || !credentials.password) {
          if (isDevelopment) {
            console.warn("[AUTH_AUTHORIZE] Missing username or password.");
          }
          return null;
        }

        const { username, password } = credentials;
        const trimmedUsername = username.trim();

        if (trimmedUsername.length === 0 || trimmedUsername.length > 100) {
          if (isDevelopment) {
            console.warn("[AUTH_AUTHORIZE] Invalid username format.");
          }
          return null;
        }

        // Validate password format
        if (password.length === 0 || password.length > 500) {
          if (isDevelopment) {
            console.warn("[AUTH_AUTHORIZE] Invalid password format.");
          }
          return null;
        }

        try {
          // Find user by username (case-sensitive)
          const user = await prisma.account.findUnique({
            where: { username: trimmedUsername },
            select: {
              id: true,
              username: true,
              password: true,
              name: true,
              email: true,
              role: true,
              branchId: true,
              mustChangePassword: true,
            },
          });

          // Always perform password comparison to prevent timing attacks
          // Use a dummy hash if user doesn't exist
          const dummyHash =
            "$2a$10$dummy.hash.to.prevent.timing.attacks.by.ensuring.constant.time.comparison";
          const hashToCompare = user?.password || dummyHash;

          // Compare passwords (always takes same time regardless of user existence)
          const isValidPassword = await compare(password, hashToCompare);

          // Only return user if both user exists AND password is valid
          if (!user || !isValidPassword) {
            if (isDevelopment) {
              console.warn(
                `[AUTH_AUTHORIZE] Authentication failed for username: ${trimmedUsername}`,
              );
            }
            return null;
          }

          if (isDevelopment) {
            console.log(
              `[AUTH_AUTHORIZE] Auth Success: User ${user.username} authorized.`,
            );
          }

          // This object MUST match the 'User' interface in your next-auth.d.ts
          const authorizedUser = {
            id: user.id,
            name: user.name,
            email: user.email,
            username: user.username,
            role: user.role,
            branchId: user.branchId,
            mustChangePassword: user.mustChangePassword,
          };

          return authorizedUser;
        } catch (error) {
          console.error("[AUTH_AUTHORIZE] Error during authorization:", error);
          // Don't expose internal errors to client
          return null;
        }
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user, trigger, session: sessionUpdateData }) {
      // The 'user' object is available only on initial sign-in.
      if (user) {
        if (isDevelopment) {
          console.log('[AUTH_JWT] Initial sign-in, "user" object:', {
            id: user.id,
            username: (user as any).username,
            mustChangePassword: user.mustChangePassword,
          });
        }
        const typedUser = user as import("next-auth").User;

        token.id = typedUser.id;
        token.name = typedUser.name;
        token.email = typedUser.email;
        token.username = (typedUser as any).username;
        token.role = typedUser.role;
        token.branchId = typedUser.branchId;
        token.mustChangePassword = typedUser.mustChangePassword;
      }

      // Handle session updates, e.g., after password change via client-side updateSession()
      if (
        trigger === "update" &&
        typeof sessionUpdateData?.mustChangePassword === "boolean"
      ) {
        if (isDevelopment) {
          console.log(
            "[AUTH_JWT] Session update triggered. New mustChangePassword:",
            sessionUpdateData.mustChangePassword,
          );
        }
        token.mustChangePassword = sessionUpdateData.mustChangePassword;
      }

      return token;
    },

    async session({ session, token }) {
      // The 'token' object is the JWT payload from the 'jwt' callback.
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string | null;
        session.user.email = token.email as string | null;
        session.user.username = token.username as string | null;
        session.user.role = token.role as Role[];
        session.user.branchId = token.branchId as string | null;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login",
    error: "/login", // Redirect auth errors to login page
  },

  // Security: Prevent CSRF attacks
  useSecureCookies: process.env.NODE_ENV === "production",

  // Session configuration
  session: {
    strategy: "jwt", // Using JWT strategy is crucial for getToken in middleware
    maxAge: 30 * 24 * 60 * 60, // 30 days
    updateAge: 24 * 60 * 60, // 24 hours
  },

  // Events for logging (optional)
  events: {
    async signIn({ user, isNewUser }) {
      if (isDevelopment) {
        console.log(`[AUTH_EVENT] User signed in: ${user.id}`);
      }
    },
    async signOut({ session }) {
      if (isDevelopment) {
        console.log(`[AUTH_EVENT] User signed out: ${session?.user?.id}`);
      }
    },
  },
};
