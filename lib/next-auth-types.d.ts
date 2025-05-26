// types/next-auth.d.ts
import NextAuth, { type DefaultSession, type DefaultUser } from "next-auth";
import { type JWT as NextAuthJWT } from "next-auth/jwt"; // No need to alias DefaultJWT if not used directly
import { type Role } from "@prisma/client";

declare module "next-auth" {
  /**
   * Returned by `authorize`, `useSession`, `getSession` and received as a prop on the `SessionProvider` React Context
   */
  interface User extends DefaultUser {
    // Properties returned by your 'authorize' function
    id: string; // DefaultUser has id, but ensure it's string
    role: Role[];
    branchId: string | null;
    mustChangePassword: boolean; // Added for this flow
    // name and email are part of DefaultUser but can be overridden if needed
    // Ensure your authorize function returns these if you rely on DefaultUser's types
    name?: string | null;
    email?: string | null;
  }

  interface Session {
    user: {
      id: string;
      role: Role[];
      branchId: string | null;
      mustChangePassword: boolean; // Added for this flow
      username?: string | null; // Often useful to have username in session
    } & DefaultSession["user"]; // Merges with default session user properties (name, email, image)
  }
}

declare module "next-auth/jwt" {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT extends NextAuthJWT {
    id: string;
    role: Role[];
    branchId: string | null;
    mustChangePassword: boolean; // Added for this flow
    username?: string | null; // Often useful to have username in JWT
    // name, email, picture are often included by default depending on provider/callbacks
    // but it's good to be explicit if you are adding them in the jwt callback
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  }
}
