import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const services = await prisma.service.findMany({
      orderBy: { title: "asc" },
      include: {
        branch: { select: { id: true, title: true } },
      },
    });
    return NextResponse.json(services);
  } catch (error) {
    console.error("Services GET Error:", error);
    return NextResponse.json(
      { message: "Failed to fetch services" },
      { status: 500 },
    );
  }
}
