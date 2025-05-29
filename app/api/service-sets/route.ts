import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const serviceSets = await prisma.serviceSet.findMany({
      orderBy: { title: "asc" },
      include: {
        services: {
          select: {
            id: true,
            title: true,
            price: true,
          },
          orderBy: { title: "asc" },
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
