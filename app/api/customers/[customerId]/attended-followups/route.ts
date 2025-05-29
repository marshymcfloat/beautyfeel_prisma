import { NextResponse } from "next/server";
import { RecommendedAppointmentStatus } from "@prisma/client";
import prisma from "@/lib/prisma";

const PHILIPPINES_TIMEZONE = "Asia/Manila";
function formatDateTimeToPH(dateUTC: Date | null | undefined): string {
  if (!dateUTC) return "N/A";
  try {
    const date = new Date(dateUTC);
    const options: Intl.DateTimeFormatOptions = {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: PHILIPPINES_TIMEZONE,
    };
    return new Intl.DateTimeFormat("en-US", options).format(date);
  } catch (e) {
    console.error("Error formatting date:", dateUTC, e);
    return "Invalid Date";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const awaitedParams = await params;
  const customerId = awaitedParams.customerId;

  if (!customerId) {
    return NextResponse.json(
      { message: "Customer ID is required." },
      { status: 400 },
    );
  }

  try {
    const attendedRAs = await prisma.recommendedAppointment.findMany({
      where: {
        customerId: customerId,
        status: RecommendedAppointmentStatus.ATTENDED,
      },
      include: {
        originatingService: {
          select: {
            id: true,
            title: true,
          },
        },
        attendedTransaction: {
          select: {
            bookedFor: true, // Use bookedFor as the attendance date
          },
        },
      },
      orderBy: {
        attendedTransaction: {
          bookedFor: "desc",
        },
      },
    });

    const formattedRAs = attendedRAs.map((ra) => ({
      id: ra.id,
      attendedDate: formatDateTimeToPH(ra.attendedTransaction?.bookedFor),
      originatingServiceTitle:
        ra.originatingService?.title || "Unknown Service",
    }));

    return NextResponse.json(formattedRAs);
  } catch (error) {
    console.error(
      `Error fetching attended follow-ups for customer ${customerId}:`,
      error,
    );
    return NextResponse.json(
      { message: "Error fetching appointment history." },
      { status: 500 },
    );
  }
}
