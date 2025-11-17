"use client";

import React, { useState } from "react";
import {
  Settings,
  Layers,
  Users,
  Ticket,
  Percent,
  MapPin,
  Gift,
  Receipt,
  Bell,
  ListOrdered,
  Mail,
  BookUser,
} from "lucide-react";

import ManageServices from "@/components/ui/customize/ManageServices";
import ManageAccounts from "@/components/ui/customize/ManageAccounts";
import ManageVouchers from "@/components/ui/customize/ManageVouchers";
import ManageBranches from "@/components/ui/customize/ManageBranches";
import ManageServiceSets from "@/components/ui/customize/ManageServiceSets";
import PayslipRequestManager from "@/components/ui/customize/PayslipRequestManager";
import ManageDiscounts from "@/components/ui/customize/ManageDiscounts";
import ManageGiftCertificates from "@/components/ui/customize/ManageGiftCertificates";
import ManagePayslips from "@/components/ui/customize/ManagePayslips";
import ManageTransactions from "@/components/ui/customize/ManageTransactions";
import ManageAdvertisements from "@/components/ui/customize/ManageAdvertisements";
import ManageEmailTemplates from "@/components/ui/customize/ManageEmailTemplate";
import { TabConfig } from "@/lib/Types";
import ManageCustomers from "@/components/ui/customize/ManageCustomers";

type PossibleTabs =
  | "services"
  | "serviceSets"
  | "accounts"
  | "customers"
  | "transactions"
  | "payslips"
  | "vouchers"
  | "giftCertificate"
  | "discounts"
  | "branches"
  | "advertisements"
  | "emailTemplate";

const TABS: TabConfig[] = [
  { id: "services" as PossibleTabs, label: "Services", icon: Settings },
  { id: "serviceSets" as PossibleTabs, label: "Service Sets", icon: Layers },
  { id: "accounts" as PossibleTabs, label: "Accounts", icon: Users },
  { id: "customers" as PossibleTabs, label: "Customers", icon: BookUser },
  {
    id: "transactions" as PossibleTabs,
    label: "Transactions",
    icon: ListOrdered,
  },
  { id: "payslips" as PossibleTabs, label: "Payslips", icon: Receipt },
  { id: "vouchers" as PossibleTabs, label: "Vouchers", icon: Ticket },
  {
    id: "giftCertificate" as PossibleTabs,
    label: "Gift Certificates",
    icon: Gift,
  },
  { id: "discounts" as PossibleTabs, label: "Discounts", icon: Percent },
  { id: "branches" as PossibleTabs, label: "Branches", icon: MapPin },
  { id: "advertisements" as PossibleTabs, label: "Advertisements", icon: Bell },
  { id: "emailTemplate" as PossibleTabs, label: "Email Template", icon: Mail },
];

interface ManageClientProps {
  loggedInAdminId: string;
  accountId: string;
}

export default function ManageClient({
  loggedInAdminId,
  accountId,
}: ManageClientProps) {
  const [activeTab, setActiveTab] = useState<PossibleTabs>("services");

  const renderActiveComponent = () => {
    switch (activeTab) {
      case "services":
        return <ManageServices />;
      case "serviceSets":
        return <ManageServiceSets />;
      case "accounts":
        return <ManageAccounts />;
      case "customers":
        return <ManageCustomers />;
      case "transactions":
        return <ManageTransactions />;
      case "payslips":
        return <PayslipRequestManager />;
      case "vouchers":
        return <ManageVouchers />;
      case "giftCertificate":
        return <ManageGiftCertificates />;
      case "discounts":
        return <ManageDiscounts />;
      case "branches":
        return <ManageBranches />;
      case "advertisements":
        return <ManageAdvertisements />;
      case "emailTemplate":
        return <ManageEmailTemplates />;
      default:
        return <ManageServices />;
    }
  };

  return (
    <div className="flex h-screen flex-col bg-customOffWhite">
      <div className="flex-shrink-0 border-b border-customGray bg-white p-4">
        <h1 className="text-2xl font-semibold text-customBlack">
          Management Dashboard
        </h1>
      </div>

      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar with tabs */}
        <div className="w-64 flex-shrink-0 border-r border-customGray bg-white p-4">
          <nav className="space-y-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as PossibleTabs)}
                  className={`w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors ${
                    activeTab === tab.id
                      ? "bg-customDarkPink text-white"
                      : "text-customBlack hover:bg-customOffWhite"
                  }`}
                >
                  <Icon size={20} />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Main content area */}
        <div className="flex-grow overflow-y-auto bg-customOffWhite p-6">
          {renderActiveComponent()}
        </div>
      </div>
    </div>
  );
}

