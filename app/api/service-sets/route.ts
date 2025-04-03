// src/app/api/service-sets/route.ts
import { NextResponse } from "next/server";
import { withAccelerate } from "@prisma/extension-accelerate";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient().$extends(withAccelerate());

// GET /api/service-sets - Fetch all service sets with their services
export async function GET() {
  try {
    const serviceSets = await prisma.serviceSet.findMany({
      orderBy: { title: "asc" },
      include: {
        // Include the related services to display them
        services: {
          select: {
            id: true,
            title: true,
            price: true, // Include price for reference if needed
          },
          orderBy: { title: "asc" }, // Order included services
        },
      },
    });

    return NextResponse.json(serviceSets);
  } catch (error) {
    console.error("Service Sets GET Error:", error);
    return NextResponse.json(
      { message: "Failed to fetch service sets" },
      { status: 500 },
    );
  }
}
