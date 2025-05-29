import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const vouchers = await prisma.voucher.findMany({
      orderBy: { code: "asc" },

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
