import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { redirect } from "next/navigation";
import { Role } from "@prisma/client";
import ManageClient from "./ManageClient";
import { ManageSkeleton } from "@/components/ui/skeletons/ManageSkeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";

interface PageProps {
  params: Promise<{ accountID: string }>;
}

export default async function ManagePage({ params }: PageProps) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { accountID } = await params;
  const userRoles = session.user.role || [];
  const isOwner = Array.isArray(userRoles) && userRoles.includes(Role.OWNER);

  // Only owners can access this page
  if (!isOwner) {
    redirect(`/${accountID}`);
  }

  return (
    <ErrorBoundary>
      <Suspense fallback={<ManageSkeleton />}>
        <ManageClient
          loggedInAdminId={session.user.id}
          accountId={accountID}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
