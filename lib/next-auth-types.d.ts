// types/next-auth.d.ts
import NextAuth, { type DefaultSession, type DefaultUser } from "next-auth";
import { type JWT as NextAuthJWT, type DefaultJWT } from "next-auth/jwt"; // Alias JWT to avoid conflict if necessary
import { type Role } from "@prisma/client"; // Import Role type

// Extend the default User interface to match what your 'authorize' function returns
declare module "next-auth" {
  interface User extends DefaultUser {
    // Add the properties returned by your authorize function
    id: string; // Already part of DefaultUser, but good to be explicit
    role: Role[];
    branchId: string | null;
    // name and email are already part of DefaultUser
  }

  // Extend the Session interface to include the custom properties on session.user
  interface Session {
    user: {
      id: string;
      role: Role[];
      branchId: string | null;
    } & DefaultSession["user"]; // Merge with default session user properties (name, email, image)
  }
}

// Extend the JWT interface to include the custom properties stored in the token
declare module "next-auth/jwt" {
  interface JWT extends NextAuthJWT {
    // Use the aliased or full import path
    id: string;
    role: Role[];
    branchId: string | null;
    // name, email, picture are often included by default depending on provider/callbacks
  }
}
