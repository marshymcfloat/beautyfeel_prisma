import { PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function GET() {
  try {
    const services = await prisma.service.findMany();

    console.log(services);

    return NextResponse.json(services);
  } catch (error) {
    console.error("❌ Error fetching services:", error);

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
