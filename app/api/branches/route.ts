// src/app/api/branches/route.ts
import { NextResponse } from "next/server";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient().$extends(withAccelerate());
// GET /api/branches - Fetch all branches
export async function GET() {
  try {
    const branches = await prisma.branch.findMany({
      orderBy: { title: "asc" },
      select: { id: true, title: true, code: true, totalSales: true },
    });
    return NextResponse.json(branches);
  } catch (error) {
    console.error("Branches GET Error:", error);
    return NextResponse.json(
      { message: "Failed to fetch branches" },
      { status: 500 },
    );
  }
}
