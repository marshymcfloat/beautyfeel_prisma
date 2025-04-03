// src/app/api/vouchers/route.ts
import { NextResponse } from "next/server";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient().$extends(withAccelerate());
// GET /api/vouchers - Fetch all vouchers
export async function GET() {
  try {
    const vouchers = await prisma.voucher.findMany({
      orderBy: { code: "asc" },
      // Select necessary fields
      select: { id: true, code: true, value: true, usedAt: true },
    });
    return NextResponse.json(vouchers);
  } catch (error) {
    console.error("Vouchers GET Error:", error);
    return NextResponse.json(
      { message: "Failed to fetch vouchers" },
      { status: 500 },
    );
  }
}
