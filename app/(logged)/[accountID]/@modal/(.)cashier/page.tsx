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
import { RootState } from "@/lib/reduxStore";
import { useSelector, useDispatch } from "react-redux";
import { useParams } from "next/navigation";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { getServices } from "@/lib/utils";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CashierState } from "@/lib/Slices/CashierSlice";

type ServicesProps = {
  id: string;
  title: string;
  price: number;
  branchId: string;
};

type ServiceType = CashierState["serviceType"]; // "single" | "set"
type ServeTime = CashierState["serveTime"]; // "now" | "later"
type PaymentMethod = CashierState["paymentMethod"]; // "ewallet" | "cash" | "bank"

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
export default function CashierInterceptedModal() {
  const { accountID } = useParams();
  const router = useRouter();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [services, setServices] = useState<ServicesProps[] | null>(null);
  const [servicesIsFetching, setServicesIsFetching] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Fetch services (keeping as is)
  useEffect(() => {
    async function runGetService() {
      // Ensure accountID is available if needed by getServices
      if (!accountID) return;
      setServicesIsFetching(true);
      try {
        // Pass accountID as string, handle potential array if needed
        const data = await getServices(
          Array.isArray(accountID) ? accountID[0] : accountID,
        );
        setServices(data);
      } catch (error) {
        console.error("Failed to fetch services:", error);
        setFormErrors((prev) => ({
          ...prev,
          general: "Failed to load services.",
        }));
      } finally {
        setServicesIsFetching(false);
      }
    }
    runGetService();
  }, [accountID]); // Add accountID as dependency

  const dispatch = useDispatch();

  // Get relevant state from Redux
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
    // voucherCode, // Only needed if VoucherInput uses it as a prop
  } = cashierForm;

  const subTotal = grandTotal + totalDiscount;

  // Handle select changes (keeping as is, ensure types match)
  const handleSelectChanges = useCallback(
    (key: string, value: string) => {
      // Type Guard approach
      if (key === "serviceType") {
        // Check if the value is a valid ServiceType
        if (value === "single" || value === "set") {
          dispatch(
            cashierActions.settingServiceTimeOrType({
              key: key, // key is known to be 'serviceType' here
              value: value, // value is now known to be ServiceType
            }),
          );
        } else {
          console.warn(`Invalid value "${value}" for key "serviceType"`);
        }
      } else if (key === "serveTime") {
        // Check if the value is a valid ServeTime
        if (value === "now" || value === "later") {
          dispatch(
            cashierActions.settingServiceTimeOrType({
              key: key, // key is known to be 'serveTime' here
              value: value, // value is now known to be ServeTime
            }),
          );
        } else {
          console.warn(`Invalid value "${value}" for key "serveTime"`);
        }
      } else if (key === "paymentMethod") {
        // Check if the value is a valid PaymentMethod
        if (value === "cash" || value === "ewallet" || value === "bank") {
          dispatch(
            cashierActions.settingServiceTimeOrType({
              key: key, // key is known to be 'paymentMethod' here
              value: value, // value is now known to be PaymentMethod
            }),
          );
        } else {
          console.warn(`Invalid value "${value}" for key "paymentMethod"`);
        }
      }
      // Add else if needed for other keys handled by this function
    },
    [dispatch], // Keep dispatch as dependency
  );

  // Handle form submission
  async function handleSubmitting() {
    setIsSubmitting(true);
    setFormErrors({}); // Clear previous errors

    // Basic Frontend Checks (Optional but good UX)
    if (!cashierForm.name || !cashierForm.name.trim()) {
      setFormErrors((prev) => ({
        ...prev,
        name: "Customer name is required.",
      }));
      setIsSubmitting(false);
      return;
    }
    if (
      !cashierForm.servicesAvailed ||
      cashierForm.servicesAvailed.length === 0
    ) {
      setFormErrors((prev) => ({
        ...prev,
        servicesAvailed: "At least one service must be selected.",
      }));
      setIsSubmitting(false);
      return;
    }
    // --- End Optional Frontend Checks ---

    const response = await transactionSubmission(cashierForm);
    setIsSubmitting(false);

    if (response.success) {
      console.log("Submission successful, resetting form.");
      dispatch(cashierActions.reset());
      router.back(); // Or redirect to a success page/transaction details
      // Consider showing a success toast message
    } else if (response.errors) {
      console.log("Submission failed with errors:", response.errors);
      setFormErrors(response.errors); // Store validation errors from server
    } else {
      // Handle unexpected case where success is false but no errors obj
      setFormErrors({ general: "An unknown error occurred." });
    }
  }

  const handleCancel = () => {
    dispatch(cashierActions.reset());
    router.back();
  };

  console.log("Current Form State:", cashierForm);
  console.log("Current Form Errors:", formErrors);

  return (
    <DialogBackground>
      <DialogForm>
        <h1 className="text-center text-2xl font-bold uppercase tracking-widest">
          Beautyfeel Transaction
        </h1>

        {/* Customer Name Input - Ensure it displays formErrors.name */}
        <CustomerInput error={formErrors.name} />
        {/* Display name error explicitly if CustomerInput doesn't */}
        {formErrors.name && !formErrors.general /* Avoid duplicate msg */ && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.name}
          </p>
        )}

        {/* Email Input - Mark as Optional */}
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
            // FIX: Use the constant array
            options={serviceTypeOptions}
            valueKey="id"
            labelKey="title"
            value={serviceType}
            error={formErrors.serviceType}
            required // Added required for clarity
          />
          <SelectInputGroup
            label="Serve Time"
            name="serveTime"
            id="serveTime"
            onChange={handleSelectChanges}
            // FIX: Use the constant array
            options={serveTimeOptions}
            valueKey="id"
            labelKey="title"
            value={serveTime}
            error={formErrors.serveTime}
            required // Added required for clarity
          />
        </div>
        {/* Display Serve Time Error if specific */}
        {formErrors.serveTime && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.serveTime}
          </p>
        )}
        {/* Date/Time Picker */}
        {serveTime === "later" && (
          <DateTimePicker error={formErrors.serveTime} />
        )}

        {/* Services Select - Pass services data and handle loading/errors */}
        <ServicesSelect
          isLoading={servicesIsFetching}
          data={services}
          error={formErrors.servicesAvailed}
        />
        {/* Display Services Availed Error */}
        {formErrors.servicesAvailed && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.servicesAvailed}
          </p>
        )}

        {/* Voucher and Payment Method */}
        <div className="mx-auto mt-8 flex w-[90%] justify-between gap-4">
          {/* Ensure VoucherInput displays formErrors.voucherCode */}
          <div className="flex h-full w-[50%]">
            <VoucherInput />
          </div>
          <div className="w-[50%]">
            <SelectInputGroup
              label="Payment Method"
              name="paymentMethod"
              id="paymentMethod"
              onChange={handleSelectChanges}
              options={[
                { id: "cash", title: "Cash" },
                { id: "ewallet", title: "E-wallet" },
                { id: "bank", title: "Bank" },
              ]}
              valueKey="id"
              labelKey="title"
              value={paymentMethod} // Pass current value
              error={formErrors.paymentMethod}
            />
          </div>
        </div>
        {/* Display Payment Method Error if specific */}
        {formErrors.paymentMethod && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
            {formErrors.paymentMethod}
          </p>
        )}
        {/* Display Voucher Error if specific */}
        {formErrors.voucherCode && (
          <p className="mx-auto mt-1 w-[90%] text-sm text-red-500">
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
                key={availed.id} // Use service ID as key if unique within selection
                name={availed.title}
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

        {/* General Error Display */}
        {formErrors.general && (
          <p className="mx-auto mt-2 w-[90%] text-center text-sm font-medium text-red-600">
            {formErrors.general}
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
