// app/api/customers/search/route.ts
import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient(); // Consider using a singleton in production

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name || name.length < 2) {
    return NextResponse.json([]); // Return empty array for short queries
  }

  try {
    const customers = await prisma.customer.findMany({
      where: {
        name: {
          contains: name,
          mode: "insensitive", // Case-insensitive search
        },
      },
      select: {
        id: true,
        name: true,
        email: true, // Optionally include email
      },
      take: 10, // Limit results
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Error searching customers:", error);
    // In a real app, avoid sending raw error details in production
    return NextResponse.json(
      { message: "Error searching customers." },
      { status: 500 },
    );
  } finally {
    // await prisma.$disconnect(); // Only disconnect if not using a singleton pattern
  }
}
