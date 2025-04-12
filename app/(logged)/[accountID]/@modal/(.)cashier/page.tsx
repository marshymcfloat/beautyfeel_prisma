// src/components/cashier/CashierInterceptedModal.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";

// --- Component Imports ---
import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import SelectedItem from "@/components/ui/cashier/SelectedItem";
import CustomerInput from "@/components/Inputs/CustomerInput";
import Button from "@/components/Buttons/Button";
import VoucherInput from "@/components/Inputs/VoucherInput";

// --- Actions and State ---
import {
  transactionSubmission,
  getActiveDiscountRules,
} from "@/lib/ServerAction";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { cashierActions, CashierState } from "@/lib/Slices/CashierSlice";
import { fetchServices, fetchServiceSets } from "@/lib/Slices/DataSlice";

// --- Types ---
import {
  FetchedItem,
  UIDiscountRuleWithServices,
  TransactionSubmissionResponse,
} from "@/lib/Types";

// --- Options ---
const serviceTypeOptions = [
  { id: "single", title: "Single Service" },
  { id: "set", title: "Service Set" },
];
const serveTimeOptions = [
  { id: "now", title: "Now" },
  { id: "later", title: "Later" },
];
const paymentMethodOptions = [
  { id: "cash", title: "Cash" },
  { id: "ewallet", title: "E-wallet" },
  { id: "bank", title: "Bank" },
];
// --- End Options ---

export default function CashierInterceptedModal() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // --- State ---
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // --- Redux State ---
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

  // --- Effects ---
  useEffect(() => {
    dispatch(fetchServices());
    dispatch(fetchServiceSets());
    getActiveDiscountRules()
      .then((rules) => {
        dispatch(
          cashierActions.applyDiscounts({
            rules: rules as UIDiscountRuleWithServices[],
          }),
        );
      })
      .catch((err) => {
        console.error("Failed fetch discounts:", err);
        setFormErrors((prev) => ({
          ...prev,
          general: "Failed load discounts.",
        }));
      });
  }, [dispatch]);

  // --- Callbacks ---
  const handleSelectChanges = useCallback(
    (key: string, value: string) => {
      const isST = (v: string): v is CashierState["serviceType"] =>
        v === "single" || v === "set";
      const isServeT = (v: string): v is CashierState["serveTime"] =>
        v === "now" || v === "later";
      const isPM = (v: string): v is CashierState["paymentMethod"] =>
        v === "cash" || v === "ewallet" || v === "bank";
      if (key === "serviceType" && isST(value))
        dispatch(cashierActions.setServiceType(value));
      else if (key === "serveTime" && isServeT(value))
        dispatch(cashierActions.setServeTime(value));
      else if (key === "paymentMethod" && isPM(value))
        dispatch(cashierActions.setPaymentMethod(value));
      else console.warn(`Unhandled select: "${key}"`);
    },
    [dispatch],
  );

  async function handleConfirmClick() {
    setIsSubmitting(true);
    setFormErrors({});
    // Validation
    let errors: Record<string, string> = {};
    if (!name?.trim()) errors.name = "Customer name required.";
    if (!servicesAvailed || servicesAvailed.length === 0)
      errors.servicesAvailed = "Select service(s).";
    if (!paymentMethod) errors.paymentMethod = "Payment method required.";
    if (serveTime === "later" && (!cashierForm.date || !cashierForm.time))
      errors.serveTime = "Date/Time required.";
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setIsSubmitting(false);
      return;
    }
    // Action Call
    const response: TransactionSubmissionResponse = await transactionSubmission(
      { ...cashierForm },
    );
    setIsSubmitting(false);
    // Handle Response
    if (response.success) {
      dispatch(cashierActions.reset());
      router.back();
    } else {
      if (response.errors) {
        const clientErrors: Record<string, string> = {};
        for (const key in response.errors) {
          clientErrors[key] = Array.isArray(response.errors[key])
            ? response.errors[key].join("; ")
            : String(response.errors[key]);
        }
        setFormErrors(clientErrors);
      } else {
        setFormErrors({ general: response.message });
      }
      console.error("Submit failed:", response.message, response.errors);
    }
  }

  const handleCancel = () => {
    dispatch(cashierActions.reset());
    router.back();
  };

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

  // --- Standard Classes ---
  const inputErrorClass = "mt-1 text-xs text-red-500";
  const generalErrorClass =
    "my-2 w-full rounded border border-red-300 bg-red-100 p-2 text-center text-sm font-medium text-red-600"; // Use w-full
  const selectedItemsContainerClass =
    "relative mt-4 max-h-[200px] min-h-[80px] w-full overflow-y-auto rounded-md border border-customGray/50 bg-white p-2 shadow-sm"; // Use w-full
  const noItemsMessageClass =
    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap text-sm italic text-gray-400";
  const totalsContainerClass = "mt-4 flex w-full flex-col text-sm"; // Use w-full
  const grandTotalClass = "mt-1 text-base font-semibold";
  const actionButtonsClass =
    "mt-6 flex w-full justify-around border-t border-customGray/30 pt-4";

  return (
    <Modal
      isOpen={true}
      onClose={handleCancel}
      title={<DialogTitle>Beautyfeel Transaction</DialogTitle>}
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-xl overflow-hidden rounded-lg bg-customOffWhite shadow-xl flex flex-col" // Maybe max-w-xl for more space
    >
      <div className="flex-grow space-y-5 overflow-y-auto p-4 sm:p-6">
        {formErrors.general && (
          <p className={generalErrorClass}>{formErrors.general}</p>
        )}
        <div className="w-full">
          <CustomerInput error={formErrors.name} />
        </div>
        <div className="w-full">
          <div className="relative w-full">
            <input
              value={email ?? ""}
              onChange={(e) =>
                dispatch(cashierActions.setEmail(e.target.value))
              }
              placeholder=" "
              type="email"
              id="email-input"
              className={`peer relative z-0 h-[50px] w-full rounded-md border-2 ${
                formErrors.email ? "border-red-500" : "border-customDarkPink" // Default pink border when no error
              } px-3 pt-1 shadow-sm outline-none transition-colors duration-150 focus:border-customDarkPink`} // Removed focus ring, rely on border color
            />
            <label
              htmlFor="email-input"
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 px-1 text-base font-medium transition-all duration-150 ${formErrors.email ? "text-red-600" : "text-gray-500"} peer-focus:top-[-10px] peer-focus:z-10 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-[-10px] peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:bg-customOffWhite peer-[:not(:placeholder-shown)]:text-xs peer-focus:${formErrors.email ? "text-red-600" : "text-customDarkPink"} peer-[:not(:placeholder-shown)]:${formErrors.email ? "text-red-600" : ""} `}
            >
              E-mail (Optional)
            </label>
          </div>
          {formErrors.email && (
            <p className={`${inputErrorClass} px-1`}>{formErrors.email}</p>
          )}
        </div>
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
            error={formErrors.serveTime}
            required
          />
        </div>
        {serveTime === "later" && (
          <DateTimePicker
            error={formErrors.serveTime || formErrors.date || formErrors.time}
          />
        )}
        {formErrors.serveTime && serveTime !== "later" && (
          <p className={`${inputErrorClass} px-1`}>{formErrors.serveTime}</p>
        )}
        {/* Services/Sets Select */}
        <div className="w-full">
          <ServicesSelect
            isLoading={itemsLoading}
            data={itemsToDisplay}
            error={formErrors.servicesAvailed || itemsError || undefined}
          />
          {/* Error shown inside ServicesSelect */}
        </div>
        {/* Voucher and Payment Method - Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <VoucherInput />
          <SelectInputGroup
            label="Payment Method"
            name="paymentMethod"
            id="paymentMethod"
            onChange={handleSelectChanges}
            options={paymentMethodOptions}
            valueKey="id"
            labelKey="title"
            value={paymentMethod}
            error={formErrors.paymentMethod}
            required
          />
        </div>
        {/* Display voucher/payment errors below grid if needed */}
        {formErrors.voucherCode && (
          <p className={`${inputErrorClass} px-1`}>{formErrors.voucherCode}</p>
        )}
        {formErrors.paymentMethod && (
          <p className={`${inputErrorClass} px-1`}>
            {formErrors.paymentMethod}
          </p>
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
        {/* Totals Display */}
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
      </div>{" "}
      {/* End Scrollable Content Area */}
      {/* Action Buttons (Footer) */}
      <div className={`flex-shrink-0 ${actionButtonsClass}`}>
        <Button
          onClick={handleCancel}
          disabled={isSubmitting}
          type="button"
          invert
        >
          {" "}
          Cancel{" "}
        </Button>
        <Button
          onClick={handleConfirmClick}
          type="button"
          disabled={
            isSubmitting ||
            itemsLoading ||
            servicesAvailed.length === 0 ||
            !name?.trim() ||
            !paymentMethod
          }
        >
          {isSubmitting ? "Submitting..." : "Confirm Transaction"}
        </Button>
      </div>
    </Modal>
  );
}
