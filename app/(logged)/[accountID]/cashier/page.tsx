"use client";

import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import VoucherInput from "@/components/Inputs/VoucherInput";
import SelectedService from "@/components/ui/cashier/SelectedService";
import CustomerInput from "@/components/Inputs/CustomerInput";

import { transactionSubmission } from "@/lib/ServerAction";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";
import { cashierActions, CashierState } from "@/lib/Slices/CashierSlice";
import { fetchServicesForAccount } from "@/lib/Slices/DataSlice";
import { useEffect, useState, useCallback } from "react";

// --- Type Definitions ---
type ServicesProps = {
  id: string;
  title: string;
  price: number;
  branchId: string;
};

type ServiceType = CashierState["serviceType"];
type ServeTime = CashierState["serveTime"];
type PaymentMethod = CashierState["paymentMethod"];

const serviceTypeOptions = [
  { id: "single", title: "Single" },
  { id: "set", title: "Set" },
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
// --- End Type Definitions ---

export default function CashierModal() {
  const { accountID: rawAccountID } = useParams();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  const accountID = Array.isArray(rawAccountID)
    ? rawAccountID[0]
    : rawAccountID;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const { services, servicesLoading, servicesError } = useSelector(
    (state: RootState) => state.data,
  );

  const cashierForm = useSelector((state: RootState) => state.cashier);
  const {
    name,
    email,
    servicesAvailed,
    grandTotal,
    totalDiscount,
    serviceType,
    serveTime,
    paymentMethod,
  } = cashierForm;

  const subTotal = grandTotal + totalDiscount;

  useEffect(() => {
    if (typeof accountID === "string" && accountID) {
      dispatch(fetchServicesForAccount(accountID));
    } else {
      console.warn(
        "CashierInterceptedModal: Account ID is missing or invalid, cannot fetch services.",
      );
      setFormErrors((prev) => ({
        ...prev,
        general: "Cannot load services: Missing required account identifier.",
      }));
    }
  }, [accountID, dispatch]);

  // --- Handle select changes ---
  const handleSelectChanges = useCallback(
    (key: string, value: string) => {
      // Simplified dispatch logic - let the reducer handle type checking if needed
      // This assumes your reducer 'settingServiceTimeOrType' can handle these keys.
      if (
        key === "serviceType" ||
        key === "serveTime" ||
        key === "paymentMethod"
      ) {
        // You might need stricter type assertion here if the reducer expects specific types
        dispatch(
          cashierActions.settingServiceTimeOrType({
            key: key as keyof Pick<
              CashierState,
              "serviceType" | "serveTime" | "paymentMethod"
            >,
            // Ensure the value matches the expected type for the key in the reducer
            value: value as any, // Use 'as any' cautiously or add better type checks
          }),
        );
      } else {
        console.warn(`Unhandled key in handleSelectChanges: "${key}"`);
      }
    },
    [dispatch],
  );

  // --- Handle form submission ---
  async function handleSubmitting() {
    setIsSubmitting(true);
    setFormErrors({});

    // Frontend Checks
    let errors: Record<string, string> = {};
    if (!name?.trim()) {
      errors.name = "Customer name is required.";
    }
    if (!servicesAvailed || servicesAvailed.length === 0) {
      errors.servicesAvailed = "At least one service must be selected.";
    }
    // Add other frontend checks if needed

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      setIsSubmitting(false);
      return;
    }

    // Call Server Action
    const response = await transactionSubmission(cashierForm);
    setIsSubmitting(false);

    if (response.success) {
      dispatch(cashierActions.reset());
      router.back();
    } else if (response.errors) {
      setFormErrors(response.errors);
    } else {
      setFormErrors({
        general: "An unknown error occurred during submission.",
      });
    }
  }

  // --- Handle cancel ---
  const handleCancel = () => {
    dispatch(cashierActions.reset());
    router.back();
  };

  return (
    <DialogBackground>
      <DialogForm>
        <h1 className="text-center text-2xl font-bold uppercase tracking-widest">
          Beautyfeel Transaction
        </h1>

        {/* Customer Name Input */}
        <CustomerInput error={formErrors.name} />
        {formErrors.name && !formErrors.general && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.name}
          </p>
        )}

        {/* Email Input (Optional) */}
        <div className="relative mt-8 flex w-full justify-center">
          <input
            value={email ?? ""}
            onChange={(e) => dispatch(cashierActions.setEmail(e.target.value))}
            placeholder=" "
            className={`peer h-[50px] w-[90%] rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-customDarkPink"} px-2 shadow-custom outline-none`}
            id="email-input"
          />
          <label
            htmlFor="email-input"
            className={`absolute left-10 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:text-sm peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:text-sm peer-[&:not(:placeholder-shown)]:tracking-widest ${formErrors.email ? "text-red-600" : "text-gray-600"} peer-focus:text-customDarkPink`}
          >
            E-mail (Optional)
          </label>
        </div>
        {formErrors.email && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.email}
          </p>
        )}

        {/* Service Time/Type Selectors */}
        <div className="mx-auto mt-8 flex w-[90%] justify-between gap-4">
          {/* --- Added onChange prop --- */}
          <SelectInputGroup
            label="Service Type"
            name="serviceType"
            onChange={handleSelectChanges} // <-- FIX: Pass the handler
            id="serviceType"
            options={serviceTypeOptions}
            valueKey="id"
            labelKey="title"
            value={serviceType}
            error={formErrors.serviceType}
            required
          />
          {/* --- Added onChange prop --- */}
          <SelectInputGroup
            label="Serve Time"
            name="serveTime"
            id="serveTime"
            onChange={handleSelectChanges} // <-- FIX: Pass the handler
            options={serveTimeOptions}
            valueKey="id"
            labelKey="title"
            value={serveTime}
            error={formErrors.serveTime}
            required
          />
        </div>
        {/* Conditionally display error paragraph for serveTime */}
        {formErrors.serveTime && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.serveTime}
          </p>
        )}
        {serveTime === "later" && (
          <DateTimePicker error={formErrors.serveTime} /> // Pass potential error down
        )}

        {/* Display general service loading error */}
        {servicesError && !formErrors.general && (
          <p className="mx-auto mt-4 w-[90%] text-center text-sm font-medium text-red-600">
            Error loading services list: {servicesError}
          </p>
        )}

        {/* Services Select */}
        <ServicesSelect
          isLoading={servicesLoading}
          data={services}
          error={
            formErrors.servicesAvailed ||
            (servicesError ? "Failed to load services data." : undefined)
          }
        />
        {formErrors.servicesAvailed && !servicesError && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.servicesAvailed}
          </p>
        )}

        {/* Voucher and Payment Method */}
        <div className="mx-auto mt-8 flex w-[90%] justify-between gap-4">
          <div className="flex h-full w-[50%]">
            <VoucherInput />
          </div>
          <div className="w-[50%]">
            {/* --- Added onChange prop --- */}
            <SelectInputGroup
              label="Payment Method"
              name="paymentMethod"
              id="paymentMethod"
              onChange={handleSelectChanges} // <-- FIX: Pass the handler
              options={paymentMethodOptions}
              valueKey="id"
              labelKey="title"
              value={paymentMethod}
              error={formErrors.paymentMethod}
            />
          </div>
        </div>
        {/* Conditionally display error paragraphs */}
        {formErrors.paymentMethod && (
          <p className="mx-auto mt-1 w-[90%] text-right text-sm text-red-500">
            {formErrors.paymentMethod}
          </p>
        )}
        {formErrors.voucherCode && (
          <p className="mx-auto mt-1 w-[90%] text-left text-sm text-red-500">
            {formErrors.voucherCode}
          </p>
        )}

        {/* Selected Services Display */}
        <div
          className={`relative mx-auto mt-8 max-h-[200px] min-h-[100px] w-[90%] overflow-y-auto rounded-md border-2 ${formErrors.servicesAvailed ? "border-red-500" : "border-customDarkPink"} bg-white p-2 shadow-custom lg:min-h-[100px]`}
        >
          {servicesAvailed.length !== 0 ? (
            servicesAvailed.map((availed) => (
              <SelectedService
                key={availed.id}
                id={availed.id}
                name={availed.name}
                quantity={availed.quantity}
                price={availed.price}
              />
            ))
          ) : (
            <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap font-medium uppercase tracking-widest text-gray-500">
              No Selected Services Yet
            </p>
          )}
        </div>

        {/* Totals Display */}
        <div className="mx-auto mt-8 flex w-[90%] flex-col text-sm">
          <div className="flex justify-between">
            <p>Total Discount: ₱ {totalDiscount.toLocaleString()}</p>
            <p>Subtotal: ₱ {subTotal.toLocaleString()}</p>
          </div>
          <p className="mt-1 text-base font-semibold">
            Grand Total: ₱ {grandTotal.toLocaleString()}
          </p>
        </div>

        {/* General Form Error Display */}
        {formErrors.general && (
          <p className="mx-auto mt-2 w-[90%] text-center text-sm font-medium text-red-600">
            {formErrors.general}
          </p>
        )}

        {/* Action Buttons */}
        <div className="mx-auto mt-8 flex w-[90%] justify-around">
          <button
            disabled={isSubmitting}
            onClick={handleCancel}
            type="button"
            className="min-w-[100px] rounded-md border-2 border-customDarkPink px-4 py-2 text-customDarkPink transition-all duration-150 hover:bg-customDarkPink hover:text-customOffWhite disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmitting}
            type="button"
            disabled={
              isSubmitting ||
              servicesAvailed.length === 0 ||
              !name ||
              !name.trim()
            }
            className="min-w-[100px] rounded-md border-2 border-customDarkPink bg-customDarkPink px-4 py-2 font-medium text-white transition-all duration-150 hover:bg-transparent hover:text-customDarkPink disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400 disabled:text-gray-200 disabled:hover:bg-gray-400 disabled:hover:text-gray-200"
          >
            {isSubmitting ? "Submitting..." : "Confirm"}
          </button>
        </div>
      </DialogForm>
    </DialogBackground>
  );
}
