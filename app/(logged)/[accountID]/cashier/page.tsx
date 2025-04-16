"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";

import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import SelectedItem from "@/components/ui/cashier/SelectedItem";
import CustomerInput from "@/components/Inputs/CustomerInput";
import Button from "@/components/Buttons/Button";
import VoucherInput from "@/components/Inputs/VoucherInput";
import { PaymentMethod } from "@prisma/client";
import { transactionSubmission } from "@/lib/ServerAction";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { fetchServices, fetchServiceSets } from "@/lib/Slices/DataSlice";
import { CashierState } from "@/lib/Slices/CashierSlice";

import { FetchedItem } from "@/lib/Types";
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

export default function CashierInterceptedModal() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

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

  useEffect(() => {
    console.log("Dispatching fetchServices and fetchServiceSets");
    dispatch(fetchServices());
    dispatch(fetchServiceSets());
  }, [dispatch]);

  const handleSelectChanges = useCallback(
    (key: string, value: string) => {
      function isValidServiceType(v: string): v is CashierState["serviceType"] {
        return v === "single" || v === "set";
      }
      function isValidServeTime(v: string): v is CashierState["serveTime"] {
        return v === "now" || v === "later";
      }
      const isPM = (v: string): v is PaymentMethod =>
        v === PaymentMethod.cash ||
        v === PaymentMethod.ewallet ||
        v === PaymentMethod.bank;

      if (key === "serviceType" && isValidServiceType(value)) {
        dispatch(cashierActions.setServiceType(value));
      } else if (key === "serveTime" && isValidServeTime(value)) {
        dispatch(cashierActions.setServeTime(value));
      } else if (key === "paymentMethod" && isPM(value)) {
        dispatch(cashierActions.setPaymentMethod(value));
      } else {
        console.warn(`Unhandled select change: "${key}":"${value}"`);
      }
    },
    [dispatch],
  );

  async function handleConfirmClick() {
    setIsSubmitting(true);
    setFormErrors({});

    let errors: Record<string, string> = {};
    if (!name?.trim()) errors.name = "Customer name is required.";
    if (!servicesAvailed || servicesAvailed.length === 0)
      errors.servicesAvailed = "At least one service/set must be selected.";
    if (!paymentMethod) errors.paymentMethod = "Payment method required.";
    if (serveTime === "later") {
      const { date, time } = cashierForm;
      if (!date || !time)
        errors.serveTime = "Date and Time required for 'Later'.";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setIsSubmitting(false);
      return;
    }

    const finalTransactionData = { ...cashierForm };
    const response = await transactionSubmission(finalTransactionData);
    setIsSubmitting(false);

    if (response.success) {
      dispatch(cashierActions.reset());
      router.back();
    } else if (response.errors) {
      const clientErrors: Record<string, string> = {};
      for (const key in response.errors) {
        clientErrors[key] = Array.isArray(response.errors[key])
          ? response.errors[key].join("; ")
          : (response.errors[key] as string);
      }
      setFormErrors(clientErrors);
    } else {
      setFormErrors({ general: "An unknown error occurred." });
    }
  }

  const handleCancel = () => {
    dispatch(cashierActions.reset());
    router.back();
  };

  const itemsToDisplay = useMemo((): FetchedItem[] => {
    console.log(`Filtering based on serviceType: ${serviceType}`);
    if (serviceType === "single") {
      return (
        services?.map((s) => ({
          id: s.id,
          title: s.title,
          price: s.price,
          type: "service" as "service" | "set",
        })) ?? []
      );
    } else if (serviceType === "set") {
      return (
        serviceSets?.map((set) => ({
          id: set.id,
          title: set.title,
          price: set.price,
          type: "set" as "service" | "set",
        })) ?? []
      );
    }
    return [];
  }, [services, serviceSets, serviceType]);

  const inputErrorClass = "mt-1 text-xs text-red-500";
  const generalErrorClass =
    "mx-auto my-2 w-[90%] rounded border border-red-300 bg-red-100 p-2 text-center text-sm font-medium text-red-600";
  const selectedItemsContainerClass =
    "relative mx-auto mt-8 max-h-[200px] min-h-[100px] w-[90%] overflow-y-auto rounded-md border-2 border-customDarkPink bg-white p-2 shadow-custom lg:min-h-[100px]";
  const noItemsMessageClass =
    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap font-medium uppercase tracking-widest text-gray-500";
  const totalsContainerClass = "mx-auto mt-8 flex w-[90%] flex-col text-sm";
  const grandTotalClass = "mt-1 text-base font-semibold";
  const actionButtonsClass = "mx-auto mt-8 flex w-[90%] justify-around";

  return (
    <DialogBackground>
      <DialogForm onClose={handleCancel}>
        <h1 className="text-center text-2xl font-bold uppercase tracking-widest text-customBlack">
          Beautyfeel Transaction
        </h1>

        {formErrors.general && (
          <p className={generalErrorClass}>{formErrors.general}</p>
        )}

        <CustomerInput error={formErrors.name} />
        {formErrors.name && !formErrors.general && (
          <p className={`${inputErrorClass} mx-auto w-[90%]`}>
            {formErrors.name}
          </p>
        )}

        {/* Email Input */}
        <div className="relative mt-8 flex w-full justify-center">
          <input
            value={email ?? ""}
            onChange={(e) => dispatch(cashierActions.setEmail(e.target.value))}
            placeholder=" "
            type="email"
            className={`peer h-[50px] w-[90%] rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-customDarkPink"} px-2 shadow-custom outline-none`}
            id="email-input"
          />
          <label
            htmlFor="email-input"
            className={`absolute left-10 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:text-sm peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:text-sm peer-[&:not(:placeholder-shown)]:tracking-widest ${formErrors.email ? "text-red-600" : "text-gray-600"} peer-focus:text-customDarkPink`}
          >
            {" "}
            E-mail (Optional){" "}
          </label>
        </div>
        {formErrors.email && (
          <p className={`${inputErrorClass} mx-auto w-[90%]`}>
            {formErrors.email}
          </p>
        )}

        {/* Service Type & Time Selectors */}
        <div className="mx-auto mt-8 flex w-[90%] justify-between gap-4">
          <div className="w-full md:w-1/2">
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
          </div>
          <div className="w-full md:w-1/2">
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
        </div>
        {formErrors.serveTime && !formErrors.general && (
          <p className={`${inputErrorClass} mx-auto w-[90%]`}>
            {formErrors.serveTime}
          </p>
        )}
        {serveTime === "later" && (
          <DateTimePicker
            error={formErrors.serveTime || formErrors.date || formErrors.time}
          />
        )}

        {/* Services/Sets Select - Pass FILTERED data */}
        <ServicesSelect
          isLoading={itemsLoading} // Use the correct loading state from DataSlice
          data={itemsToDisplay} // Pass the correctly filtered and mapped items
          // Ensure error prop type accepts string | null | undefined
          error={formErrors.servicesAvailed || itemsError || undefined}
        />
        {formErrors.servicesAvailed && !itemsError && (
          <p className={`${inputErrorClass} mx-auto w-[90%]`}>
            {formErrors.servicesAvailed}
          </p>
        )}

        {/* Voucher and Payment Method */}
        <div className="mx-auto mt-8 flex w-[90%] flex-col gap-4 md:flex-row">
          <div className="flex-1">
            <VoucherInput /> {/* Keep if using simple vouchers */}
          </div>
          <div className="w-full md:w-[40%]">
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
              required // Always required now
            />
            {formErrors.paymentMethod && (
              <p className={inputErrorClass}>{formErrors.paymentMethod}</p>
            )}
          </div>
        </div>
        {/* Display voucher error if needed */}
        {formErrors.voucherCode && (
          <p className={`${inputErrorClass} mx-auto w-[90%] text-left`}>
            {formErrors.voucherCode}
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
                type={item.type} // Type should be present now from slice state
              />
            ))
          ) : (
            <p className={noItemsMessageClass}>No Selected Items Yet</p>
          )}
        </div>

        {/* Totals Display */}
        <div className={totalsContainerClass}>
          <div className="flex justify-between">
            <p>Subtotal: ₱ {subTotal.toLocaleString()}</p>
            {/* Only show discount if it's greater than 0 */}
            {totalDiscount > 0 && (
              <p>Total Discount: ₱ {totalDiscount.toLocaleString()}</p>
            )}
          </div>
          <p className={`${grandTotalClass} text-right`}>
            {" "}
            {/* Align right */}
            Grand Total: ₱ {grandTotal.toLocaleString()}
          </p>
        </div>

        {/* Action Buttons */}
        <div className={actionButtonsClass}>
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
      </DialogForm>
    </DialogBackground>
  );
}
