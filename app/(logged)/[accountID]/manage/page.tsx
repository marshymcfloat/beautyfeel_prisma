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
  ListOrdered,
} from "lucide-react";

import ManageServices from "@/components/ui/customize/ManageServices";
import ManageAccounts from "@/components/ui/customize/ManageAccounts";
import ManageVouchers from "@/components/ui/customize/ManageVouchers";
import ManageBranches from "@/components/ui/customize/ManageBranches";
import ManageServiceSets from "@/components/ui/customize/ManageServiceSets";
import ManageDiscounts from "@/components/ui/customize/ManageDiscounts";
import ManageGiftCertificates from "@/components/ui/customize/ManageGiftCertificates";
import ManagePayslip from "@/components/ui/customize/ManagePaySlip";
import ManageTransactions from "@/components/ui/customize/ManageTransactions";
import { TabConfig, ActiveTab } from "@/lib/Types";

type ExtendedActiveTab = ActiveTab | "transactions";

const TABS: TabConfig[] = [
  { id: "services", label: "Services", icon: Settings },
  { id: "serviceSets", label: "Service Sets", icon: Layers },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "transactions", label: "Transactions", icon: ListOrdered },
  { id: "payslips", label: "Payslips", icon: Receipt },
  { id: "vouchers", label: "Vouchers", icon: Ticket },
  { id: "giftCertificate", label: "Gift Certificates", icon: Gift },
  { id: "discounts", label: "Discounts", icon: Percent },
  { id: "branches", label: "Branches", icon: MapPin },
];

export default function CustomizePage() {
  const [activeTab, setActiveTab] = useState<ExtendedActiveTab>("services");

  const renderActiveComponent = () => {
    switch (activeTab) {
      case "services":
        return <ManageServices />;
      case "serviceSets":
        return <ManageServiceSets />;
      case "accounts":
        return <ManageAccounts />;
      case "transactions":
        return <ManageTransactions />;
      case "payslips":
        return <ManagePayslip />;
      case "vouchers":
        return <ManageVouchers />;
      case "giftCertificate":
        return <ManageGiftCertificates />;
      case "discounts":
        return <ManageDiscounts />;
      case "branches":
        return <ManageBranches />;
      default:
        return <ManageServices />;
    }
  };

  const activeTabButtonStyle =
    "bg-customOffWhite/90 text-customDarkPink shadow-sm border-b-2 border-customDarkPink font-semibold";
  const inactiveTabButtonStyle =
    "bg-transparent text-customBlack/60 hover:text-customBlack hover:bg-customOffWhite/50 border-b-2 border-transparent";
  const selectStyle =
    "block w-full rounded-md border-customGray/50 focus:border-customDarkPink focus:ring-customDarkPink py-2.5 px-3 shadow-sm bg-customOffWhite text-customBlack ring-1 ring-inset ring-customGray/30";

  return (
    <div>
      <h1 className="mb-4 flex-shrink-0 text-xl font-semibold text-customBlack sm:mb-5 md:text-2xl">
        Customize Settings
      </h1>

      {/* Mobile Select */}
      <div className="mb-4 flex-shrink-0 md:hidden">
        <label htmlFor="tabs-select" className="sr-only">
          Select Settings Area
        </label>
        <select
          id="tabs-select"
          name="tabs-select"
          className={selectStyle}
          onChange={(e) => setActiveTab(e.target.value as ExtendedActiveTab)}
          value={activeTab}
        >
          {TABS.map((tab) => (
            <option key={tab.id} value={String(tab.id)}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop Tabs */}
      <div className="mb-1 hidden flex-shrink-0 border-b border-customGray/30 md:block">
        <nav
          className="-mb-px flex space-x-2 overflow-x-auto pb-px"
          aria-label="Tabs"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as ExtendedActiveTab)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-customDarkPink/60 focus:ring-offset-1 ${
                activeTab === tab.id
                  ? activeTabButtonStyle
                  : inactiveTabButtonStyle
              }`}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              <tab.icon
                size={16}
                aria-hidden="true"
                className={
                  activeTab === tab.id
                    ? "text-customDarkPink"
                    : "text-customBlack/50"
                }
              />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Active Component Area */}
      <div className="mt-4 rounded-lg bg-customOffWhite/80 p-4 shadow-inner backdrop-blur-sm sm:p-6">
        {renderActiveComponent()}
      </div>
    </div>
  );
}
