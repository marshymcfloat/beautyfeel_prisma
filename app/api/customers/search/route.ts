import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const name = searchParams.get("name");

  if (!name || name.length < 2) {
    return NextResponse.json([]);
  }

  try {
    const customers = await prisma.customer.findMany({
      where: {
        name: {
          contains: name,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
      },
      take: 10,
    });
    return NextResponse.json(customers);
  } catch (error) {
    console.error("Error searching customers:", error);

    return NextResponse.json(
      { message: "Error searching customers." },
      { status: 500 },
    );
  } finally {
  }
}
