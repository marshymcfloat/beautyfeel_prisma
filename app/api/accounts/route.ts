import { NextResponse } from "next/server";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient().$extends(withAccelerate());

// GET /api/accounts - Fetch all accounts
export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { username: "asc" },
      select: {
        // EXCLUDE password
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        salary: true,
        branchId: true,
        branch: { select: { id: true, title: true } }, // Include branch info
      },
    });
    return NextResponse.json(accounts);
  } catch (error) {
    console.error("Accounts GET Error:", error);
    return NextResponse.json(
      { message: "Failed to fetch accounts" },
      { status: 500 },
    );
  }
}
