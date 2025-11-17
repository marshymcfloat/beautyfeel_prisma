import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import {
  getAllServicesOnly,
  getAllServiceSets,
  getAllBranches,
  getActiveDiscountRules,
} from "@/lib/ServerAction";
import CashierClient from "./CashierClient";
import { CashierSkeleton } from "@/components/ui/skeletons/CashierSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type {
  Service,
  ServiceSet,
  Branch,
} from "@prisma/client";
import type { UIDiscountRuleWithServices } from "@/lib/Types";

interface PageProps {
  params: Promise<{ accountID: string }>;
}

async function CashierData({ accountID }: { accountID: string }) {
  // Fetch initial data in parallel
  const [services, serviceSets, branches, discountRules] = await Promise.all([
    getAllServicesOnly(),
    getAllServiceSets(),
    getAllBranches(),
    getActiveDiscountRules(),
  ]);

  // Ensure arrays
  const servicesArray: Service[] = Array.isArray(services) ? services : [];
  const serviceSetsArray: ServiceSet[] = Array.isArray(serviceSets) ? serviceSets : [];
  const branchesArray: Branch[] = Array.isArray(branches) ? branches : [];
  const discountRulesArray: UIDiscountRuleWithServices[] = Array.isArray(discountRules)
    ? discountRules
    : [];

  return (
    <CashierClient
      initialServices={servicesArray}
      initialServiceSets={serviceSetsArray}
      initialBranches={branchesArray}
      initialDiscountRules={discountRulesArray}
      accountId={accountID}
    />
  );
}

export default async function CashierPage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { accountID } = await params;

  return (
    <ErrorBoundary>
      <Suspense fallback={<CashierSkeleton />}>
        <CashierData accountID={accountID} />
      </Suspense>
    </ErrorBoundary>
  );
}
