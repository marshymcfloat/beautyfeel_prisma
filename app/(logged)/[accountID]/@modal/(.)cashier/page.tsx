// app/(logged)/[accountID]/@modal/(.)cashier/page.tsx - MODIFIED: Use useRef for fetch flag
"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react"; // <-- Import useRef
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation"; // Removed useParams as it's not used

import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Spinner from "@/components/ui/Spinner";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import CustomerInput from "@/components/Inputs/CustomerInput"; // Updated CustomerInput
import VoucherInput from "@/components/Inputs/VoucherInput";
import SelectedItem from "@/components/ui/cashier/SelectedItem"; // Check if this uses the updated quantity/remove logic
import Button from "@/components/Buttons/Button";
import { AlertCircle, Tag, XCircle, HelpCircle } from "lucide-react";
import {
  transactionSubmission,
  getActiveDiscountRules,
  cancelRecommendedAppointmentAction,
} from "@/lib/ServerAction"; // Check path

import { RootState, AppDispatch } from "@/lib/reduxStore"; // Check path
import {
  cashierActions,
  CashierState,
  SetCustomerDataPayload,
} from "@/lib/Slices/CashierSlice"; // Import SetCustomerDataPayload
import {
  fetchServices,
  fetchServiceSets,
  fetchBranches, // Import the new thunk
} from "@/lib/Slices/DataSlice"; // Check path
import {
  PaymentMethod as PrismaPaymentMethod,
  Branch as PrismaBranch, // Use PrismaBranch for type safety
  FollowUpPolicy,
  Service as PrismaService,
  ServiceSet as PrismaServiceSet,
  // RecommendedAppointmentStatus, // Not directly used here
  // Status, // Not directly used here
} from "@prisma/client"; // Check path
import type {
  // RecommendedAppointmentData, // Type is inferred for selectedRecommendation
  FetchedItem,
  UIDiscountRuleWithServices,
  // TransactionSubmissionResponse, // Type is inferred for response
  CustomerWithRecommendations as CustomerData,
} from "@/lib/Types"; // Check path

const serviceTypeOptions = [
  { id: "single" as const, title: "Single Service" },
  { id: "set" as const, title: "Service Set" },
];
const serveTimeOptions = [
  { id: "now" as const, title: "Now" },
  { id: "later" as const, title: "Later" },
];
const paymentMethodOptions = Object.values(PrismaPaymentMethod).map((pm) => ({
  id: pm,
  title:
    pm.charAt(0).toUpperCase() + pm.slice(1).toLowerCase().replace("_", " "),
}));

const inputErrorClass = "mt-1 text-xs text-red-500 px-1";
const selectedItemsContainerClass =
  "relative mt-4 max-h-[200px] min-h-[80px] w-full overflow-y-auto rounded-md border border-customGray/50 bg-white p-2 shadow-sm";
const noItemsMessageClass =
  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap text-sm italic text-gray-400";
const totalsContainerClass = "mt-4 flex w-full flex-col text-sm";
const grandTotalClass = "mt-1 text-base font-semibold";
const actionButtonsClass =
  "mt-6 flex w-full justify-around border-t border-customGray/30 pt-4";

export default function CashierInterceptedModal() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

  // Use a ref to track if the rules fetch has been initiated
  const hasFetchedRules = useRef(false); // <-- Use useRef

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all"); // Keep local for UI filter
  const [isCancellingRa, setIsCancellingRa] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(
    null,
  );

  const {
    services,
    serviceSets,
    branches, // Get branches from Redux
    itemsLoading,
    branchesLoading, // Use branchesLoading
    itemsError,
    branchesError, // Use branchesError
  } = useSelector((state: RootState) => state.data);

  const cashierForm = useSelector((state: RootState) => state.cashier);
  const {
    name, // Name is now primarily controlled by CustomerInput onChange or onCustomerSelect
    email, // Email is now primarily controlled by separate email input or onCustomerSelect
    customerId, // This tells us if an existing customer is selected
    servicesAvailed,
    grandTotal,
    totalDiscount,
    subTotal,
    serviceType,
    serveTime,
    date,
    time,
    paymentMethod,
    customerRecommendations, // Recommendations now come *with* the customer data on selection
    selectedRecommendedAppointmentId,
    generateNewFollowUpForFulfilledRA,
    appliedDiscountRules, // Assuming activeRules are stored in cashierSlice
    // areRulesFetched, // <-- REMOVED
  } = cashierForm;

  // Check if data fetching is in progress for items, branches, or submission/cancellation
  const isOverallLoading = itemsLoading || branchesLoading; // Simplified loading check
  const isAnyProcessLoading =
    isSubmitting || isOverallLoading || !!isCancellingRa;

  // Fetch initial data (services, sets, branches, and RULES)
  useEffect(() => {
    // Fetch services, sets, branches - keep their original conditions/dependencies
    if (!services && !itemsLoading && !itemsError) {
      dispatch(fetchServices());
    }
    if (!serviceSets && !itemsLoading && !itemsError) {
      dispatch(fetchServiceSets());
    }
    if (!branches && !branchesLoading && !branchesError) {
      dispatch(fetchBranches());
    }

    // Fetch discount rules only once using the ref
    if (!hasFetchedRules.current) {
      // <-- Check the ref value
      console.log("Attempting to fetch active discount rules...");
      hasFetchedRules.current = true; // <-- Immediately set ref to true after checking
      getActiveDiscountRules()
        .then((rules) => {
          console.log("Fetched rules:", rules);
          dispatch(
            cashierActions.applyDiscounts({
              rules: Array.isArray(rules)
                ? (rules as UIDiscountRuleWithServices[])
                : [],
            }),
          );
          // Removed dispatch(cashierActions.setRulesFetched(true));
        })
        .catch((e) => {
          console.error("Error fetching rules:", e);
          // Still dispatch empty array on error to clear potential stale rules
          dispatch(cashierActions.applyDiscounts({ rules: [] }));
          // Removed dispatch(cashierActions.setRulesFetched(true));
        });
    }

    // Cleanup: Reset cashier state and the ref when modal is closed (component unmounts)
    return () => {
      dispatch(cashierActions.reset());
      hasFetchedRules.current = false; // <-- Reset ref on unmount
    };
  }, [
    dispatch,
    services,
    serviceSets,
    branches,
    itemsLoading,
    branchesLoading,
    itemsError,
    branchesError,
    // REMOVED: areRulesFetched from dependencies
  ]); // Dependencies are now for the other fetches and dispatch itself

  // Handler for when a customer is selected from the dropdown OR the input is cleared
  // This updates customerId, name, email, and recommendations based on the selected customer or null.
  const handleCustomerSelected = useCallback(
    (customer: CustomerData | null) => {
      // customer will be null if the input is cleared by the user
      const payload: SetCustomerDataPayload = {
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              email: customer.email,
              recommendedAppointments: customer.recommendedAppointments, // Include recs
            }
          : null,
      };
      dispatch(cashierActions.setCustomerData(payload));
      // When a customer is selected or cleared, also clear any potential form errors related to the customer fields
      setFormErrors((prev) => {
        const newState = { ...prev };
        delete newState.name;
        delete newState.email;
        // Potentially clear general error if it was related to customer field validation
        // delete newState.general; // Be cautious with clearing general
        return newState;
      });
    },
    [dispatch],
  );

  // Handler for raw input changes in the CustomerInput field (when user is typing)
  // This only updates the `name` state in Redux.
  const handleCustomerNameInputChange = useCallback(
    (value: string) => {
      // We only set the name via typing if NO existing customer is selected.
      // If a customer IS selected (customerId is not null), the name in Redux
      // should match the selected customer's name. Typing in the input in that case
      // means the user intends to de-select the customer and type a new name.
      // This is handled by the CustomerInput component calling onCustomerSelect(null)
      // when the input value deviates significantly or is cleared.
      // So, the logic here should be simple: dispatch the action.
      dispatch(cashierActions.setCustomerName(value));
      // Clear email state if the user starts typing a new name after selecting an existing customer
      // This is a common UX pattern: typing implies starting fresh for a new customer.
      if (customerId !== null) {
        dispatch(cashierActions.setEmail(null));
      }

      // Clear customer name validation error if user starts typing
      setFormErrors((prev) => {
        const newState = { ...prev };
        delete newState.name;
        // delete newState.general; // Again, be cautious with general error
        return newState;
      });
    },
    [dispatch, customerId], // Include customerId in deps
  );

  // Handler for raw input changes in the separate Email field
  // This only updates the `email` state in Redux.
  const handleEmailInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // We only allow typing in the email field if NO existing customer is selected.
      // If an existing customer IS selected, the email input is disabled and shows the selected customer's email (from Redux state).
      if (customerId === null) {
        dispatch(cashierActions.setEmail(value));
        // Clear email validation error if user starts typing
        setFormErrors((prev) => {
          const newState = { ...prev };
          delete newState.email;
          return newState;
        });
      }
    },
    [dispatch, customerId], // Include customerId in deps
  );

  const handleSelectRecommendation = useCallback(
    (recommendationId: string) => {
      dispatch(
        cashierActions.setSelectedRecommendedAppointmentId(recommendationId),
      );
    },
    [dispatch],
  );

  const selectedRecommendation = useMemo(() => {
    return customerRecommendations.find(
      (rec) => rec.id === selectedRecommendedAppointmentId,
    );
  }, [customerRecommendations, selectedRecommendedAppointmentId]);

  const handleSelectChanges = useCallback(
    (key: string, value: string) => {
      if (key === "serviceType")
        dispatch(
          cashierActions.setServiceType(value as CashierState["serviceType"]),
        );
      else if (key === "serveTime")
        dispatch(
          cashierActions.setServeTime(value as CashierState["serveTime"]),
        );
      else if (key === "paymentMethod")
        dispatch(
          cashierActions.setPaymentMethod(value as PrismaPaymentMethod | null),
        );
      else if (key === "branchFilter") setSelectedBranchId(value);
    },
    [dispatch],
  );

  const branchOptions = useMemo(() => {
    const options = [{ id: "all", title: "All Branches" }];
    if (branches?.length) {
      // Check if branches is not null
      options.push(
        ...branches.map((b: PrismaBranch) => ({ id: b.id, title: b.title })),
      );
    }
    return options;
  }, [branches]);

  const itemsToDisplay = useMemo((): FetchedItem[] => {
    if (itemsLoading || !services || !serviceSets) return [];
    let displayItems: FetchedItem[] = [];
    if (serviceType === "single") {
      const filteredServices =
        selectedBranchId === "all" || !services // Handle null services
          ? services || []
          : services.filter(
              (s: PrismaService) => s.branchId === selectedBranchId,
            );
      displayItems = filteredServices.map((s: PrismaService) => ({
        id: s.id,
        title: s.title,
        price: s.price,
        type: "service",
      }));
    } else if (serviceType === "set") {
      displayItems = (serviceSets || []).map((set: PrismaServiceSet) => ({
        id: set.id,
        title: set.title,
        price: set.price,
        type: "set",
      }));
    }
    return displayItems.sort((a, b) => a.title.localeCompare(b.title));
  }, [services, serviceSets, serviceType, selectedBranchId, itemsLoading]);

  const handleAddRecommendedServiceToCart = useCallback(() => {
    if (
      itemsLoading ||
      !services ||
      !selectedRecommendation?.originatingService
    )
      return;
    const serviceData = services.find(
      (s: PrismaService) =>
        s.id === selectedRecommendation.originatingService!.id,
    );
    if (serviceData) {
      // Use selectItem which toggles presence
      dispatch(
        cashierActions.selectItem({
          id: serviceData.id,
          title: serviceData.title,
          price: serviceData.price,
          type: "service", // Assuming recommendations are always for single services
        }),
      );
    }
  }, [dispatch, selectedRecommendation, services, itemsLoading]);

  const handleCancelRecommendation = useCallback(
    async (recommendationId: string) => {
      if (
        !window.confirm(
          "Are you sure you want to cancel this recommended appointment?",
        )
      )
        return;
      setIsCancellingRa(recommendationId);
      setCancellationError(null);
      try {
        const result =
          await cancelRecommendedAppointmentAction(recommendationId);
        if (result.success)
          dispatch(cashierActions.removeRecommendation(recommendationId));
        else setCancellationError(result.message || "Failed to cancel.");
      } catch (e: any) {
        setCancellationError(e.message || "Error cancelling.");
      } finally {
        setIsCancellingRa(null);
      }
    },
    [dispatch],
  );

  const handleConfirmClick = async () => {
    setIsSubmitting(true);
    setFormErrors({});
    let localErrors: Record<string, string> = {};

    // Validation checks:
    if (!name.trim()) localErrors.name = "Customer name required."; // Name is always required
    // Email is required ONLY if no existing customer is selected (customerId is null)
    if (customerId === null && (!email || !email.trim())) {
      localErrors.email = "Email is required for new customers.";
    }
    // Validate email format ONLY if an email is provided (for new or existing customer where it might be displayed)
    if (
      email &&
      email.trim() &&
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email.trim())
    ) {
      localErrors.email = "Invalid email format.";
    }

    if (!servicesAvailed.length)
      localErrors.servicesAvailed = "Select at least one service.";
    if (!paymentMethod) localErrors.paymentMethod = "Payment method required.";
    if (serveTime === "later" && (!date || !time))
      localErrors.serveTime = "Date and time required for later booking.";

    if (Object.keys(localErrors).length > 0) {
      setFormErrors({ general: "Please correct the errors.", ...localErrors });
      setIsSubmitting(false);
      return;
    }

    // If validation passes, submit the form with current cashier state
    try {
      const response = await transactionSubmission(cashierForm);
      if (response.success) router.back();
      else
        setFormErrors({
          general: response.message || "Submission failed.",
          ...(response.errors || {}),
        });
    } catch (e: any) {
      setFormErrors({ general: e.message || "Unexpected error." });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => router.back();

  // Determine if the separate email input should be disabled
  const isEmailInputDisabled = customerId !== null;

  return (
    <Modal
      isOpen={true}
      onClose={handleCancel}
      title={<DialogTitle>Beautyfeel Transaction</DialogTitle>}
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-xl overflow-hidden rounded-lg bg-customOffWhite shadow-xl flex flex-col"
    >
      <div className="flex-grow space-y-5 overflow-y-auto p-4 sm:p-6">
        {isAnyProcessLoading && ( // Show spinner for any relevant loading state
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-customOffWhite/70 backdrop-blur-sm">
            <Spinner
              text={
                isSubmitting
                  ? "Submitting..."
                  : isCancellingRa
                    ? "Cancelling..."
                    : "Loading data..."
              }
            />
          </div>
        )}
        {formErrors.general && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-100 p-2 text-sm font-medium text-red-600">
            <AlertCircle size={16} />
            <span>{formErrors.general}</span>
          </div>
        )}
        {cancellationError && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-100 p-2 text-sm font-medium text-red-600">
            <AlertCircle size={16} />
            <span>{cancellationError}</span>
          </div>
        )}

        {/* Customer Name Input (autocomplete) */}
        <div className="w-full">
          <CustomerInput
            error={formErrors.name} // Pass name validation error
            initialValue={name} // Controlled by Redux state, passed down
            onCustomerSelect={handleCustomerSelected} // Handles selecting from dropdown / clearing input
            onChange={handleCustomerNameInputChange} // Handles raw text input
            disabled={isAnyProcessLoading} // Disable input during any relevant process
          />
          {formErrors.name && (
            <p className={inputErrorClass}>{formErrors.name}</p>
          )}
        </div>

        {/* Email Input (visible and editable only if no existing customer is selected) */}
        {/* Always render, but control disabled state and label */}
        <div className="w-full">
          <div className="relative w-full">
            <input
              value={email ?? ""} // Value from Redux state
              onChange={handleEmailInputChange} // New handler for this specific input
              placeholder=" "
              type="email"
              id="email-input"
              // Disable if an existing customer is selected OR any process is loading
              disabled={isEmailInputDisabled || isAnyProcessLoading}
              className={`peer relative z-0 h-[50px] w-full rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-gray-300"} px-3 pt-1 shadow-sm outline-none transition-colors duration-150 focus:border-customDarkPink disabled:cursor-not-allowed disabled:bg-gray-100`}
              aria-invalid={!!formErrors.email}
              aria-describedby={formErrors.email ? "email-error" : undefined}
            />
            <label
              htmlFor="email-input"
              // Label styling based on focus, error, and disabled state
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform bg-customOffWhite px-1 text-base font-medium transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${formErrors.email ? "text-red-600" : isEmailInputDisabled ? "text-gray-400" : "text-gray-500"} peer-focus:${formErrors.email ? "text-red-600" : "text-customDarkPink"} ${isEmailInputDisabled ? "cursor-not-allowed" : "cursor-text"}`}
            >
              E-mail {customerId === null ? "*" : "(From selected customer)"}{" "}
              {/* Indicate required for new */}
            </label>
          </div>
          {formErrors.email && (
            <p className={inputErrorClass} id="email-error">
              {formErrors.email}
            </p>
          )}
          {/* Optional hint text */}
          {customerId === null && (
            <p className="mt-1 px-1 text-xs text-gray-500">
              Required for new customers.
            </p>
          )}
        </div>

        {/* Customer Recommendations Section */}
        {name.trim() && customerRecommendations.length > 0 && (
          <div className="w-full rounded-md border border-customLightBlue bg-customWhiteBlue p-3">
            <h3 className="mb-3 flex items-center text-sm font-semibold text-customDarkPink">
              <Tag size={16} className="mr-1" /> Potential Follow-up
              Recommendations for {name.split(" ")[0]}:
            </h3>
            {selectedRecommendation ? (
              <div className="rounded-md border border-customLightBlue bg-white p-3 text-sm text-customBlack shadow-inner">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                  {" "}
                  {/* Added flex-col for responsiveness */}
                  <span className="mb-2 mr-2 flex-grow sm:mb-0">
                    {" "}
                    {/* Added margin-bottom for small screens */}
                    Selected:{" "}
                    <span className="font-medium">
                      {selectedRecommendation.originatingService?.title ||
                        "Service"}{" "}
                      on{" "}
                      {new Date(
                        selectedRecommendation.recommendedDate,
                      ).toLocaleDateString()}
                    </span>
                    {selectedRecommendation.originatingService
                      ?.followUpPolicy && (
                      <span className="ml-0 mt-1 inline-block rounded-full bg-customLightBlue px-2 py-0.5 text-xs text-customBlack sm:ml-2 sm:mt-0">
                        {" "}
                        {/* Adjusted margin/display for responsiveness */}
                        Policy:{" "}
                        {
                          selectedRecommendation.originatingService
                            .followUpPolicy
                        }
                      </span>
                    )}
                  </span>
                  <div className="flex items-center space-x-2">
                    {selectedRecommendation.originatingService &&
                      !itemsLoading && (
                        <button
                          onClick={handleAddRecommendedServiceToCart}
                          disabled={isAnyProcessLoading} // Disable add button
                          className="flex-shrink-0 rounded bg-customDarkPink px-3 py-1 text-xs font-semibold text-white hover:bg-customDarkPink/90 disabled:opacity-50"
                        >
                          Add Service
                        </button>
                      )}
                    {itemsLoading &&
                      selectedRecommendation.originatingService &&
                      !isCancellingRa && <Spinner size="sm" />}
                    <button
                      onClick={() =>
                        dispatch(
                          cashierActions.setSelectedRecommendedAppointmentId(
                            null,
                          ),
                        )
                      }
                      disabled={isAnyProcessLoading} // Disable change button
                      className="flex-shrink-0 rounded border border-customDarkPink px-3 py-1 text-xs font-semibold text-customDarkPink hover:bg-customDarkPink hover:text-white disabled:opacity-50"
                      title="Change selected recommendation"
                    >
                      Change
                    </button>
                    {/* Cancel Recommendation Button */}
                    <button
                      onClick={() =>
                        handleCancelRecommendation(selectedRecommendation.id)
                      }
                      disabled={isAnyProcessLoading} // Disable cancel button
                      className="rounded-full p-1 text-red-600 hover:bg-red-700 disabled:opacity-50"
                      title="Cancel this recommendation"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                </div>

                {selectedRecommendation.originatingService && (
                  <div className="mt-3 border-t border-customLightBlue pt-3">
                    <label
                      htmlFor="generateNewFollowUp"
                      className="group flex cursor-pointer items-center text-xs text-customBlack"
                    >
                      <input
                        type="checkbox"
                        id="generateNewFollowUp"
                        checked={generateNewFollowUpForFulfilledRA}
                        onChange={(e) =>
                          dispatch(
                            cashierActions.setGenerateNewFollowUpForFulfilledRA(
                              e.target.checked,
                            ),
                          )
                        }
                        disabled={
                          isAnyProcessLoading || // Disable checkbox during any loading/submitting
                          selectedRecommendation.originatingService
                            .followUpPolicy === FollowUpPolicy.NONE
                        }
                        className="mr-2 h-4 w-4 rounded border-customLightBlue text-customDarkPink focus:ring-customDarkPink disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      Generate a new follow-up for{" "}
                      <span className="mx-1 font-semibold">
                        {selectedRecommendation.originatingService.title}
                      </span>
                      ?
                      <span className="relative ml-1">
                        <HelpCircle
                          size={14}
                          className="text-customLightBlue group-hover:text-customDarkPink"
                        />
                        <span className="absolute bottom-full left-1/2 z-10 mb-2 w-max -translate-x-1/2 transform whitespace-nowrap rounded-md bg-customBlack px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">
                          {selectedRecommendation.originatingService
                            .followUpPolicy === FollowUpPolicy.NONE
                            ? "Policy: NONE (No new follow-up)"
                            : selectedRecommendation.originatingService
                                  .followUpPolicy === FollowUpPolicy.ONCE
                              ? "Policy: ONCE (Check to generate)"
                              : "Policy: EVERY_TIME (Uncheck to skip this time)"}
                        </span>
                      </span>
                    </label>
                    {selectedRecommendation.originatingService
                      .followUpPolicy === FollowUpPolicy.NONE && (
                      <p className="text-xxs mt-1 pl-6 italic text-customBlack/70">
                        (Service policy is NONE, no new follow-up will be
                        generated.)
                      </p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {customerRecommendations.map((rec) => (
                  <li
                    key={rec.id}
                    onClick={() => handleSelectRecommendation(rec.id)}
                    className="flex cursor-pointer items-center justify-between rounded-md border border-customGray bg-white p-2 text-sm text-customBlack shadow-sm hover:border-customLightBlue hover:bg-customWhiteBlue"
                  >
                    <span>
                      Recommended:{" "}
                      <span className="font-medium">
                        {rec.originatingService?.title || "Service"} on{" "}
                        {new Date(rec.recommendedDate).toLocaleDateString()}
                      </span>
                      {rec.originatingService?.followUpPolicy && (
                        <span className="ml-2 rounded-full bg-customLightBlue px-2 py-0.5 text-xs text-customBlack">
                          Policy: {rec.originatingService.followUpPolicy}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent triggering the parent li onClick
                        handleCancelRecommendation(rec.id);
                      }}
                      disabled={isAnyProcessLoading} // Disable cancel button
                      className="ml-2 rounded-full p-1 text-red-600 hover:bg-red-700 disabled:opacity-50"
                      title="Cancel"
                    >
                      <XCircle size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {!selectedRecommendation && (
              <p className="mt-2 text-xs italic text-customBlack/70">
                Select a recommendation if this transaction fulfills it. You can
                also cancel recommendations.
              </p>
            )}
          </div>
        )}

        {/* Service Type and Branch Filter */}
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
            disabled={isAnyProcessLoading} // Disable
          />
          {serviceType === "single" &&
            (branchesLoading ||
              (branches && branches.length > 0) ||
              branchesError) && ( // Only show branch filter if fetching or branches exist/error
              <SelectInputGroup
                label="Filter by Branch"
                name="branchFilter"
                id="branchFilter"
                onChange={handleSelectChanges}
                options={branchOptions}
                valueKey="id"
                labelKey="title"
                value={selectedBranchId}
                isLoading={branchesLoading}
                error={formErrors.branchFilter || branchesError || undefined}
                disabled={isAnyProcessLoading} // Disable
              />
            )}
        </div>
        {formErrors.branchFilter && (
          <p className={inputErrorClass}>{formErrors.branchFilter}</p>
        )}

        {/* Serve Time and Date/Time Picker */}
        <div className="w-full">
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
            disabled={isAnyProcessLoading} // Disable
          />
          {serveTime === "later" && (
            <DateTimePicker
              error={formErrors.date || formErrors.time || formErrors.serveTime}
              disabled={isAnyProcessLoading} // Disable
            />
          )}
          {formErrors.serveTime && ( // Display serveTime error below DateTimePicker if needed
            <p className={inputErrorClass}>{formErrors.serveTime}</p>
          )}
        </div>

        {/* Services/Sets Select Input */}
        <div className="w-full">
          <ServicesSelect
            isLoading={itemsLoading} // Use itemsLoading
            data={itemsToDisplay}
            error={formErrors.servicesAvailed || itemsError || undefined} // Use itemsError
            disabled={isAnyProcessLoading} // Disable select during loading/submitting
          />
          {formErrors.servicesAvailed && (
            <p className={inputErrorClass}>{formErrors.servicesAvailed}</p>
          )}
          {itemsError && ( // Display items error below ServicesSelect if needed
            <p className={inputErrorClass}>{itemsError}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <VoucherInput
            disabled={isAnyProcessLoading} // Disable voucher input
          />
          <SelectInputGroup
            label="Payment Method"
            name="paymentMethod"
            id="paymentMethod"
            onChange={handleSelectChanges}
            options={paymentMethodOptions}
            valueKey="id"
            labelKey="title"
            value={paymentMethod ?? ""}
            error={formErrors.paymentMethod}
            required
            disabled={isAnyProcessLoading} // Disable
          />
          {formErrors.paymentMethod && (
            <p className={inputErrorClass}>{formErrors.paymentMethod}</p>
          )}
        </div>

        <div className={selectedItemsContainerClass}>
          {servicesAvailed.length > 0 ? (
            servicesAvailed.map((item) => (
              <SelectedItem
                key={item.id + item.type}
                {...item}
                disabled={isAnyProcessLoading} // Disable item controls
              />
            ))
          ) : (
            <p className={noItemsMessageClass}>No Selected Items Yet</p>
          )}
        </div>

        <div className={totalsContainerClass}>
          <div className="flex justify-between text-customBlack/80">
            <p>
              Subtotal: ₱
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
      {/* End of scrollable content */}
      {/* Action Buttons (fixed at bottom) */}
      <div className={`flex-shrink-0 ${actionButtonsClass}`}>
        <Button
          onClick={handleCancel}
          disabled={isAnyProcessLoading}
          type="button"
          invert
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirmClick}
          type="button"
          disabled={
            isAnyProcessLoading || // Disable if any process is loading
            !name.trim() || // Name is always required
            (customerId === null && (!email || !email.trim())) || // Email required ONLY for new customer
            (customerId === null &&
              email &&
              email.trim() &&
              !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(
                email.trim(),
              )) || // Disable if new customer email is invalid
            !servicesAvailed.length ||
            !paymentMethod ||
            (serveTime === "later" && (!date || !time)) // Date/Time required for later
          }
        >
          {isSubmitting ? "Submitting..." : "Confirm Transaction"}
        </Button>
      </div>
    </Modal>
  );
}
