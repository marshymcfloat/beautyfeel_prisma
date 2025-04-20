// src/app/(logged)/[accountID]/cashier/page.tsx (Example Path)
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";

// --- Component Imports ---
// Removed Modal imports
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import SelectedItem from "@/components/ui/cashier/SelectedItem";
import CustomerInput from "@/components/Inputs/CustomerInput";
import Button from "@/components/Buttons/Button";
import VoucherInput from "@/components/Inputs/VoucherInput";
import { AlertCircle, ChevronLeft, Receipt } from "lucide-react"; // Added icons for header
// --- Actions and State ---
import {
  transactionSubmission,
  getActiveDiscountRules,
} from "@/lib/ServerAction"; // Adjust path if needed
import { RootState, AppDispatch } from "@/lib/reduxStore"; // Adjust path if needed
import { cashierActions, CashierState } from "@/lib/Slices/CashierSlice"; // Adjust path if needed
import { fetchServices, fetchServiceSets } from "@/lib/Slices/DataSlice"; // Adjust path if needed

import { PaymentMethod } from "@prisma/client"; // Assuming Prisma types are correctly set up
// --- Types ---
import {
  FetchedItem,
  UIDiscountRuleWithServices,
  TransactionSubmissionResponse,
} from "@/lib/Types"; // Adjust path if needed

// --- Options (Keep these) ---
const serviceTypeOptions = [
  { id: "single", title: "Single Service" },
  { id: "set", title: "Service Set" },
];
const serveTimeOptions = [
  { id: "now", title: "Now" },
  { id: "later", title: "Later" },
];
const paymentMethodOptions = [
  { id: PaymentMethod.cash, title: "Cash" },
  { id: PaymentMethod.ewallet, title: "E-wallet" },
  { id: PaymentMethod.bank, title: "Bank" },
];

// Renamed component for standard page
export default function CashierPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { accountID: accountIdParam } = useParams(); // Get accountId for navigation
  const accountId = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam;

  // --- State (Keep these) ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // --- Redux State (Keep these) ---
  const { services, serviceSets, itemsLoading, itemsError } = useSelector(
    (state: RootState) => state.data,
  );
  const cashierForm = useSelector((state: RootState) => state.cashier);
  const {
    name,
    email,
    servicesAvailed,
    grandTotal,
    totalDiscount,
    subTotal,
    serviceType,
    serveTime,
    paymentMethod,
  } = cashierForm;

  // --- Effects (Keep these, dispatch actions on mount) ---
  useEffect(() => {
    // Fetch initial data needed for the cashier form
    dispatch(fetchServices());
    dispatch(fetchServiceSets());
    getActiveDiscountRules()
      .then((rules) => {
        // Ensure rules is correctly typed before dispatching
        if (Array.isArray(rules)) {
          dispatch(
            cashierActions.applyDiscounts({
              rules: rules as UIDiscountRuleWithServices[], // Cast if confident in type
            }),
          );
        } else {
          throw new Error("Invalid discount rules format received.");
        }
      })
      .catch((err) => {
        console.error("Failed to fetch discount rules:", err);
        setFormErrors((prev) => ({
          ...prev,
          general: "Failed to load discount rules. Please try refreshing.",
        }));
      });

    // Optionally reset cashier state when page mounts if desired
    // dispatch(cashierActions.reset());

    // Cleanup: Consider if any state needs resetting on unmount
    // return () => { dispatch(cashierActions.reset()); }
  }, [dispatch]);

  // --- Callbacks (Keep these) ---
  const handleSelectChanges = useCallback(
    (key: string, value: string) => {
      // Type predicates remain the same
      const isST = (v: string): v is CashierState["serviceType"] =>
        v === "single" || v === "set";
      const isServeT = (v: string): v is CashierState["serveTime"] =>
        v === "now" || v === "later";
      const isPM = (v: string): v is PaymentMethod =>
        Object.values(PaymentMethod).includes(v as PaymentMethod);

      if (key === "serviceType" && isST(value)) {
        dispatch(cashierActions.setServiceType(value));
      } else if (key === "serveTime" && isServeT(value)) {
        dispatch(cashierActions.setServeTime(value));
      } else if (key === "paymentMethod" && isPM(value)) {
        dispatch(cashierActions.setPaymentMethod(value));
      } else {
        console.warn(
          `Unhandled select change: "${key}" with value: "${value}"`,
        );
      }
    },
    [dispatch],
  );

  // --- Form Submission Handler (Adjust navigation on success) ---
  async function handleConfirmClick() {
    setIsSubmitting(true);
    setFormErrors({}); // Clear previous errors
    let errors: Record<string, string> = {};

    // --- Validation Logic (Keep this) ---
    if (!name?.trim()) errors.name = "Customer name is required.";
    if (!servicesAvailed || servicesAvailed.length === 0)
      errors.servicesAvailed = "At least one service must be selected.";
    if (!paymentMethod) errors.paymentMethod = "Payment method is required.";
    if (serveTime === "later" && (!cashierForm.date || !cashierForm.time))
      errors.serveTime = "Booking Date and Time are required for 'Later'.";
    // Add any other necessary validations (e.g., email format if entered)

    // If errors exist, update state and stop submission
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setIsSubmitting(false);
      return;
    }

    // --- Call Server Action (Keep this) ---
    try {
      const response: TransactionSubmissionResponse =
        await transactionSubmission({ ...cashierForm }); // Pass current form state

      setIsSubmitting(false); // Re-enable button after response

      if (response.success) {
        console.log("Transaction successful:", response.transactionId);
        // toast.success("Transaction submitted successfully!"); // Optional success feedback
        dispatch(cashierActions.reset()); // Reset form state in Redux
        // Navigate to a success page or dashboard instead of router.back()
        router.push(`/${accountId}/transactions`); // Example: Navigate to transactions list
      } else {
        // Handle submission failure
        if (response.errors) {
          // Map server-side validation errors to formErrors state
          const clientErrors: Record<string, string> = {};
          for (const key in response.errors) {
            clientErrors[key] = Array.isArray(response.errors[key])
              ? response.errors[key].join("; ") // Join array errors
              : String(response.errors[key]);
          }
          setFormErrors(clientErrors);
        } else {
          // General error message
          setFormErrors({
            general:
              response.message ?? "An unknown submission error occurred.",
          });
        }
        console.error("Submission failed:", response.message, response.errors);
        // toast.error(response.message || "Submission failed."); // Optional error feedback
      }
    } catch (error: any) {
      // Catch unexpected errors during the server action call
      console.error("Unexpected error during submission:", error);
      setFormErrors({
        general: `An unexpected error occurred: ${error.message || "Unknown error"}`,
      });
      setIsSubmitting(false);
    }
  }

  // --- Cancel Handler (Adjust navigation) ---
  const handleCancel = () => {
    dispatch(cashierActions.reset()); // Reset Redux state
    // Navigate back to the main dashboard/account page
    router.push(`/${accountId}`);
  };

  // --- Memoized Data for Select (Keep this) ---
  const itemsToDisplay = useMemo((): FetchedItem[] => {
    if (serviceType === "single")
      return (
        services?.map((s) => ({
          id: s.id,
          title: s.title,
          price: s.price,
          type: "service" as const,
        })) ?? []
      );
    if (serviceType === "set")
      return (
        serviceSets?.map((set) => ({
          id: set.id,
          title: set.title,
          price: set.price,
          type: "set" as const,
        })) ?? []
      );
    return [];
  }, [services, serviceSets, serviceType]);

  // --- Standard Classes (Keep these, adjust container classes if needed) ---
  const inputErrorClass = "mt-1 text-xs text-red-500 px-1"; // Added padding for alignment
  const generalErrorClass =
    "my-2 w-full rounded border border-red-300 bg-red-100 p-2 text-center text-sm font-medium text-red-600";
  const selectedItemsContainerClass =
    "relative mt-4 max-h-[200px] min-h-[80px] w-full overflow-y-auto rounded-md border border-gray-300 bg-white p-2 shadow-sm"; // Adjusted border
  const noItemsMessageClass =
    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap text-sm italic text-gray-400";
  const totalsContainerClass = "mt-4 flex w-full flex-col text-sm";
  const grandTotalClass = "mt-1 text-base font-semibold";
  const actionButtonsContainerClass = // Renamed for clarity
    "mt-6 flex w-full flex-shrink-0 justify-around border-t border-gray-200 bg-white p-4"; // Added background and padding

  // --- Final Render - Standard Page ---
  return (
    // Main Page Container
    <div className="flex h-full flex-col bg-gray-50">
      {/* Page Header */}
      <div className="flex flex-shrink-0 items-center border-b border-gray-200 bg-white p-4 shadow-sm">
        <button
          onClick={handleCancel} // Use cancel handler for back button too
          className="mr-4 rounded-full p-1.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-customDarkPink"
          aria-label="Cancel and Go Back"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex items-center text-lg font-semibold text-gray-800">
          <Receipt size={18} className="mr-2 text-customDarkPink" />
          New Transaction
        </h1>
      </div>

      {/* Scrollable Form Content Area */}
      <div className="flex-grow space-y-5 overflow-y-auto p-4 sm:p-6">
        {/* General Error Display */}
        {formErrors.general && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-100 p-2 text-sm font-medium text-red-600">
            <AlertCircle size={16} />
            <span>{formErrors.general}</span>
          </div>
        )}

        {/* Customer Name Input */}
        <div className="w-full">
          <CustomerInput error={formErrors.name} />
        </div>

        {/* Email Input */}
        <div className="w-full">
          <div className="relative w-full">
            <input
              value={email ?? ""}
              onChange={(e) =>
                dispatch(cashierActions.setEmail(e.target.value))
              }
              placeholder=" " // Important for floating label
              type="email"
              id="email-input"
              className={`peer relative z-0 h-[50px] w-full rounded-md border-2 bg-white ${
                // Added bg-white
                formErrors.email ? "border-red-500" : "border-gray-300" // Default gray border
              } px-3 pt-1 shadow-sm outline-none transition-colors duration-150 focus:border-customDarkPink`}
            />
            {/* Floating Label */}
            <label
              htmlFor="email-input"
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform bg-white px-1 text-base font-medium transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${
                formErrors.email ? "text-red-600" : "text-gray-500"
              } peer-focus:${formErrors.email ? "text-red-600" : "text-customDarkPink"}`}
            >
              E-mail (Optional)
            </label>
          </div>
          {formErrors.email && (
            <p className={inputErrorClass}>{formErrors.email}</p>
          )}
        </div>

        {/* Service Type & Serve Time Selects */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectInputGroup
            label="Service Type"
            name="serviceType"
            id="serviceType"
            onChange={handleSelectChanges}
            options={serviceTypeOptions}
            valueKey="id"
            labelKey="title"
            value={serviceType}
            required
          />
          <SelectInputGroup
            label="Serve Time"
            name="serveTime"
            id="serveTime"
            onChange={handleSelectChanges}
            options={serveTimeOptions}
            valueKey="id"
            labelKey="title"
            value={serveTime}
            error={
              formErrors.serveTime && serveTime === "later"
                ? formErrors.serveTime
                : undefined
            } // Only show error if 'later' selected
            required
          />
        </div>

        {/* Conditional DateTimePicker */}
        {serveTime === "later" && (
          <DateTimePicker
            error={formErrors.serveTime || formErrors.date || formErrors.time}
          />
        )}
        {/* Error specifically for serveTime validation when 'later' */}
        {formErrors.serveTime && serveTime === "later" && (
          <p className={inputErrorClass}>{formErrors.serveTime}</p>
        )}

        {/* Services/Sets Select */}
        <div className="w-full">
          <ServicesSelect
            isLoading={itemsLoading}
            data={itemsToDisplay}
            error={formErrors.servicesAvailed || itemsError || undefined}
          />
          {formErrors.servicesAvailed && (
            <p className={inputErrorClass}>{formErrors.servicesAvailed}</p>
          )}
        </div>

        {/* Voucher & Payment Method */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <VoucherInput /> {/* Pass potential error */}
          <SelectInputGroup
            label="Payment Method"
            name="paymentMethod"
            id="paymentMethod"
            onChange={handleSelectChanges}
            options={paymentMethodOptions}
            valueKey="id" // Use Prisma enum value
            labelKey="title"
            value={paymentMethod}
            error={formErrors.paymentMethod}
            required
          />
        </div>
        {/* Display errors below the grid if needed */}
        {formErrors.voucherCode && (
          <p className={inputErrorClass}>{formErrors.voucherCode}</p>
        )}
        {formErrors.paymentMethod && (
          <p className={inputErrorClass}>{formErrors.paymentMethod}</p>
        )}

        {/* Selected Items Display */}
        <div className={selectedItemsContainerClass}>
          {servicesAvailed.length !== 0 ? (
            servicesAvailed.map((item) => (
              <SelectedItem
                key={item.id}
                id={item.id}
                name={item.name}
                quantity={item.quantity}
                originalPrice={item.originalPrice}
                discountApplied={item.discountApplied}
                type={item.type}
              />
            ))
          ) : (
            <p className={noItemsMessageClass}>No Selected Items Yet</p>
          )}
        </div>

        <div className={totalsContainerClass}>
          <div className="flex justify-between text-customBlack/80">
            <p>
              Subtotal: ₱{" "}
              {subTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
            {totalDiscount > 0 && (
              <p>
                Discount: - ₱{" "}
                {totalDiscount.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </p>
            )}
          </div>
          <p
            className={`${grandTotalClass} text-right font-bold text-customDarkPink`}
          >
            Grand Total: ₱{" "}
            {grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Action Buttons (Footer) */}
      <div className={actionButtonsContainerClass}>
        <Button
          onClick={handleCancel}
          disabled={isSubmitting}
          type="button"
          invert // Use inverted style for cancel
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirmClick}
          type="button" // Prevent default form submission if inside a <form>
          disabled={
            isSubmitting ||
            itemsLoading || // Disable if data is still loading
            servicesAvailed.length === 0 || // Disable if no services selected
            !name?.trim() || // Disable if name is empty
            !paymentMethod // Disable if no payment method selected
          }
        >
          {isSubmitting ? "Submitting..." : "Confirm Transaction"}
        </Button>
      </div>
    </div> // End Main Page Container
  );
}
