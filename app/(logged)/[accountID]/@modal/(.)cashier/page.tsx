// app/(logged)/[accountID]/@modal/(.)cashier/page.tsx
"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useParams, useRouter } from "next/navigation";

import Modal from "@/components/Dialog/Modal"; // Adjust path
import DialogTitle from "@/components/Dialog/DialogTitle"; // Adjust path
import Spinner from "@/components/ui/Spinner"; // Adjust path
import DateTimePicker from "@/components/Inputs/DateTimePicker"; // Adjust path
import SelectInputGroup from "@/components/Inputs/SelectInputGroup"; // Adjust path
import ServicesSelect from "@/components/Inputs/ServicesSelect"; // Adjust path
import CustomerInput from "@/components/Inputs/CustomerInput"; // Adjust path
import VoucherInput from "@/components/Inputs/VoucherInput"; // Adjust path
import SelectedItem from "@/components/ui/cashier/SelectedItem"; // Adjust path
import Button from "@/components/Buttons/Button"; // Adjust path
import { AlertCircle, Tag, XCircle, HelpCircle } from "lucide-react";
import {
  transactionSubmission,
  getActiveDiscountRules,
  getAllBranches,
  cancelRecommendedAppointmentAction,
} from "@/lib/ServerAction"; // Adjust path
import { RootState, AppDispatch } from "@/lib/reduxStore"; // Adjust path
import { cashierActions, CashierState } from "@/lib/Slices/CashierSlice"; // Adjust path
import { fetchServices, fetchServiceSets } from "@/lib/Slices/DataSlice"; // Adjust path
import {
  PaymentMethod as PrismaPaymentMethod, // Renamed to avoid conflict
  Branch,
  FollowUpPolicy,
  RecommendedAppointmentStatus,
  Status,
} from "@prisma/client";
import type {
  RecommendedAppointmentData,
  FetchedItem,
  UIDiscountRuleWithServices,
  TransactionSubmissionResponse,
  CustomerWithRecommendations as CustomerData, // Import the type for the callback
} from "@/lib/Types"; // Adjust path

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
  title: pm.charAt(0).toUpperCase() + pm.slice(1), // Simple title case
}));

// --- Styling Classes (as previously defined) ---
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>("all");
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [branchError, setBranchError] = useState<string | null>(null);
  const [isCancellingRa, setIsCancellingRa] = useState<string | null>(null);
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
    name, // Use this name for the initialValue prop of CustomerInput
    email,
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
  } = cashierForm;

  const isOverallLoading = itemsLoading || isLoadingBranches;

  // Effect for initial data fetching and cleanup
  useEffect(() => {
    dispatch(fetchServices());
    dispatch(fetchServiceSets());
    getActiveDiscountRules()
      .then((rules) =>
        dispatch(
          cashierActions.applyDiscounts({
            rules: Array.isArray(rules)
              ? (rules as UIDiscountRuleWithServices[])
              : [],
          }),
        ),
      )
      .catch(() => dispatch(cashierActions.applyDiscounts({ rules: [] })));
    setIsLoadingBranches(true);
    setBranchError(null);
    getAllBranches()
      .then((fetchedBranches) => {
        setBranches(fetchedBranches);
        setIsLoadingBranches(false);
      })
      .catch(() => {
        setBranchError("Could not load branches.");
        setBranches([]);
        setIsLoadingBranches(false);
      });

    return () => {
      dispatch(cashierActions.reset());
    };
  }, [dispatch]);

  // --- Callbacks for UI interactions ---

  // --- NEW: Callback for CustomerInput ---
  const handleCustomerSelectedFromInput = useCallback(
    (customer: CustomerData | null) => {
      if (customer) {
        dispatch(
          cashierActions.setCustomerData({
            customer: {
              id: customer.id,
              name: customer.name,
              email: customer.email,
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
  // --- END NEW ---

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
    if (branches?.length)
      options.push(...branches.map((b) => ({ id: b.id, title: b.title })));
    return options;
  }, [branches]);

  const itemsToDisplay = useMemo((): FetchedItem[] => {
    if (itemsLoading || !services || !serviceSets) return [];
    let displayItems: FetchedItem[] = [];
    if (serviceType === "single") {
      const filteredServices =
        selectedBranchId === "all"
          ? services
          : services.filter((s) => s.branchId === selectedBranchId);
      displayItems = filteredServices.map((s) => ({
        id: s.id,
        title: s.title,
        price: s.price,
        type: "service",
      }));
    } else if (serviceType === "set") {
      displayItems = serviceSets.map((set) => ({
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
      (s) => s.id === selectedRecommendation.originatingService!.id,
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
    // Read directly from cashierForm state for validation
    if (!cashierForm.name.trim()) localErrors.name = "Customer name required.";
    if (!servicesAvailed.length)
      localErrors.servicesAvailed = "Select at least one service.";
    if (!paymentMethod) localErrors.paymentMethod = "Payment method required.";
    if (serveTime === "later" && (!date || !time))
      localErrors.serveTime = "Date/Time required for later.";
    if (
      email &&
      email.trim() &&
      !/^[\w-]+(\.[\w-]+)*@([\w-]+\.)+[a-zA-Z]{2,7}$/.test(email.trim())
    )
      localErrors.email = "Invalid email format.";

    if (Object.keys(localErrors).length > 0) {
      setFormErrors({ general: "Please correct the errors.", ...localErrors });
      setIsSubmitting(false);
      return;
    }

    try {
      // Pass the whole state object from Redux
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

  // --- JSX Structure ---
  return (
    <Modal
      isOpen={true}
      onClose={handleCancel}
      title={<DialogTitle>Beautyfeel Transaction</DialogTitle>}
      containerClassName="relative m-auto max-h-[90vh] w-full max-w-xl overflow-hidden rounded-lg bg-customOffWhite shadow-xl flex flex-col"
    >
      {/* Modal Content */}
      <div className="flex-grow space-y-5 overflow-y-auto p-4 sm:p-6">
        {isOverallLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-customOffWhite/70 backdrop-blur-sm">
            <Spinner text="Loading..." />
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

        {/* Customer Input */}
        <div className="w-full">
          {/* --- MODIFIED: Pass props to CustomerInput --- */}
          <CustomerInput
            error={formErrors.name}
            initialValue={name} // Pass current name from Redux state
            onCustomerSelect={handleCustomerSelectedFromInput} // Pass the handler
          />
          {/* --- END MODIFIED --- */}
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
              className={`peer relative z-0 h-[50px] w-full rounded-md border-2 ${formErrors.email ? "border-red-500" : "border-gray-300"} px-3 pt-1 shadow-sm outline-none transition-colors duration-150 focus:border-customDarkPink`}
            />
            <label
              htmlFor="email-input"
              className={`pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 transform bg-customOffWhite px-1 text-base font-medium transition-all duration-150 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-focus:top-0 peer-focus:z-10 peer-focus:-translate-y-1/2 peer-focus:text-xs peer-[:not(:placeholder-shown)]:top-0 peer-[:not(:placeholder-shown)]:z-10 peer-[:not(:placeholder-shown)]:-translate-y-1/2 peer-[:not(:placeholder-shown)]:text-xs ${formErrors.email ? "text-red-600" : "text-gray-500"} peer-focus:${formErrors.email ? "text-red-600" : "text-customDarkPink"}`}
            >
              E-mail (Optional)
            </label>
          </div>
          {formErrors.email && (
            <p className={inputErrorClass}>{formErrors.email}</p>
          )}
        </div>

        {/* Recommended Appointments Section - Fully Restored */}
        {name.trim() && customerRecommendations.length > 0 && (
          <div className="w-full rounded-md border border-customLightBlue bg-customWhiteBlue p-3">
            <h3 className="mb-3 flex items-center text-sm font-semibold text-customDarkPink">
              <Tag size={16} className="mr-1" /> Potential Follow-up
              Recommendations for {name.split(" ")[0]}:
            </h3>
            {selectedRecommendation ? (
              <div className="rounded-md border border-customLightBlue bg-white p-3 text-sm text-customBlack shadow-inner">
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
                      <span className="ml-2 rounded-full bg-customLightBlue px-2 py-0.5 text-xs text-customBlack">
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
                          disabled={
                            isSubmitting || itemsLoading || !!isCancellingRa
                          }
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
                      disabled={isSubmitting || !!isCancellingRa}
                      className="flex-shrink-0 rounded border border-customDarkPink px-3 py-1 text-xs font-semibold text-customDarkPink hover:bg-customDarkPink hover:text-white disabled:opacity-50"
                      title="Change selected recommendation"
                    >
                      Change
                    </button>
                    <button
                      onClick={() =>
                        handleCancelRecommendation(selectedRecommendation.id)
                      }
                      disabled={isSubmitting || !!isCancellingRa}
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
                          isSubmitting ||
                          !!isCancellingRa ||
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
                      disabled={isSubmitting || !!isCancellingRa}
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

        {/* Service Type & Branch Filter */}
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
                error={formErrors.branchFilter || branchError || undefined}
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
            error={formErrors.serveTime}
            required
          />
          {serveTime === "later" && (
            <DateTimePicker
              error={formErrors.date || formErrors.time || formErrors.serveTime}
            />
          )}
        </div>

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

        {/* Selected Items Display */}
        <div className={selectedItemsContainerClass}>
          {servicesAvailed.length > 0 ? (
            servicesAvailed.map((item) => (
              <SelectedItem key={item.id + item.type} {...item} />
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
      {/* End Modal Content Scrollable Area */}
      {/* Action Buttons (Modal Footer) */}
      <div className={`flex-shrink-0 ${actionButtonsClass}`}>
        <Button
          onClick={handleCancel}
          // Restore original disabled logic
          disabled={isSubmitting || isOverallLoading || !!isCancellingRa}
          type="button"
          invert
        >
          Cancel
        </Button>
        <Button
          onClick={handleConfirmClick}
          type="button"
          // Restore original disabled logic, checking Redux name state
          disabled={
            isSubmitting ||
            isOverallLoading ||
            !!isCancellingRa ||
            !name.trim() || // Check name from Redux state
            !servicesAvailed.length ||
            !paymentMethod
          }
        >
          {isSubmitting ? "Submitting..." : "Confirm Transaction"}
        </Button>
      </div>
    </Modal>
  );
}
