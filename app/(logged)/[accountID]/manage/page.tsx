// src/app/(app)/customize/page.tsx
"use client";

import React, { useState } from "react";

// Adjust import paths if needed

import ManageServices from "@/components/ui/customize/ManageServices";
import ManageAccounts from "@/components/ui/customize/ManageAccounts";
import ManageVouchers from "@/components/ui/customize/ManageVouchers";
import ManageBranches from "@/components/ui/customize/ManageBranches";
import ManageServiceSets from "@/components/ui/customize/ManageServiceSets";
import ManageDiscounts from "@/components/ui/customize/ManageDiscounts";
import ManageGiftCertificates from "@/components/ui/customize/ManageGiftCertificates";

type ActiveTab =
  | "services"
  | "accounts"
  | "vouchers"
  | "branches"
  | "serviceSets"
  | "discounts"
  | "giftCertificate";

export default function CustomizePage() {
  // Default to services or maybe serviceSets if you prefer
  const [activeTab, setActiveTab] = useState<ActiveTab>("services");

  const renderActiveComponent = () => {
    switch (activeTab) {
      case "services":
        return <ManageServices />;
      case "accounts":
        return <ManageAccounts />;
      case "vouchers":
        return <ManageVouchers />;
      case "branches":
        return <ManageBranches />;
      case "serviceSets":
        return <ManageServiceSets />;
      case "discounts":
        return <ManageDiscounts />;
      case "giftCertificate":
        return <ManageGiftCertificates />;
      default:
        return <ManageServices />;
    }
  };

  const getTabClassName = (tabName: ActiveTab) => {
    return `px-4 py-2 rounded-t-lg cursor-pointer transition-colors duration-200 ${
      activeTab === tabName
        ? "bg-white bg-opacity-80 text-pink-700 font-semibold shadow-sm"
        : "bg-white bg-opacity-30 text-gray-700 hover:bg-opacity-50"
    }`;
  };

  return (
    // Assuming this main layout structure is correct for your app
    <main className="flex h-screen w-screen items-end">
      <div className="ml-auto h-[98vh] w-[80%] overflow-y-auto rounded-tl-3xl bg-customLightBlue bg-opacity-30 p-6 shadow-PageShadow lg:p-8">
        {/* Tab Navigation */}
        <div className="mb-4 flex space-x-1 border-b border-gray-300 border-opacity-50">
          <button
            onClick={() => setActiveTab("services")}
            className={getTabClassName("services")}
          >
            Services
          </button>
          <button
            onClick={() => setActiveTab("serviceSets")}
            className={getTabClassName("serviceSets")}
          >
            Service Sets
          </button>{" "}
          {/* Add Service Sets Tab */}
          <button
            onClick={() => setActiveTab("accounts")}
            className={getTabClassName("accounts")}
          >
            Accounts
          </button>
          <button
            onClick={() => setActiveTab("vouchers")}
            className={getTabClassName("vouchers")}
          >
            Vouchers
          </button>
          <button
            onClick={() => setActiveTab("giftCertificate")}
            className={getTabClassName("giftCertificate")}
          >
            Gift Certificates
          </button>
          <button
            onClick={() => setActiveTab("discounts")}
            className={getTabClassName("discounts")}
          >
            Discounts
          </button>
          <button
            onClick={() => setActiveTab("branches")}
            className={getTabClassName("branches")}
          >
            Branches
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-grow overflow-y-auto rounded bg-white bg-opacity-20 p-4 shadow-inner">
          {renderActiveComponent()}
        </div>
      </div>
    </main>
  );
}
