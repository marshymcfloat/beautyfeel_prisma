import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { username: "asc" },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        salary: true,
        branchId: true,
        branch: { select: { id: true, title: true } },
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
