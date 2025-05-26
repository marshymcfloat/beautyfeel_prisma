// lib/authOptions.ts
import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaClient, Role } from "@prisma/client"; // Assuming Role enum is from Prisma
import { compare } from "bcryptjs";

const prisma = new PrismaClient();

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
        if (!credentials?.username || !credentials.password) {
          console.error("[AUTH_AUTHORIZE] Missing username or password.");
          return null; // Or throw an error that NextAuth can display
        }

        const { username, password } = credentials;

        try {
          const user = await prisma.account.findUnique({
            where: { username: username },
          });

          if (!user) {
            console.warn(`[AUTH_AUTHORIZE] User not found: ${username}`);
            return null;
          }

          const isValidPassword = await compare(password, user.password);

          if (!isValidPassword) {
            console.warn(
              `[AUTH_AUTHORIZE] Invalid password for user: ${username}`,
            );
            return null;
          }

          console.log(
            `[AUTH_AUTHORIZE] Auth Success: User ${user.username} authorized.`,
          );
          // This object MUST match the 'User' interface in your next-auth.d.ts
          const authorizedUser = {
            id: user.id,
            name: user.name,
            email: user.email, // Ensure your Account model has email
            username: user.username, // Adding username to the user object
            role: user.role,
            branchId: user.branchId,
            mustChangePassword: user.mustChangePassword,
          };
          console.log(
            "[AUTH_AUTHORIZE] Returning user object:",
            JSON.stringify(authorizedUser, null, 2),
          );
          return authorizedUser;
        } catch (error) {
          console.error("[AUTH_AUTHORIZE] Error during authorization:", error);
          return null;
        }
      },
    }),
  ],

  session: {
    strategy: "jwt", // Using JWT strategy is crucial for getToken in middleware
  },

  callbacks: {
    async jwt({ token, user, trigger, session: sessionUpdateData }) {
      // The 'user' object is available only on initial sign-in.
      // It's the object returned by the 'authorize' callback.
      if (user) {
        console.log(
          '[AUTH_JWT] Initial sign-in, "user" object:',
          JSON.stringify(user, null, 2),
        );
        const typedUser = user as import("next-auth").User; // Use the augmented User type

        token.id = typedUser.id;
        token.name = typedUser.name;
        token.email = typedUser.email;
        token.username = (typedUser as any).username; // If username added in authorize
        token.role = typedUser.role;
        token.branchId = typedUser.branchId;
        token.mustChangePassword = typedUser.mustChangePassword;
      }

      // Handle session updates, e.g., after password change via client-side updateSession()
      if (
        trigger === "update" &&
        typeof sessionUpdateData?.mustChangePassword === "boolean"
      ) {
        console.log(
          "[AUTH_JWT] Session update triggered. New mustChangePassword:",
          sessionUpdateData.mustChangePassword,
        );
        token.mustChangePassword = sessionUpdateData.mustChangePassword;
      }
      console.log(
        "[AUTH_JWT] Returning token:",
        JSON.stringify(token, null, 2),
      );
      return token;
    },

    async session({ session, token }) {
      // The 'token' object is the JWT payload from the 'jwt' callback.
      console.log(
        '[AUTH_SESSION] "token" object for session:',
        JSON.stringify(token, null, 2),
      );
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.name = token.name as string | null;
        session.user.email = token.email as string | null;
        session.user.username = token.username as string | null;
        session.user.role = token.role as Role[];
        session.user.branchId = token.branchId as string | null;
        session.user.mustChangePassword = token.mustChangePassword as boolean;
      }
      console.log(
        "[AUTH_SESSION] Returning session:",
        JSON.stringify(session, null, 2),
      );
      return session;
    },
  },

  pages: {
    signIn: "/login", // Your designated login page/modal trigger route
    // error: "/auth/error", // Optional: custom error page for auth errors
  },

  // debug: process.env.NODE_ENV === "development", // Useful for verbose logging from NextAuth
};
