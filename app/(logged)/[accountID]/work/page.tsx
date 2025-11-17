import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { getActiveTransactions } from "@/lib/ServerAction";
import WorkClient from "./WorkClient";
import { WorkSkeleton } from "@/components/ui/skeletons/WorkSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { TransactionProps } from "@/lib/Types";

interface PageProps {
  params: Promise<{ accountID: string }>;
}

async function WorkData({ accountID, loggedInUserId }: {
  accountID: string;
  loggedInUserId: string;
}) {
  // Fetch initial transactions
  const transactions = await getActiveTransactions(loggedInUserId);
  const transactionsArray: TransactionProps[] = Array.isArray(transactions)
    ? transactions
    : [];

  return (
    <WorkClient
      initialTransactions={transactionsArray}
      accountId={accountID}
      loggedInUserId={loggedInUserId}
    />
  );
}

export default async function WorkPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { accountID } = await params;
  const loggedInUserId = session.user.id;

  return (
    <ErrorBoundary>
      <Suspense fallback={<WorkSkeleton />}>
        <WorkData accountID={accountID} loggedInUserId={loggedInUserId} />
      </Suspense>
    </ErrorBoundary>
  );
}
