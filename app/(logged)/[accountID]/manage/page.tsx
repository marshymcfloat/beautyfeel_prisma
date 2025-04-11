// src/app/dashboard/[accountID]/manage/page.tsx (or your customize page file)
"use client";

import React, { useState } from "react";
import {
  Settings,
  Layers,
  Users,
  Ticket,
  CreditCard,
  Percent,
  MapPin,
  Gift,
} from "lucide-react";

// Child Component Imports
import ManageServices from "@/components/ui/customize/ManageServices";
import ManageAccounts from "@/components/ui/customize/ManageAccounts";
import ManageVouchers from "@/components/ui/customize/ManageVouchers";
import ManageBranches from "@/components/ui/customize/ManageBranches";
import ManageServiceSets from "@/components/ui/customize/ManageServiceSets";
import ManageDiscounts from "@/components/ui/customize/ManageDiscounts";
import ManageGiftCertificates from "@/components/ui/customize/ManageGiftCertificates";

// Define tab types and structure
type ActiveTab =
  | "services"
  | "serviceSets"
  | "accounts"
  | "vouchers"
  | "giftCertificate"
  | "discounts"
  | "branches";
interface TabConfig {
  id: ActiveTab;
  label: string;
  icon: React.ElementType;
}

const TABS: TabConfig[] = [
  { id: "services", label: "Services", icon: Settings },
  { id: "serviceSets", label: "Service Sets", icon: Layers },
  { id: "accounts", label: "Accounts", icon: Users },
  { id: "vouchers", label: "Vouchers", icon: Ticket },
  { id: "giftCertificate", label: "Gift Certificates", icon: Gift },
  { id: "discounts", label: "Discounts", icon: Percent },
  { id: "branches", label: "Branches", icon: MapPin },
];

export default function CustomizePage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("services");

  const renderActiveComponent = () => {
    switch (activeTab) {
      case "services":
        return <ManageServices />;
      case "serviceSets":
        return <ManageServiceSets />;
      case "accounts":
        return <ManageAccounts />;
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

  // --- Styling Constants ---
  const activeTabButtonStyle =
    "bg-customOffWhite/90 text-customDarkPink shadow-sm border-b-2 border-customDarkPink font-semibold";
  const inactiveTabButtonStyle =
    "bg-transparent text-customBlack/60 hover:text-customBlack hover:bg-customOffWhite/50 border-b-2 border-transparent";
  const selectStyle =
    "block w-full rounded-md border-customGray/50 focus:border-customDarkPink focus:ring-customDarkPink py-2.5 px-3 shadow-sm bg-customOffWhite text-customBlack ring-1 ring-inset ring-customGray/30";

  return (
    // REMOVED flex flex-col h-full
    <div>
      <h1 className="mb-4 flex-shrink-0 text-xl font-semibold text-customBlack sm:mb-5 md:text-2xl">
        Customize Settings
      </h1>

      {/* --- Tab Navigation --- */}
      <div className="mb-4 flex-shrink-0 md:hidden">
        {" "}
        {/* Mobile Select */}
        <label htmlFor="tabs-select" className="sr-only">
          Select Settings Area
        </label>
        <select
          id="tabs-select"
          name="tabs-select"
          className={selectStyle}
          onChange={(e) => setActiveTab(e.target.value as ActiveTab)}
          value={activeTab}
        >
          {TABS.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-1 hidden flex-shrink-0 border-b border-customGray/30 md:block">
        {" "}
        {/* Desktop Tabs */}
        <nav
          className="-mb-px flex space-x-2 overflow-x-auto pb-px"
          aria-label="Tabs"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-customDarkPink/60 focus:ring-offset-1 ${activeTab === tab.id ? activeTabButtonStyle : inactiveTabButtonStyle}`}
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

      {/* --- Content Area --- */}
      {/* REMOVED flex-1, min-h-0, overflow-y-auto */}
      {/* Added theme background/padding */}
      <div className="mt-4 rounded-lg bg-customOffWhite/80 p-4 shadow-inner backdrop-blur-sm sm:p-6">
        {renderActiveComponent()}
      </div>
    </div>
  );
}
