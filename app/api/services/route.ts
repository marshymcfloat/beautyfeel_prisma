// src/app/api/services/route.ts
import { NextResponse } from "next/server";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient().$extends(withAccelerate());
// GET /api/services - Fetch all services
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
