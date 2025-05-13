// app/api/customers/[customerId]/attended-followups/route.ts
import { NextResponse } from "next/server";
import { PrismaClient, RecommendedAppointmentStatus } from "@prisma/client";

// It's good practice to instantiate Prisma Client once and reuse it.
// See: https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#prismaclient-in-long-running-applications
let prisma: PrismaClient;

if (process.env.NODE_ENV === "production") {
  prisma = new PrismaClient();
} else {
  // Ensure the prisma instance is re-used during hot-reloading in development
  // @ts-ignore
  if (!global.prisma) {
    // @ts-ignore
    global.prisma = new PrismaClient();
  }
  // @ts-ignore
  prisma = global.prisma;
}

// Helper for timezone formatting (can be moved to a shared utils file)
const PHILIPPINES_TIMEZONE = "Asia/Manila";
function formatDateTimeToPH(dateUTC: Date | null | undefined): string {
  if (!dateUTC) return "N/A";
  try {
    // Ensure it's a Date object (already is if fetched from Prisma, but good defensive programming)
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
  // *** FIX START: Type 'params' as a Promise that resolves to the expected object shape ***
  { params }: { params: Promise<{ customerId: string }> },
  // *** FIX END ***
) {
  // The 'await params' inside the function body is still necessary when tainting is enabled.
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
        // Order by the bookedFor date of the attended transaction.
        // If attendedTransaction or bookedFor could be null for ATTENDED status,
        // you might need a more complex orderBy or pre-filter.
        // Assuming they are reliably present for ATTENDED status here.
        attendedTransaction: {
          bookedFor: "desc",
        },
      },
    });

    // Format dates and structure data for frontend
    const formattedRAs = attendedRAs.map((ra) => ({
      id: ra.id,
      // Access the bookedFor date safely with optional chaining
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
    // Return a generic error response
    return NextResponse.json(
      { message: "Error fetching appointment history." },
      { status: 500 },
    );
  }
  // Note: Disconnecting Prisma client in server actions depends on your setup (e.g., Edge vs Node.js).
  // If needed, add the check and disconnect in a finally block.
  // finally {
  //   if (prisma && typeof (prisma as any).$disconnect === 'function') {
  //     await prisma.$disconnect();
  //   }
  // }
}
