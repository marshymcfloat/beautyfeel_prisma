"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

interface CashierClientProps {
  initialServices: PrismaService[];
  initialServiceSets: PrismaServiceSet[];
  initialBranches: PrismaBranch[];
  initialDiscountRules: UIDiscountRuleWithServices[];
  accountId: string;
}

export default function CashierClient({
  initialServices,
  initialServiceSets,
  initialBranches,
  initialDiscountRules,
  accountId,
}: CashierClientProps) {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();

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

  // Initialize Redux store with server data if not already loaded
  useEffect(() => {
    if (!services && !itemsLoading && !itemsError && initialServices.length > 0) {
      // Pre-populate Redux with server data
      dispatch(fetchServices.fulfilled(initialServices, ""));
    }
    if (!serviceSets && !itemsLoading && !itemsError && initialServiceSets.length > 0) {
      dispatch(fetchServiceSets.fulfilled(initialServiceSets, ""));
    }
    if (!branches && !branchesLoading && !branchesError && initialBranches.length > 0) {
      dispatch(fetchBranches.fulfilled(initialBranches, ""));
    }
    if (appliedDiscountRules.length === 0 && initialDiscountRules.length > 0) {
      dispatch(
        cashierActions.applyDiscounts({
          rules: initialDiscountRules,
        }),
      );
    }
  }, [
    dispatch,
    services,
    serviceSets,
    branches,
    itemsLoading,
    branchesLoading,
    itemsError,
    branchesError,
    initialServices,
    initialServiceSets,
    initialBranches,
    initialDiscountRules,
    appliedDiscountRules.length,
  ]);

  // Fallback: fetch if initial data not provided
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
        dispatch(
          cashierActions.setOriginBranchId(value === "all" ? null : value),
        );
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
        router.push(`/${accountId}`);
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
  const actionButtonsClass =
    "mt-6 flex w-full justify-around border-t border-customGray/30 pt-4";

  return (
    <div className="flex min-h-screen flex-col bg-customOffWhite p-4 sm:p-6">
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={handleCancel}
          disabled={isCashierDisabled}
          className="flex items-center gap-2 text-customDarkPink hover:text-customDarkPink/70 disabled:opacity-50"
        >
          <ChevronLeft size={20} />
          <span>Back</span>
        </button>
        <h1 className="text-2xl font-semibold text-customBlack">
          New Transaction
        </h1>
      </div>

      <div className="mx-auto w-full max-w-2xl space-y-5">
        {(itemsLoading || branchesLoading) && (
          <div className="flex items-center justify-center p-8">
            <Spinner text="Loading..." />
          </div>
        )}

        {(itemsError || branchesError) && (
          <div className="flex items-center gap-2 rounded border border-red-300 bg-red-100 p-2 text-sm font-medium text-red-600">
            <AlertCircle size={16} />
            <span>{itemsError || branchesError}</span>
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
              type="email"
              value={email || ""}
              onChange={handleEmailInputChange}
              disabled={isEmailInputDisabledByCustomer || isCashierDisabled}
              placeholder="Email (optional)"
              className="w-full rounded-md border border-customGray/50 bg-white px-3 py-2 text-sm focus:border-customDarkPink focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          {formErrors.email && (
            <p className={inputErrorClass}>{formErrors.email}</p>
          )}
        </div>

        {customerRecommendations && customerRecommendations.length > 0 && (
          <div className="w-full rounded-md border border-customGray/50 bg-white p-4">
            <h3 className="mb-2 text-sm font-semibold text-customBlack">
              Recommended Appointments
            </h3>
            <div className="space-y-2">
              {customerRecommendations.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center justify-between rounded border border-customGray/30 p-2"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {rec.originatingService?.title || "Unknown Service"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {rec.originatingService?.followUpPolicy || "NONE"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSelectRecommendation(rec.id)}
                      disabled={isCashierDisabled || !!isCancellingRa}
                      className={`rounded px-3 py-1 text-xs ${
                        selectedRecommendedAppointmentId === rec.id
                          ? "bg-customDarkPink text-white"
                          : "bg-gray-200 text-gray-700"
                      }`}
                    >
                      Select
                    </button>
                    <button
                      onClick={() => handleCancelRecommendation(rec.id)}
                      disabled={isCashierDisabled || isCancellingRa === rec.id}
                      className="rounded bg-red-100 px-3 py-1 text-xs text-red-600 hover:bg-red-200"
                    >
                      {isCancellingRa === rec.id ? "Cancelling..." : "Cancel"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {selectedRecommendation && (
              <button
                onClick={handleAddRecommendedServiceToCart}
                disabled={isCashierDisabled}
                className="mt-2 w-full rounded bg-customDarkPink px-4 py-2 text-sm text-white hover:bg-customDarkPink/90 disabled:opacity-50"
              >
                Add {selectedRecommendation.originatingService?.title || "Service"} to Cart
              </button>
            )}
          </div>
        )}

        <SelectInputGroup
          name="serviceType"
          label="Service Type"
          options={serviceTypeOptions}
          value={serviceType}
          onChange={handleSelectChanges}
          disabled={isCashierDisabled}
        />

        {serviceType === "single" && (
          <SelectInputGroup
            name="branchFilter"
            label="Branch Filter"
            options={branchOptions}
            value={selectedBranchId}
            onChange={handleSelectChanges}
            disabled={isCashierDisabled}
          />
        )}

        <ServicesSelect
          isLoading={itemsLoading}
          data={itemsToDisplay}
          error={itemsError}
          disabled={isCashierDisabled}
        />

        <div className={selectedItemsContainerClass}>
          {servicesAvailed.length === 0 ? (
            <p className={noItemsMessageClass}>No services selected</p>
          ) : (
            servicesAvailed.map((item, index) => (
              <SelectedItem
                key={`${item.id}-${index}`}
                item={item}
                onRemove={() =>
                  dispatch(cashierActions.removeItem(item.id))
                }
                onQuantityChange={(newQuantity) =>
                  dispatch(
                    cashierActions.updateItemQuantity({
                      id: item.id,
                      quantity: newQuantity,
                    }),
                  )
                }
                disabled={isCashierDisabled}
              />
            ))
          )}
        </div>

        <VoucherInput
          initialValue={cashierForm.voucherCode}
          onVoucherSelect={(voucher) => {
            dispatch(
              cashierActions.setVoucher({
                code: voucher.code,
                discountValue: voucher.discountValue,
              }),
            );
          }}
          onClear={() => {
            dispatch(cashierActions.setVoucher({ code: "", discountValue: 0 }));
          }}
          disabled={isCashierDisabled}
        />

        <SelectInputGroup
          name="serveTime"
          label="Serve Time"
          options={serveTimeOptions}
          value={serveTime}
          onChange={handleSelectChanges}
          disabled={isCashierDisabled}
        />

        {serveTime === "later" && (
          <DateTimePicker
            date={date}
            time={time}
            onDateChange={(newDate) =>
              dispatch(cashierActions.setDate(newDate))
            }
            onTimeChange={(newTime) =>
              dispatch(cashierActions.setTime(newTime))
            }
            disabled={isCashierDisabled}
            error={formErrors.serveTime}
          />
        )}

        <SelectInputGroup
          name="paymentMethod"
          label="Payment Method"
          options={paymentMethodOptions}
          value={paymentMethod || ""}
          onChange={handleSelectChanges}
          disabled={isCashierDisabled}
          error={formErrors.paymentMethod}
        />

        <div className={totalsContainerClass}>
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span>₱{subTotal.toLocaleString()}</span>
          </div>
          {totalDiscount > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Discount:</span>
              <span>-₱{totalDiscount.toLocaleString()}</span>
            </div>
          )}
          <div className={`flex justify-between ${grandTotalClass}`}>
            <span>Grand Total:</span>
            <span>₱{grandTotal.toLocaleString()}</span>
          </div>
        </div>

        <div className={actionButtonsClass}>
          <Button onClick={handleCancel} variant="secondary" disabled={isCashierDisabled}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirmClick}
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
    </div>
  );
}
