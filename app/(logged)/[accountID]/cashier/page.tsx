"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";

// Component Imports (assuming paths are correct for a standard page setup)
import Spinner from "@/components/ui/Spinner";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import CustomerInput from "@/components/Inputs/CustomerInput";
import VoucherInput from "@/components/Inputs/VoucherInput";
import SelectedItem from "@/components/ui/cashier/SelectedItem";
import Button from "@/components/Buttons/Button";
import {
  AlertCircle,
  ChevronLeft,
  Receipt,
  Tag,
  XCircle,
  HelpCircle,
} from "lucide-react"; // Added Tag, XCircle, HelpCircle

// Server Actions & Redux
import {
  transactionSubmission,
  getActiveDiscountRules,
  getAllBranches, // Added
  cancelRecommendedAppointmentAction, // Added
} from "@/lib/ServerAction";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { cashierActions, CashierState } from "@/lib/Slices/CashierSlice";
import { fetchServices, fetchServiceSets } from "@/lib/Slices/DataSlice";

// Prisma & Custom Types
import {
  PaymentMethod as PrismaPaymentMethod, // Renamed to avoid conflict if local 'PaymentMethod' exists
  Branch, // Added
  FollowUpPolicy, // Added
  // RecommendedAppointmentStatus, Status // Not directly used in this component's render/logic
} from "@prisma/client";
import type {
  // RecommendedAppointmentData, // Implicitly part of CustomerWithRecommendations
  FetchedItem,
  UIDiscountRuleWithServices,
  // TransactionSubmissionResponse, // Already defined
  CustomerWithRecommendations as CustomerData, // For CustomerInput callback
} from "@/lib/Types";

// --- Options for Select Inputs ---
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
    pm.charAt(0).toUpperCase() + pm.slice(1).toLowerCase().replace("_", " "), // Improved title case
}));

export default function CashierPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { accountID: accountIdParam } = useParams();
  const accountId = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam;

  // State from Modal Logic
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [isCancellingRa, setIsCancellingRa] = useState<string | null>(null); // For recommended appointment cancellation
  const [cancellationError, setCancellationError] = useState<string | null>(
    null,
  );

  // Data from Redux 'data' slice
  const { services, serviceSets, itemsLoading, itemsError } = useSelector(
    (state: RootState) => state.data,
  );

  // Data from Redux 'cashier' slice
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
    customerRecommendations, // Added
    selectedRecommendedAppointmentId, // Added
    generateNewFollowUpForFulfilledRA, // Added
  } = cashierForm;

  const isOverallLoading = itemsLoading || isLoadingBranches;

  // Effect for initial data fetching and cleanup (from Modal)
  useEffect(() => {
    dispatch(fetchServices());
    dispatch(fetchServiceSets());
    getActiveDiscountRules()
      .then((rules) => {
        if (Array.isArray(rules)) {
          dispatch(
            cashierActions.applyDiscounts({
              rules: rules as UIDiscountRuleWithServices[],
            }),
          );
        } else {
          // Handle cases where rules might not be an array, though server action should ensure it
          console.warn("Discount rules received in unexpected format:", rules);
          dispatch(cashierActions.applyDiscounts({ rules: [] }));
        }
      })
      .catch((err) => {
        console.error("Failed to fetch discount rules:", err);
        setFormErrors((prev) => ({
          ...prev,
          general: "Error loading discounts. Totals might be inaccurate.",
        }));
        dispatch(cashierActions.applyDiscounts({ rules: [] })); // Apply empty rules on error
      });

    setIsLoadingBranches(true);
    setBranchError(null);
    getAllBranches()
      .then((fetchedBranches) => {
        setBranches(fetchedBranches || []); // Ensure branches is always an array
        setIsLoadingBranches(false);
      })
      .catch(() => {
        setBranchError(
          "Could not load branches. Filtering may be unavailable.",
        );
        setBranches([]);
        setIsLoadingBranches(false);
      });

    return () => {
      dispatch(cashierActions.reset()); // Reset cashier state on component unmount
    };
  }, [dispatch]);

  const handleCustomerSelectedFromInput = useCallback(
    (customer: CustomerData | null) => {
      if (customer) {
        dispatch(
          cashierActions.setCustomerData({
            customer: {
              // This object is always provided if a customer is selected
              id: customer.id,
              name: customer.name,
              email: customer.email, // customer.email can be null or string from CustomerData
            },
            recommendations: customer.recommendedAppointments || [], // Ensure array
          }),
        );
      } else {
        dispatch(
          cashierActions.setCustomerData({
            customer: null, // Pass null for the entire customer object
            recommendations: [],
          }),
        );
      }
    },
    [dispatch],
  );

  const handleSelectRecommendation = useCallback(
    (recommendationId: string | null) => {
      // Allow null to deselect
      dispatch(
        cashierActions.setSelectedRecommendedAppointmentId(recommendationId),
      );
    },
    [dispatch],
  );

  const selectedRecommendation = useMemo(() => {
    if (!selectedRecommendedAppointmentId || !customerRecommendations)
      return null;
    return customerRecommendations.find(
      (rec) => rec.id === selectedRecommendedAppointmentId,
    );
  }, [customerRecommendations, selectedRecommendedAppointmentId]);

  const handleSelectChanges = useCallback(
    (key: string, value: string | null) => {
      // Value can be null if a select is cleared
      const isST = (v: any): v is CashierState["serviceType"] =>
        v === "single" || v === "set";
      const isServeT = (v: any): v is CashierState["serveTime"] =>
        v === "now" || v === "later";
      const isPM = (v: any): v is PrismaPaymentMethod =>
        Object.values(PrismaPaymentMethod).includes(v as PrismaPaymentMethod);

      if (key === "serviceType" && isST(value)) {
        dispatch(cashierActions.setServiceType(value));
      } else if (key === "serveTime" && isServeT(value)) {
        dispatch(cashierActions.setServeTime(value));
      } else if (key === "paymentMethod") {
        // Handle null for clearing payment method
        dispatch(cashierActions.setPaymentMethod(isPM(value) ? value : null));
      } else if (key === "branchFilter") {
        setSelectedBranchId(value || "all"); // Default to "all" if value is null/empty
      } else {
        console.warn(
          `Unhandled select change: "${key}" with value: "${value}"`,
        );
      }
    },
    [dispatch],
  );

  const branchOptions = useMemo(() => {
    const options = [{ id: "all", title: "All Branches" }];
    if (branches?.length) {
      // branches can be null initially
      options.push(...branches.map((b) => ({ id: b.id, title: b.title })));
    }
    return options;
  }, [branches]);

  const itemsToDisplay = useMemo((): FetchedItem[] => {
    if (itemsLoading || !services || !serviceSets) return [];
    let displayItems: FetchedItem[] = [];

    if (serviceType === "single") {
      const filteredServices =
        selectedBranchId === "all"
          ? services
          : services.filter(
              (s) => s.branchId === selectedBranchId || !s.branchId,
            ); // Also include services with no branchId (if applicable)
      displayItems = filteredServices.map((s) => ({
        id: s.id,
        title: s.title,
        price: s.price,
        type: "service" as const,
      }));
    } else if (serviceType === "set") {
      // Sets are typically not branch-specific in the same way, unless your model defines it
      displayItems = serviceSets.map((set) => ({
        id: set.id,
        title: set.title,
        price: set.price,
        type: "set" as const,
      }));
    }
    return displayItems.sort((a, b) => a.title.localeCompare(b.title));
  }, [services, serviceSets, serviceType, selectedBranchId, itemsLoading]);

  const handleAddRecommendedServiceToCart = useCallback(() => {
    if (
      itemsLoading ||
      !services ||
      !selectedRecommendation?.originatingServiceId
    )
      return;

    const serviceData = services.find(
      (s) => s.id === selectedRecommendation.originatingServiceId,
    );
    if (serviceData) {
      dispatch(
        cashierActions.selectItem({
          id: serviceData.id,
          title: serviceData.title,
          price: serviceData.price,
          type: "service",
        }),
      );
    } else {
      console.warn(
        "Service for recommendation not found:",
        selectedRecommendation.originatingServiceId,
      );
      // Optionally inform user
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
        if (result.success) {
          dispatch(cashierActions.removeRecommendation(recommendationId));
          if (selectedRecommendedAppointmentId === recommendationId) {
            dispatch(cashierActions.setSelectedRecommendedAppointmentId(null)); // Deselect if current one is cancelled
          }
        } else {
          setCancellationError(
            result.message || "Failed to cancel recommendation.",
          );
        }
      } catch (e: any) {
        setCancellationError(e.message || "Error cancelling recommendation.");
      } finally {
        setIsCancellingRa(null);
      }
    },
    [dispatch, selectedRecommendedAppointmentId],
  );

  const handleConfirmClick = async () => {
    setIsSubmitting(true);
    setFormErrors({});
    let localErrors: Record<string, string> = {};

    if (!cashierForm.name.trim()) localErrors.name = "Customer name required.";
    if (!servicesAvailed.length)
      localErrors.servicesAvailed = "Select at least one service.";
    if (!paymentMethod) localErrors.paymentMethod = "Payment method required.";
    if (serveTime === "later" && (!cashierForm.date || !cashierForm.time)) {
      localErrors.serveTime = "Booking Date and Time are required for 'Later'.";
    }
    if (
      email &&
      email.trim() &&
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email.trim())
    ) {
      localErrors.email = "Invalid email format.";
    }

    if (Object.keys(localErrors).length > 0) {
      setFormErrors({
        general: "Please correct the errors below.",
        ...localErrors,
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await transactionSubmission(cashierForm); // Pass the whole state
      setIsSubmitting(false);
      if (response.success) {
        dispatch(cashierActions.reset());
        router.push(`/${accountId}/transactions`); // Navigate on success
      } else {
        const clientErrors: Record<string, string> = {};
        if (response.errors) {
          for (const key in response.errors) {
            clientErrors[key] = Array.isArray(response.errors[key])
              ? (response.errors[key] as string[]).join("; ")
              : String(response.errors[key]);
          }
        }
        setFormErrors({
          general:
            response.message || "Submission failed. Please review the details.",
          ...clientErrors,
        });
      }
    } catch (e: any) {
      setFormErrors({
        general: e.message || "An unexpected error occurred during submission.",
      });
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    dispatch(cashierActions.reset());
    router.push(`/${accountId}`); // Navigate back to account dashboard or previous page
  };

  // --- Styling Classes (can be customized further) ---
  const inputErrorClass = "mt-1 text-xs text-red-500 px-1";
  const selectedItemsContainerClass =
    "relative mt-4 max-h-[200px] min-h-[80px] w-full overflow-y-auto rounded-md border border-customGray/50 bg-white p-2 shadow-sm";
  const noItemsMessageClass =
    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap text-sm italic text-gray-400";
  const totalsContainerClass = "mt-4 flex w-full flex-col text-sm";
  const grandTotalClass = "mt-1 text-base font-semibold";
  const actionButtonsContainerClass =
    "mt-auto flex w-full flex-shrink-0 justify-around border-t border-customGray/30 bg-customOffWhite p-4 shadow-inner"; // Use customOffWhite

  return (
    <div className="flex h-full flex-col bg-customOffWhite">
      {" "}
      {/* Main page background */}
      {/* Page Header */}
      <div className="flex flex-shrink-0 items-center border-b border-customGray bg-white p-4 shadow-sm">
        <button
          onClick={handleCancel}
          className="mr-4 rounded-full p-1.5 text-customGray hover:bg-customGray/20 hover:text-customBlack focus:outline-none focus:ring-1 focus:ring-customDarkPink"
          aria-label="Cancel and Go Back"
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex items-center text-lg font-semibold text-customBlack">
          <Receipt size={18} className="mr-2 text-customDarkPink" />
          New Transaction
        </h1>
      </div>
      {isOverallLoading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-customOffWhite/70 backdrop-blur-sm">
          <Spinner text="Loading data..." />
        </div>
      )}
      {/* Scrollable Form Content Area */}
      <div className="flex-grow space-y-5 overflow-y-auto p-4 sm:p-6">
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
        {branchError && !isLoadingBranches && (
          <div className="flex items-center gap-2 rounded border border-amber-400 bg-amber-50 p-2 text-sm font-medium text-amber-700">
            <AlertCircle size={16} />
            <span>{branchError}</span>
          </div>
        )}

        {/* Customer Input */}
        <div className="w-full">
          <CustomerInput
            error={formErrors.name}
            initialValue={name} // Pass current name
            onCustomerSelect={handleCustomerSelectedFromInput} // Pass handler
          />
        </div>

        {/* Email Input */}
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
              className={`peer relative z-0 h-[50px] w-full rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-customGray"} bg-white px-3 pt-1 shadow-sm outline-none transition-colors duration-150 focus:border-customDarkPink`}
            />
            <label
              htmlFor="email-input"
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform bg-white px-1 text-base font-medium transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${formErrors.email ? "text-red-600" : "text-gray-500"} peer-focus:${formErrors.email ? "text-red-600" : "text-customDarkPink"}`}
            >
              E-mail (Optional)
            </label>
          </div>
          {formErrors.email && (
            <p className={inputErrorClass}>{formErrors.email}</p>
          )}
        </div>

        {/* Recommended Appointments Section */}
        {name.trim() &&
          customerRecommendations &&
          customerRecommendations.length > 0 && (
            <div className="w-full rounded-md border border-customLightBlue bg-customWhiteBlue p-3">
              <h3 className="mb-3 flex items-center text-sm font-semibold text-customDarkPink">
                <Tag size={16} className="mr-1.5" /> Potential Follow-ups for{" "}
                {name.split(" ")[0]}:
              </h3>
              {selectedRecommendation ? (
                <div className="rounded-md border border-customGray/30 bg-white p-3 text-sm text-customBlack shadow-inner">
                  <div className="flex items-center justify-between">
                    <span className="mr-2 flex-grow">
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
                        <span className="ml-2 rounded-full bg-customLightBlue px-2 py-0.5 text-xs text-customBlack/80">
                          Policy:{" "}
                          {
                            selectedRecommendation.originatingService
                              .followUpPolicy
                          }
                        </span>
                      )}
                    </span>
                    <div className="flex items-center space-x-2">
                      {selectedRecommendation.originatingServiceId &&
                        !itemsLoading && (
                          <button
                            onClick={handleAddRecommendedServiceToCart}
                            disabled={
                              isSubmitting || itemsLoading || !!isCancellingRa
                            }
                            className="flex-shrink-0 rounded bg-customDarkPink px-3 py-1 text-xs font-semibold text-white hover:bg-customDarkPink/90 active:bg-customDarkPink/80 disabled:opacity-50"
                          >
                            Add Service
                          </button>
                        )}
                      {itemsLoading &&
                        selectedRecommendation.originatingServiceId &&
                        !isCancellingRa && <Spinner size="sm" />}
                      <button
                        onClick={() => handleSelectRecommendation(null)}
                        disabled={isSubmitting || !!isCancellingRa}
                        className="flex-shrink-0 rounded border border-customDarkPink px-3 py-1 text-xs font-semibold text-customDarkPink hover:bg-customDarkPink hover:text-white active:bg-customDarkPink/90 disabled:opacity-50"
                        title="Change selected recommendation"
                      >
                        Change
                      </button>
                      <button
                        onClick={() =>
                          handleCancelRecommendation(selectedRecommendation.id)
                        }
                        disabled={
                          isSubmitting ||
                          isCancellingRa === selectedRecommendation.id
                        }
                        className="rounded-full p-1 text-red-500 hover:bg-red-100 disabled:opacity-50"
                        title="Cancel this recommendation"
                      >
                        {isCancellingRa === selectedRecommendation.id ? (
                          <Spinner size="xs" />
                        ) : (
                          <XCircle size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  {selectedRecommendation.originatingServiceId && (
                    <div className="mt-3 border-t border-customGray/20 pt-3">
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
                            isSubmitting ||
                            !!isCancellingRa ||
                            selectedRecommendation.originatingService
                              ?.followUpPolicy === FollowUpPolicy.NONE
                          }
                          className="mr-2 h-4 w-4 rounded border-customGray text-customDarkPink focus:ring-customDarkPink disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        Generate a new follow-up for{" "}
                        <span className="mx-1 font-semibold">
                          {selectedRecommendation.originatingService?.title}
                        </span>
                        ?
                        <span className="relative ml-1">
                          <HelpCircle
                            size={14}
                            className="text-customGray group-hover:text-customDarkPink"
                          />
                          <span className="absolute bottom-full left-1/2 z-20 mb-2 w-max -translate-x-1/2 transform whitespace-nowrap rounded-md bg-customBlack px-2 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                            {selectedRecommendation.originatingService
                              ?.followUpPolicy === FollowUpPolicy.NONE
                              ? "Policy: NONE (No new follow-up)"
                              : selectedRecommendation.originatingService
                                    ?.followUpPolicy === FollowUpPolicy.ONCE
                                ? "Policy: ONCE (Check to generate)"
                                : "Policy: EVERY_TIME (Uncheck to skip this time)"}
                          </span>
                        </span>
                      </label>
                      {selectedRecommendation.originatingService
                        ?.followUpPolicy === FollowUpPolicy.NONE && (
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
                      className="flex cursor-pointer items-center justify-between rounded-md border border-customGray/50 bg-white p-2 text-sm text-customBlack shadow-sm hover:border-customLightBlue hover:bg-white"
                    >
                      <span>
                        Recommended:{" "}
                        <span className="font-medium">
                          {rec.originatingService?.title || "Service"} on{" "}
                          {new Date(rec.recommendedDate).toLocaleDateString()}
                        </span>
                        {rec.originatingService?.followUpPolicy && (
                          <span className="ml-2 rounded-full bg-customLightBlue px-2 py-0.5 text-xs text-customBlack/80">
                            Policy: {rec.originatingService.followUpPolicy}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelRecommendation(rec.id);
                        }}
                        disabled={isSubmitting || isCancellingRa === rec.id}
                        className="ml-2 rounded-full p-1 text-red-500 hover:bg-red-100 disabled:opacity-50"
                        title="Cancel recommendation"
                      >
                        {isCancellingRa === rec.id ? (
                          <Spinner size="xs" />
                        ) : (
                          <XCircle size={16} />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {!selectedRecommendation && (
                <p className="mt-2 text-xs italic text-customBlack/70">
                  Select a recommendation if this transaction fulfills it. You
                  can also cancel recommendations.
                </p>
              )}
            </div>
          )}

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
          {serviceType === "single" &&
            (isLoadingBranches || branches?.length > 0 || branchError) && (
              <SelectInputGroup
                label="Filter by Branch"
                name="branchFilter"
                id="branchFilter"
                onChange={handleSelectChanges}
                options={branchOptions}
                valueKey="id"
                labelKey="title"
                value={selectedBranchId}
                isLoading={isLoadingBranches}
                error={
                  formErrors.branchFilter /*|| branchError - already displayed above */
                }
              />
            )}
        </div>
        {formErrors.branchFilter && (
          <p className={inputErrorClass}>{formErrors.branchFilter}</p>
        )}

        {/* Serve Time & DateTimePicker */}
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
            error={
              formErrors.serveTime && serveTime === "later"
                ? formErrors.serveTime
                : undefined
            }
            required
          />
          {serveTime === "later" && (
            <DateTimePicker
              error={
                formErrors.date ||
                formErrors.time ||
                (formErrors.serveTime && serveTime === "later"
                  ? formErrors.serveTime
                  : undefined)
              }
            />
          )}
        </div>
        {formErrors.serveTime && serveTime === "later" && (
          <p className={inputErrorClass}>{formErrors.serveTime}</p>
        )}

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
          <VoucherInput />
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
          />
        </div>
        {formErrors.voucherCode && (
          <p className={inputErrorClass}>{formErrors.voucherCode}</p>
        )}
        {formErrors.paymentMethod && !formErrors.voucherCode && (
          <p className={inputErrorClass}>{formErrors.paymentMethod}</p>
        )}

        <div className={selectedItemsContainerClass}>
          {servicesAvailed.length > 0 ? (
            servicesAvailed.map((item) => (
              <SelectedItem key={item.id + (item.type ?? "")} {...item} />
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
      </div>
      <div className={actionButtonsContainerClass}>
        <Button
          onClick={handleCancel}
          disabled={isSubmitting || isOverallLoading || !!isCancellingRa}
          type="button"
          invert
          variant="secondary" // Example: Using a secondary variant if Button component supports it
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirmClick}
          type="button"
          disabled={
            isSubmitting ||
            isOverallLoading ||
            !!isCancellingRa ||
            !name.trim() ||
            !servicesAvailed.length ||
            !paymentMethod
          }
          variant="primary" // Example: Using a primary variant
        >
          {isSubmitting ? (
            <Spinner text="Submitting..." size="sm" />
          ) : (
            "Confirm Transaction"
          )}
        </Button>
      </div>
    </div>
  );
}
