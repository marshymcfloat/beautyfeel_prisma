"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { useSelector, useDispatch } from "react-redux";
import { useRouter } from "next/navigation";

import Modal from "@/components/Dialog/Modal";
import DialogTitle from "@/components/Dialog/DialogTitle";
import Spinner from "@/components/ui/Spinner";
import DateTimePicker from "@/components/Inputs/DateTimePicker";
import SelectInputGroup from "@/components/Inputs/SelectInputGroup";
import ServicesSelect from "@/components/Inputs/ServicesSelect";
import CustomerInput from "@/components/Inputs/CustomerInput";
import VoucherInput from "@/components/Inputs/VoucherInput";
import SelectedItem from "@/components/ui/cashier/SelectedItem";
import Button from "@/components/Buttons/Button";
import { AlertCircle, Tag, XCircle, HelpCircle } from "lucide-react";
import {
  transactionSubmission,
  getActiveDiscountRules,
  cancelRecommendedAppointmentAction,
} from "@/lib/ServerAction";

import { RootState, AppDispatch } from "@/lib/reduxStore";
import {
  cashierActions,
  CashierState,
  SetCustomerDataPayload,
} from "@/lib/Slices/CashierSlice";
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

  const hasFetchedRules = useRef(false);

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

  const isOverallLoading = itemsLoading || branchesLoading;
  const isAnyProcessLoading =
    isSubmitting || isOverallLoading || !!isCancellingRa;

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

    if (!hasFetchedRules.current) {
      console.log("Attempting to fetch active discount rules...");
      hasFetchedRules.current = true;
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
        })
        .catch((e) => {
          console.error("Error fetching rules:", e);

          dispatch(cashierActions.applyDiscounts({ rules: [] }));
        });
    }

    return () => {
      dispatch(cashierActions.reset());
      hasFetchedRules.current = false;
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
  ]);

  const handleCustomerSelected = useCallback(
    (customer: CustomerData | null) => {
      const payload: SetCustomerDataPayload = {
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
    // <-- Keep this function, but remove the customerId check inside
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow setting email regardless of customerId status
      dispatch(cashierActions.setEmail(value || null)); // Set to null if value is empty string or null
      setFormErrors((prev) => {
        const newState = { ...prev };
        delete newState.email;
        return newState;
      });
    },
    [dispatch],
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
      dispatch(
        cashierActions.selectItem({
          id: serviceData.id,
          title: serviceData.title,
          price: serviceData.price,
          type: "service",
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

    // Name is still required
    if (!name.trim()) localErrors.name = "Customer name required.";

    // *** REMOVE the old email requirement check: ***
    // if (customerId === null && (!email || !email.trim())) {
    //   localErrors.email = "Email is required for new customers.";
    // }

    // *** KEEP the email format validation if email IS provided: ***
    if (
      email &&
      email.trim() &&
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email.trim())
    ) {
      localErrors.email = "Invalid email format.";
    }

    // Services are still required
    if (!servicesAvailed.length)
      localErrors.servicesAvailed = "Select at least one service.";
    // Payment method is still required
    if (!paymentMethod) localErrors.paymentMethod = "Payment method required.";
    // Date/time required for later booking
    if (serveTime === "later" && (!date || !time))
      localErrors.serveTime = "Date and time required for later booking.";

    if (Object.keys(localErrors).length > 0) {
      setFormErrors({ general: "Please correct the errors.", ...localErrors });
      setIsSubmitting(false);
      return;
    }

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

  const isEmailInputDisabled = customerId !== null;

  return (
    <Modal
      isOpen={true}
      onClose={handleCancel}
      title={<DialogTitle>Beautyfeel Transaction</DialogTitle>}
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-xl overflow-hidden rounded-lg bg-customOffWhite shadow-xl flex flex-col"
    >
      <div className="flex-grow space-y-5 overflow-y-auto p-4 sm:p-6">
        {isAnyProcessLoading && (
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
            error={formErrors.name}
            initialValue={name}
            onCustomerSelect={handleCustomerSelected}
            onInputChange={handleCustomerNameInputChange}
            disabled={isAnyProcessLoading}
          />
          {formErrors.name && (
            <p className={inputErrorClass}>{formErrors.name}</p>
          )}
        </div>

        <div className="w-full">
          <div className="relative w-full">
            <input
              value={email ?? ""} // Use ?? "" to handle null gracefully
              onChange={handleEmailInputChange}
              placeholder=" " // Required for the label animation
              type="email"
              id="email-input"
              disabled={isAnyProcessLoading}
              className={`peer relative z-0 h-[50px] w-full rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-gray-300"} px-3 pt-1 shadow-sm outline-none transition-colors duration-150 focus:border-customDarkPink disabled:cursor-not-allowed disabled:bg-gray-100`}
              aria-invalid={!!formErrors.email}
              aria-describedby={formErrors.email ? "email-error" : undefined}
            />
            <label
              htmlFor="email-input"
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform bg-white px-1 text-base font-medium transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${formErrors.email ? "text-red-600" : customerId !== null && email ? "text-gray-400" : "text-gray-500"} peer-focus:${formErrors.email ? "text-red-600" : "text-customDarkPink"} ${customerId !== null && email ? "cursor-not-allowed" : "cursor-text"}`} // Adjust label color/cursor for pre-filled email if desired
            >
              E-mail{" "}
              {customerId !== null ? "(From selected customer)" : "(Optional)"}
            </label>
          </div>
          {formErrors.email && (
            <p className={inputErrorClass} id="email-error">
              {formErrors.email}
            </p>
          )}
          {/* Optional hint text (can remove if label is sufficient) */}
          {/* {customerId === null && (
            <p className="mt-1 px-1 text-xs text-gray-500">
              Optional. Providing an email allows for customer profile creation.
            </p>
          )} */}
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
                          disabled={isAnyProcessLoading}
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
                      disabled={isAnyProcessLoading}
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
                      disabled={isAnyProcessLoading}
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
                          isAnyProcessLoading ||
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
                        e.stopPropagation();
                        handleCancelRecommendation(rec.id);
                      }}
                      disabled={isAnyProcessLoading}
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
            disabled={isAnyProcessLoading}
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
                error={formErrors.branchFilter || branchesError || undefined}
                disabled={isAnyProcessLoading}
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
            disabled={isAnyProcessLoading}
          />
          {serveTime === "later" && (
            <DateTimePicker
              error={formErrors.date || formErrors.time || formErrors.serveTime}
              disabled={isAnyProcessLoading}
            />
          )}
          {formErrors.serveTime && (
            <p className={inputErrorClass}>{formErrors.serveTime}</p>
          )}
        </div>

        {/* Services/Sets Select Input */}
        <div className="w-full">
          <ServicesSelect
            isLoading={itemsLoading}
            data={itemsToDisplay}
            error={formErrors.servicesAvailed || itemsError || undefined}
            disabled={isAnyProcessLoading}
          />
          {formErrors.servicesAvailed && (
            <p className={inputErrorClass}>{formErrors.servicesAvailed}</p>
          )}
          {itemsError && <p className={inputErrorClass}>{itemsError}</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <VoucherInput disabled={isAnyProcessLoading} />
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
            disabled={isAnyProcessLoading}
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
                disabled={isAnyProcessLoading}
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
            isAnyProcessLoading ||
            !name.trim() || // Name is required
            // Email format check if email is provided (removed the requirement for new customers)
            (email &&
              email.trim() &&
              !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(
                email.trim(),
              )) ||
            !servicesAvailed.length || // Services required
            !paymentMethod || // Payment method required
            (serveTime === "later" && (!date || !time)) // Date/time required for later
          }
        >
          {isSubmitting ? "Submitting..." : "Confirm Transaction"}
        </Button>
      </div>
    </Modal>
  );
}
