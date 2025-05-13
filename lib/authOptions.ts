// lib/authOptions.ts
import NextAuth, { type NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
// Remove PrismaAdapter import if not using Database Sessions
// import { PrismaAdapter } from "@next-auth/prisma-adapter";
import { PrismaClient, Role } from "@prisma/client";
import { compare } from "bcryptjs";

// Instantiate Prisma Client here or import if you have a central instance
const prisma = new PrismaClient();

export const authOptions: NextAuthOptions = {
  // adapter: PrismaAdapter(prisma), // Uncomment if using DB sessions

  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const username = credentials?.username;
        const password = credentials?.password;

        if (!username || !password) return null;

        try {
          const user = await prisma.account.findUnique({
            where: { username: username },
          });

          if (user && (await compare(password, user.password))) {
            console.log(`Auth Success: User ${user.username} authorized.`);
            // Return object matching the User interface in next-auth.d.ts
            // Ensure all properties needed in token/session are returned
            return {
              id: user.id,
              name: user.name,
              email: user.email, // Return email if needed
              role: user.role,
              branchId: user.branchId,
            };
          } else {
            console.warn(
              `Auth Failure: ${
                user ? "Invalid password" : "User not found"
              } for ${username}`,
            );
            return null; // Indicate failure
          }
        } catch (error) {
          console.error("Error during authorization:", error);
          return null; // Indicate failure
        }
      },
    }),
  ],

  session: {
    strategy: "jwt", // JWT is required for getToken in middleware
  },

  callbacks: {
    // Ensure JWT callback includes all necessary user data
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // Type assertion needed as 'user' object from authorize might not perfectly match JWT type initially
        token.role = (user as any).role as Role[];
        token.branchId = (user as any).branchId as string | null;
        token.name = user.name ?? null;
        token.email = user.email ?? null;
      }
      return token;
    },

    // Ensure Session callback correctly maps from token to session.user
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role[];
        session.user.branchId = token.branchId as string | null;
        session.user.name = token.name ?? null;
        session.user.email = token.email ?? null;
      }
      return session;
    },
  },

  pages: {
    signIn: "/login", // Redirects happen here if middleware detects no token
    // error: '/auth/error', // Optional: Custom error page for auth errors
    // signOut: '/auth/signout', // Optional
  },

  // Optional: Debugging
  // debug: process.env.NODE_ENV === 'development',
};
