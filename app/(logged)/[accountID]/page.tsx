import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import {
  getCurrentAccountData,
  getActiveTransactions,
  getSalesDataLast6Months,
} from "@/lib/ServerAction";
import { Role } from "@prisma/client";
import DashboardClient from "./DashboardClient";
import { DashboardSkeleton } from "@/components/ui/skeletons/DashboardSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type {
  AccountData,
  TransactionPropsForTransactions,
  SalesDataDetailed,
} from "@/lib/Types";
import type { Branch as PrismaBranch } from "@prisma/client";

interface PageProps {
  params: Promise<{ accountID: string }>;
}

async function DashboardData({
  accountID,
  loggedInUserId,
  isOwner,
}: {
  accountID: string;
  loggedInUserId: string;
  isOwner: boolean;
}) {
  // Fetch initial data in parallel
  const [accountData, transactions, salesData] = await Promise.all([
    getCurrentAccountData(accountID),
    getActiveTransactions(loggedInUserId),
    isOwner ? getSalesDataLast6Months() : Promise.resolve(null),
  ]);

  // Extract branches from sales data if available
  let branches: PrismaBranch[] = [];
  if (salesData?.branches && salesData.branches.length > 0) {
    branches = salesData.branches.map((b) => ({
      id: b.id,
      title: b.title,
      code: b.code,
      totalSales: b.totalSales || 0,
    })) as PrismaBranch[];
  }

  const transactionsArray: TransactionPropsForTransactions[] = Array.isArray(
    transactions,
  )
    ? transactions
    : [];

  return (
    <DashboardClient
      initialAccountData={accountData}
      initialTransactions={transactionsArray}
      initialSalesData={salesData}
      initialBranches={branches}
      accountId={accountID}
    />
  );
}

export default async function AccountDashboardPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { accountID } = await params;
  const loggedInUserId = session.user.id;
  const userRoles = session.user.role || [];
  const isOwner = Array.isArray(userRoles) && userRoles.includes(Role.OWNER);

  return (
    <ErrorBoundary>
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardData
          accountID={accountID}
          loggedInUserId={loggedInUserId}
          isOwner={isOwner}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
