"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";

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
} from "lucide-react";

import {
  transactionSubmission,
  getActiveDiscountRules,
  cancelRecommendedAppointmentAction,
} from "@/lib/ServerAction";
import { RootState, AppDispatch } from "@/lib/reduxStore";
import { cashierActions, CashierState } from "@/lib/Slices/CashierSlice";
import {
  fetchServices,
  fetchServiceSets,
  fetchBranches,
} from "@/lib/Slices/DataSlice";

import {
  PaymentMethod as PrismaPaymentMethod,
  Branch as PrismaBranch,
  FollowUpPolicy,
  Service as PrismaService,
  ServiceSet as PrismaServiceSet,
} from "@prisma/client";
import type {
  FetchedItem,
  UIDiscountRuleWithServices,
  CustomerWithRecommendations as CustomerData,
} from "@/lib/Types";

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

export default function CashierPage() {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { accountID: accountIdParam } = useParams();
  const accountId = Array.isArray(accountIdParam)
    ? accountIdParam[0]
    : accountIdParam;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [isCancellingRa, setIsCancellingRa] = useState<string | null>(null);
  const [cancellationError, setCancellationError] = useState<string | null>(
    null,
  );

  const {
    services,
    serviceSets,
    branches,
    itemsLoading,
    branchesLoading,
    itemsError,
    branchesError,
  } = useSelector((state: RootState) => state.data);

  const cashierForm = useSelector((state: RootState) => state.cashier);
  const {
    name,
    email,
    customerId,
    servicesAvailed,
    grandTotal,
    totalDiscount,
    subTotal,
    serviceType,
    serveTime,
    date,
    time,
    paymentMethod,
    customerRecommendations,
    selectedRecommendedAppointmentId,
    generateNewFollowUpForFulfilledRA,
    appliedDiscountRules,
  } = cashierForm;

  const isCashierDisabled =
    isSubmitting || itemsLoading || branchesLoading || !!isCancellingRa;

  useEffect(() => {
    if (!services && !itemsLoading && !itemsError) {
      dispatch(fetchServices());
    }
    if (!serviceSets && !itemsLoading && !itemsError) {
      dispatch(fetchServiceSets());
    }
    if (!branches && !branchesLoading && !branchesError) {
      dispatch(fetchBranches());
    }

    if (appliedDiscountRules.length === 0) {
      getActiveDiscountRules()
        .then((rules) => {
          if (Array.isArray(rules)) {
            dispatch(
              cashierActions.applyDiscounts({
                rules: rules as UIDiscountRuleWithServices[],
              }),
            );
          } else {
            console.warn(
              "Discount rules received in unexpected format:",
              rules,
            );
            dispatch(cashierActions.applyDiscounts({ rules: [] }));
          }
        })
        .catch((err) => {
          console.error("Failed to fetch discount rules:", err);
          setFormErrors((prev) => ({
            ...prev,
            general: "Error loading discounts. Totals might be inaccurate.",
          }));
          dispatch(cashierActions.applyDiscounts({ rules: [] }));
        });
    }

    return () => {
      dispatch(cashierActions.reset());
    };
  }, [
    dispatch,
    services,
    serviceSets,
    branches,
    appliedDiscountRules.length,
    itemsLoading,
    branchesLoading,
    itemsError,
    branchesError,
  ]);

  const handleCustomerSelectedFromInput = useCallback(
    (customer: CustomerData | null) => {
      const payload = {
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              email: customer.email,
              recommendedAppointments: customer.recommendedAppointments,
            }
          : null,
      };
      dispatch(cashierActions.setCustomerData(payload));

      setFormErrors((prev) => {
        const newState = { ...prev };
        delete newState.name;
        delete newState.email;
        return newState;
      });
    },
    [dispatch],
  );

  const handleCustomerNameInputChange = useCallback(
    (value: string) => {
      dispatch(cashierActions.setCustomerName(value));

      if (customerId !== null) {
        dispatch(cashierActions.setEmail(null));
      }

      setFormErrors((prev) => {
        const newState = { ...prev };
        delete newState.name;
        return newState;
      });
    },
    [dispatch, customerId],
  );

  const handleEmailInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;

      if (customerId === null) {
        dispatch(cashierActions.setEmail(value));

        setFormErrors((prev) => {
          const newState = { ...prev };
          delete newState.email;
          return newState;
        });
      }
    },
    [dispatch, customerId],
  );

  const handleSelectRecommendation = useCallback(
    (recommendationId: string | null) => {
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
        dispatch(cashierActions.setPaymentMethod(isPM(value) ? value : null));
      } else if (key === "branchFilter") {
        setSelectedBranchId(value || "all");
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
        selectedBranchId === "all" || !services
          ? services || []
          : (services as PrismaService[]).filter(
              (s) => s.branchId === selectedBranchId || !s.branchId,
            );
      displayItems = filteredServices.map((s: PrismaService) => ({
        id: s.id,
        title: s.title,
        price: s.price,
        type: "service" as const,
      }));
    } else if (serviceType === "set") {
      displayItems = (serviceSets || []).map((set: PrismaServiceSet) => ({
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

    if (isCashierDisabled) return;

    const serviceData = (services as PrismaService[]).find(
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
    }
  }, [
    dispatch,
    selectedRecommendation,
    services,
    itemsLoading,
    isCashierDisabled,
  ]);

  const handleCancelRecommendation = useCallback(
    async (recommendationId: string) => {
      if (isCashierDisabled) return;

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
            dispatch(cashierActions.setSelectedRecommendedAppointmentId(null));
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
    [dispatch, selectedRecommendedAppointmentId, isCashierDisabled],
  );

  const handleConfirmClick = async () => {
    if (isCashierDisabled) return;

    setIsSubmitting(true);
    setFormErrors({});
    let localErrors: Record<string, string> = {};

    if (!cashierForm.name.trim()) localErrors.name = "Customer name required.";
    if (!servicesAvailed.length)
      localErrors.servicesAvailed = "Select at least one service.";
    if (!paymentMethod) localErrors.paymentMethod = "Payment method required.";
    if (serveTime === "later" && (!date || !time)) {
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
      const response = await transactionSubmission(cashierForm);
      setIsSubmitting(false);
      if (response.success) {
        dispatch(cashierActions.reset());
        router.push(`/${accountId}/transactions`);
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
    if (isCashierDisabled && !isSubmitting) return;

    dispatch(cashierActions.reset());
    router.push(`/${accountId}`);
  };

  const isEmailInputDisabledByCustomer = customerId !== null;

  const inputErrorClass = "mt-1 text-xs text-red-500 px-1";
  const selectedItemsContainerClass =
    "relative mt-4 max-h-[200px] min-h-[80px] w-full overflow-y-auto rounded-md border border-customGray/50 bg-white p-2 shadow-sm";
  const noItemsMessageClass =
    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform whitespace-nowrap text-sm italic text-gray-400";
  const totalsContainerClass = "mt-4 flex w-full flex-col text-sm";
  const grandTotalClass = "mt-1 text-base font-semibold";
  const actionButtonsContainerClass =
    "mt-auto flex w-full flex-shrink-0 justify-around border-t border-customGray/30 bg-customOffWhite p-4 shadow-inner";

  return (
    <div className="flex h-full flex-col bg-customOffWhite">
      {/* Header remains active even when disabled */}
      <div className="flex flex-shrink-0 items-center border-b border-customGray bg-white p-4 shadow-sm">
        <button
          onClick={handleCancel}
          className="mr-4 rounded-full p-1.5 text-customGray hover:bg-customGray/20 hover:text-customBlack focus:outline-none focus:ring-1 focus:ring-customDarkPink disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Cancel and Go Back"
          disabled={isCashierDisabled && !isSubmitting}
        >
          <ChevronLeft size={22} />
        </button>
        <h1 className="flex items-center text-lg font-semibold text-customBlack">
          <Receipt size={18} className="mr-2 text-customDarkPink" />
          New Transaction
        </h1>
      </div>
      {/* Overall Loading/Submitting/Cancelling Spinner */}
      {(isSubmitting || !!isCancellingRa) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-customOffWhite/70 backdrop-blur-sm">
          <Spinner text={isSubmitting ? "Submitting..." : "Cancelling..."} />
        </div>
      )}
      {/* Data Loading Indicator (Separate spinner for initial data fetch) */}
      {(itemsLoading || branchesLoading) &&
        !isSubmitting &&
        !isCancellingRa && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-customOffWhite/70 backdrop-blur-sm">
            <Spinner text="Loading data..." />
          </div>
        )}

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
        {branchesError && !branchesLoading && (
          <div className="flex items-center gap-2 rounded border border-amber-400 bg-amber-50 p-2 text-sm font-medium text-amber-700">
            <AlertCircle size={16} />
            <span>{branchesError}</span>
          </div>
        )}

        <div className="w-full">
          <CustomerInput
            error={formErrors.name}
            initialValue={name}
            onCustomerSelect={handleCustomerSelectedFromInput}
            onInputChange={handleCustomerNameInputChange}
            disabled={isCashierDisabled}
          />
          {formErrors.name && (
            <p className={inputErrorClass}>{formErrors.name}</p>
          )}
        </div>

        <div className="w-full">
          <div className="relative w-full">
            <input
              value={email ?? ""}
              onChange={handleEmailInputChange}
              placeholder=" "
              type="email"
              id="email-input"
              disabled={isEmailInputDisabledByCustomer || isCashierDisabled}
              className={`peer relative z-0 h-[50px] w-full rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-customGray"} bg-white px-3 pt-1 shadow-sm outline-none transition-colors duration-150 focus:border-customDarkPink disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100`}
              aria-invalid={!!formErrors.email}
              aria-describedby={formErrors.email ? "email-error" : undefined}
            />
            <label
              htmlFor="email-input"
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform bg-customOffWhite px-1 text-base font-medium transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${formErrors.email ? "text-red-600" : isEmailInputDisabledByCustomer || isCashierDisabled ? "text-gray-400" : "text-gray-500"} peer-focus:${formErrors.email ? "text-red-600" : "text-customDarkPink"} ${isEmailInputDisabledByCustomer || isCashierDisabled ? "cursor-not-allowed" : "cursor-text"}`}
            >
              E-mail{" "}
              {(customerId === null || email?.trim()) && customerId === null
                ? "*"
                : "(From selected customer)"}
            </label>
          </div>
          {formErrors.email && (
            <p className={inputErrorClass} id="email-error">
              {formErrors.email}
            </p>
          )}
          {customerId === null && (
            <p className="mt-1 px-1 text-xs text-gray-500">
              Required for new customers.
            </p>
          )}
        </div>

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
                        <span className="ml-0 mt-1 inline-block rounded-full bg-customLightBlue px-2 py-0.5 text-xs text-customBlack/80 sm:ml-2 sm:mt-0">
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
                      {selectedRecommendation.originatingServiceId &&
                        !itemsLoading && (
                          <button
                            onClick={handleAddRecommendedServiceToCart}
                            disabled={isCashierDisabled || itemsLoading}
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
                        disabled={isCashierDisabled}
                        className="flex-shrink-0 rounded border border-customDarkPink px-3 py-1 text-xs font-semibold text-customDarkPink hover:bg-customDarkPink hover:text-white active:bg-customDarkPink/90 disabled:opacity-50"
                        title="Change selected recommendation"
                      >
                        Change
                      </button>
                      <button
                        onClick={() =>
                          handleCancelRecommendation(selectedRecommendation.id)
                        }
                        disabled={isCashierDisabled}
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
                            isCashierDisabled ||
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
                      onClick={() => {
                        if (!isCashierDisabled)
                          handleSelectRecommendation(rec.id);
                      }}
                      className={`flex cursor-pointer items-center justify-between rounded-md border border-customGray/50 bg-white p-2 text-sm text-customBlack shadow-sm ${isCashierDisabled ? "cursor-not-allowed opacity-60" : "hover:border-customLightBlue hover:bg-white"}`}
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
                        disabled={isCashierDisabled}
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
            disabled={isCashierDisabled}
          />
          {serviceType === "single" &&
            (branchesLoading ||
              (branches && branches.length > 0) ||
              branchesError) && (
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
                error={formErrors.branchFilter}
                disabled={isCashierDisabled}
              />
            )}
        </div>
        {formErrors.branchFilter && (
          <p className={inputErrorClass}>{formErrors.branchFilter}</p>
        )}

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
            disabled={isCashierDisabled}
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
              disabled={isCashierDisabled}
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
            disabled={isCashierDisabled}
          />
          {formErrors.servicesAvailed && (
            <p className={inputErrorClass}>{formErrors.servicesAvailed}</p>
          )}
          {itemsError && <p className={inputErrorClass}>{itemsError}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <VoucherInput disabled={isCashierDisabled} />
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
            disabled={isCashierDisabled}
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
              <SelectedItem
                key={item.id + (item.type ?? "")}
                {...item}
                disabled={isCashierDisabled}
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
      <div className={actionButtonsContainerClass}>
        <Button
          onClick={handleCancel}
          disabled={isCashierDisabled && !isSubmitting}
          type="button"
          invert
          variant="secondary"
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirmClick}
          type="button"
          disabled={
            isCashierDisabled ||
            !name.trim() ||
            !servicesAvailed.length ||
            !paymentMethod ||
            (serveTime === "later" && (!date || !time))
          }
          variant="primary"
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
