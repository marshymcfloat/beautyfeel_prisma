"use client";

import DialogBackground from "@/components/Dialog/DialogBackground";
import DialogForm from "@/components/Dialog/DialogForm";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect"; // Keep using this
import VoucherInput from "@/components/Inputs/VoucherInput";
import SelectedService from "@/components/ui/cashier/SelectedService";
import CustomerInput from "@/components/Inputs/CustomerInput";

import { transactionSubmission } from "@/lib/ServerAction"; // Your server action
import { RootState, AppDispatch } from "@/lib/reduxStore"; // Import types from your store config
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";
import { cashierActions, CashierState } from "@/lib/Slices/CashierSlice"; // Your cashier slice
import { fetchServicesForAccount } from "@/lib/Slices/DataSlice"; // <-- Import the async thunk
import { useEffect, useState, useCallback } from "react";

// --- Type Definitions (Keep as they are) ---
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

export default function CashierInterceptedModal() {
  const { accountID: rawAccountID } = useParams();
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>(); // Use the typed dispatch

  // Ensure accountID is a single string, handle potential array/undefined
  const accountID = Array.isArray(rawAccountID)
    ? rawAccountID[0]
    : rawAccountID;

  // Local state for submission status and form validation errors
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // *** REMOVED Local state for services and fetching status ***
  // const [services, setServices] = useState<ServicesProps[] | null>(null);
  // const [servicesIsFetching, setServicesIsFetching] = useState(false);

  // *** SELECT services data and status FROM REDUX STORE ***
  const {
    services, // Now comes from state.data.services
    servicesLoading, // Now comes from state.data.servicesLoading
    servicesError, // Now comes from state.data.servicesError
  } = useSelector((state: RootState) => state.data); // Ensure 'data' matches your slice name in the store

  // Select cashier form state from Redux
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

  // *** UPDATED useEffect to dispatch the thunk ***
  useEffect(() => {
    // Only attempt to fetch if we have a valid accountID string
    if (typeof accountID === "string" && accountID) {
      // Dispatch the thunk. It will check internally if a fetch is needed.
      dispatch(fetchServicesForAccount(accountID));
    } else {
      // Handle the case where accountID is missing or invalid
      console.warn(
        "CashierInterceptedModal: Account ID is missing or invalid, cannot fetch services.",
      );
      // Optionally set a general error or clear services via another dispatch
      setFormErrors((prev) => ({
        ...prev,
        general: "Cannot load services: Missing required account identifier.",
      }));
      // Maybe dispatch(clearServices()); // If you want to ensure old data is gone
    }
  }, [accountID, dispatch]); // Dependencies: fetch should re-evaluate if accountID changes

  // --- Handle select changes (Keep as is, assuming types are correct) ---
  const handleSelectChanges = useCallback(
    (key: string, value: string) => {
      // Type Guard approach (your existing logic)
      if (key === "serviceType" && (value === "single" || value === "set")) {
        dispatch(cashierActions.settingServiceTimeOrType({ key, value }));
      } else if (
        key === "serveTime" &&
        (value === "now" || value === "later")
      ) {
        dispatch(cashierActions.settingServiceTimeOrType({ key, value }));
      } else if (
        key === "paymentMethod" &&
        (value === "cash" || value === "ewallet" || value === "bank")
      ) {
        dispatch(cashierActions.settingServiceTimeOrType({ key, value }));
      } else {
        console.warn(`Invalid value "${value}" for key "${key}"`);
      }
    },
    [dispatch],
  );

  // --- Handle form submission (Keep as is) ---
  async function handleSubmitting() {
    setIsSubmitting(true);
    setFormErrors({});

    // Frontend Checks (Keep as is)
    if (!name?.trim()) {
      setFormErrors((prev) => ({
        ...prev,
        name: "Customer name is required.",
      }));
      setIsSubmitting(false);
      return;
    }
    if (!servicesAvailed || servicesAvailed.length === 0) {
      setFormErrors((prev) => ({
        ...prev,
        servicesAvailed: "At least one service must be selected.",
      }));
      setIsSubmitting(false);
      return;
    }

    // Call Server Action (Keep as is)
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

  // --- Handle cancel (Keep as is) ---
  const handleCancel = () => {
    dispatch(cashierActions.reset());
    router.back();
  };

  // Optional: Log current states for debugging
  // console.log("Current Form State:", cashierForm);
  // console.log("Current Form Errors:", formErrors);
  // console.log("Services (Redux):", { services, servicesLoading, servicesError });

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
            value={email ?? ""} // Use nullish coalescing for controlled input
            onChange={(e) => dispatch(cashierActions.setEmail(e.target.value))}
            placeholder=" " // Keep placeholder for label animation
            className={`peer h-[50px] w-[90%] rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-customDarkPink"} px-2 shadow-custom outline-none`}
            id="email-input" // Add id for label association
          />
          {/* Modified Label */}
          <label
            htmlFor="email-input" // Associate label with input
            className={`absolute left-10 top-1/2 -translate-y-1/2 font-medium transition-all duration-150 peer-focus:top-[-10px] peer-focus:text-sm peer-focus:tracking-widest peer-[&:not(:placeholder-shown)]:top-[-10px] peer-[&:not(:placeholder-shown)]:text-sm peer-[&:not(:placeholder-shown)]:tracking-widest ${formErrors.email ? "text-red-600" : "text-gray-600"} peer-focus:text-customDarkPink`}
          >
            E-mail (Optional) {/* Indicate Optional */}
          </label>
        </div>
        {/* Display Email Error */}
        {formErrors.email && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.email}
          </p>
        )}

        {/* Service Time/Type Selectors */}
        <div className="mx-auto mt-8 flex w-[90%] justify-between gap-4">
          <SelectInputGroup
            label="Service Type"
            name="serviceType"
            onChange={handleSelectChanges}
            id="serviceType"
            options={serviceTypeOptions}
            valueKey="id"
            labelKey="title"
            value={serviceType}
            error={formErrors.serviceType}
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
        {formErrors.serveTime && <p className="...">{formErrors.serveTime}</p>}
        {serveTime === "later" && (
          <DateTimePicker error={formErrors.serveTime} />
        )}

        {/* Display general service loading error BEFORE the select component */}
        {servicesError && !formErrors.general && (
          <p className="mx-auto mt-4 w-[90%] text-center text-sm font-medium text-red-600">
            Error loading services list: {servicesError}
          </p>
        )}

        {/* *** Services Select - Use REDUX state for props *** */}
        <ServicesSelect
          isLoading={servicesLoading} // <-- Use Redux loading state
          data={services} // <-- Use Redux services data
          // Pass down specific validation error OR the general fetch error message
          error={
            formErrors.servicesAvailed ||
            (servicesError ? "Failed to load services data." : undefined)
          }
        />
        {/* Display specific validation error if it exists and isn't the fetch error */}
        {formErrors.servicesAvailed && !servicesError && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.servicesAvailed}
          </p>
        )}

        {/* Voucher and Payment Method */}
        <div className="mx-auto mt-8 flex w-[90%] justify-between gap-4">
          <div className="flex h-full w-[50%]">
            {" "}
            <VoucherInput />{" "}
          </div>
          <div className="w-[50%]">
            {" "}
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
            />{" "}
          </div>
        </div>
        {formErrors.paymentMethod && (
          <p className="...">{formErrors.paymentMethod}</p>
        )}
        {formErrors.voucherCode && (
          <p className="...">{formErrors.voucherCode}</p>
        )}

        {/* Selected Services Display */}
        <div
          className={`relative mx-auto mt-8 max-h-[200px] min-h-[100px] w-[90%] overflow-y-auto rounded-md border-2 ${formErrors.servicesAvailed ? "border-red-500" : "border-customDarkPink"} bg-white p-2 shadow-custom lg:min-h-[100px]`} // Added back some classes for context
        >
          {servicesAvailed.length !== 0 ? (
            servicesAvailed.map(
              (
                availed, // 'availed' is type AvailedService { id, name, price, quantity }
              ) => (
                <SelectedService
                  key={availed.id}
                  name={availed.name} // <-- CORRECTED: Use name property from AvailedService
                  quantity={availed.quantity}
                  price={availed.price}
                  // You might also need to pass the ID if SelectedService has remove/update buttons
                  // id={availed.id}
                />
              ),
            )
          ) : (
            <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap font-medium uppercase tracking-widest text-gray-500">
              {" "}
              {/* Added back classes */}
              No Selected Services Yet
            </p>
          )}
        </div>

        {/* Totals Display */}
        <div className="mx-auto mt-8 flex w-[90%] flex-col text-sm">
          <div className="flex justify-between">
            {" "}
            <p>Total Discount: ₱ {totalDiscount.toLocaleString()}</p>{" "}
            <p>Subtotal: ₱ {subTotal.toLocaleString()}</p>{" "}
          </div>
          <p className="mt-1 text-base font-semibold">
            {" "}
            Grand Total: ₱ {grandTotal.toLocaleString()}{" "}
          </p>
        </div>

        {/* General Form Error Display */}
        {formErrors.general && (
          <p className="mx-auto mt-2 w-[90%] text-center text-sm font-medium text-red-600">
            {" "}
            {formErrors.general}{" "}
          </p>
        )}

        {/* Action Buttons */}
        <div className="mx-auto mt-8 flex w-[90%] justify-around">
          <button
            disabled={isSubmitting}
            onClick={handleCancel} // Use defined handler
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
            } // Also disable if core fields missing
            className="min-w-[100px] rounded-md border-2 border-customDarkPink bg-customDarkPink px-4 py-2 font-medium text-white transition-all duration-150 hover:bg-transparent hover:text-customDarkPink disabled:cursor-not-allowed disabled:border-gray-400 disabled:bg-gray-400 disabled:text-gray-200 disabled:hover:bg-gray-400 disabled:hover:text-gray-200"
          >
            {isSubmitting ? "Submitting..." : "Confirm"}
          </button>
        </div>
      </DialogForm>
    </DialogBackground>
  );
}
