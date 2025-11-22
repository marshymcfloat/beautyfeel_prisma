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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ChevronLeft,
  Receipt,
  Tag,
  XCircle,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

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
  setServices,
  setServiceSets,
  setBranches,
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

// Confirmation Dialog Component
const ConfirmCancelRecommendationDialog: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  serviceTitle?: string;
}> = ({ isOpen, onClose, onConfirm, serviceTitle }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Cancel Recommended Appointment</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel this recommended appointment
            {serviceTitle ? ` for ${serviceTitle}` : ""}? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Keep
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Cancel Appointment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

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
  const [showCancelConfirmDialog, setShowCancelConfirmDialog] = useState(false);
  const [recommendationToCancel, setRecommendationToCancel] = useState<{
    id: string;
    title?: string;
  } | null>(null);

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
    serviceType,
    serveTime,
    date,
    time,
    paymentMethod,
    servicesAvailed,
    selectedRecommendedAppointmentId,
  } = cashierForm;

  const customerRecommendations = useMemo(() => {
    if (!cashierForm.customerRecommendations) return null;
    return cashierForm.customerRecommendations.filter(
      (rec) => rec.status === "RECOMMENDED",
    );
  }, [cashierForm.customerRecommendations]);

  const isCashierDisabled =
    isSubmitting || itemsLoading || branchesLoading || !!isCancellingRa;

  // Initialize Redux store with server data if not already loaded
  useEffect(() => {
    if (!services && !itemsLoading && !itemsError && initialServices.length > 0) {
      dispatch(setServices(initialServices));
    }
  }, [dispatch, services, itemsLoading, itemsError, initialServices]);

  useEffect(() => {
    if (
      !serviceSets &&
      !itemsLoading &&
      !itemsError &&
      initialServiceSets.length > 0
    ) {
      dispatch(setServiceSets(initialServiceSets));
    }
  }, [dispatch, serviceSets, itemsLoading, itemsError, initialServiceSets]);

  useEffect(() => {
    if (!branches && !branchesLoading && !branchesError && initialBranches.length > 0) {
      dispatch(setBranches(initialBranches));
    }
  }, [
    dispatch,
    branches,
    branchesLoading,
    branchesError,
    initialBranches,
  ]);

  useEffect(() => {
    if (initialDiscountRules.length > 0) {
      dispatch(cashierActions.setDiscountRules(initialDiscountRules));
    }
  }, [dispatch, initialDiscountRules]);

  const subTotal = useMemo(() => {
    return servicesAvailed.reduce(
      (sum, item) => sum + item.originalPrice * item.quantity,
      0,
    );
  }, [servicesAvailed]);

  const totalDiscount = useMemo(() => {
    return servicesAvailed.reduce(
      (sum, item) => sum + (item.discountApplied || 0) * item.quantity,
      0,
    );
  }, [servicesAvailed]);

  const grandTotal = useMemo(() => {
    const voucherDiscount =
      cashierForm.voucherCode && cashierForm.voucherDiscountValue > 0
        ? cashierForm.voucherDiscountValue
        : 0;
    return Math.max(0, subTotal - totalDiscount - voucherDiscount);
  }, [
    subTotal,
    totalDiscount,
    cashierForm.voucherCode,
    cashierForm.voucherDiscountValue,
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
      toast.success("Service added to cart", {
        description: `${serviceData.title} has been added to your cart.`,
      });
    } else {
      toast.error("Service not found", {
        description: "The recommended service could not be found.",
      });
    }
  }, [
    dispatch,
    selectedRecommendation,
    services,
    itemsLoading,
    isCashierDisabled,
  ]);

  const handleCancelRecommendationClick = useCallback(
    (recommendationId: string) => {
      if (isCashierDisabled) return;

      const recommendation = customerRecommendations?.find(
        (rec) => rec.id === recommendationId,
      );
      setRecommendationToCancel({
        id: recommendationId,
        title: recommendation?.originatingService?.title,
      });
      setShowCancelConfirmDialog(true);
    },
    [customerRecommendations, isCashierDisabled],
  );

  const handleCancelRecommendationConfirm = useCallback(async () => {
    if (!recommendationToCancel) return;

    setIsCancellingRa(recommendationToCancel.id);
    setCancellationError(null);
    setShowCancelConfirmDialog(false);

    try {
      const result =
        await cancelRecommendedAppointmentAction(recommendationToCancel.id);
      if (result.success) {
        dispatch(cashierActions.removeRecommendation(recommendationToCancel.id));
        if (selectedRecommendedAppointmentId === recommendationToCancel.id) {
          dispatch(cashierActions.setSelectedRecommendedAppointmentId(null));
        }
        toast.success("Appointment cancelled", {
          description: "The recommended appointment has been cancelled.",
        });
      } else {
        const errorMsg = result.message || "Failed to cancel recommendation.";
        setCancellationError(errorMsg);
        toast.error("Failed to cancel appointment", {
          description: errorMsg,
        });
      }
    } catch (e: any) {
      const errorMsg = e.message || "Error cancelling recommendation.";
      setCancellationError(errorMsg);
      toast.error("Failed to cancel appointment", {
        description: errorMsg,
      });
    } finally {
      setIsCancellingRa(null);
      setRecommendationToCancel(null);
    }
  }, [dispatch, recommendationToCancel, selectedRecommendedAppointmentId]);

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
      toast.error("Validation failed", {
        description: "Please correct the errors in the form.",
      });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await transactionSubmission(cashierForm);
      setIsSubmitting(false);
      if (response.success) {
        toast.success("Transaction created successfully", {
          description: `Transaction has been created. Redirecting...`,
        });
        dispatch(cashierActions.reset());
        // Small delay to show the toast before redirecting
        setTimeout(() => {
          router.push(`/${accountId}`);
        }, 1000);
      } else {
        const clientErrors: Record<string, string> = {};
        if (response.errors) {
          for (const key in response.errors) {
            clientErrors[key] = Array.isArray(response.errors[key])
              ? (response.errors[key] as string[]).join("; ")
              : String(response.errors[key]);
          }
        }
        const errorMessage =
          response.message || "Submission failed. Please review the details.";
        setFormErrors({
          general: errorMessage,
          ...clientErrors,
        });
        toast.error("Transaction failed", {
          description: errorMessage,
        });
      }
    } catch (e: any) {
      const errorMessage =
        e.message || "An unexpected error occurred during submission.";
      setFormErrors({
        general: errorMessage,
      });
      toast.error("Transaction failed", {
        description: errorMessage,
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
    <>
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
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle size={16} />
              <span>{itemsError || branchesError}</span>
            </div>
          )}

          {formErrors.general && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle size={16} />
              <span>{formErrors.general}</span>
            </div>
          )}

          {cancellationError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
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
                      <Button
                        onClick={() => handleSelectRecommendation(rec.id)}
                        disabled={isCashierDisabled || !!isCancellingRa}
                        variant={
                          selectedRecommendedAppointmentId === rec.id
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                      >
                        Select
                      </Button>
                      <Button
                        onClick={() => handleCancelRecommendationClick(rec.id)}
                        disabled={isCashierDisabled || isCancellingRa === rec.id}
                        variant="destructive"
                        size="sm"
                      >
                        {isCancellingRa === rec.id ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Cancelling...
                          </>
                        ) : (
                          "Cancel"
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              {selectedRecommendation && (
                <Button
                  onClick={handleAddRecommendedServiceToCart}
                  disabled={isCashierDisabled}
                  className="mt-2 w-full"
                >
                  Add {selectedRecommendation.originatingService?.title || "Service"} to Cart
                </Button>
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
                  id={item.id}
                  name={item.name}
                  quantity={item.quantity}
                  originalPrice={item.originalPrice}
                  discountApplied={item.discountApplied}
                  type={item.type}
                  disabled={isCashierDisabled}
                />
              ))
            )}
          </div>

          <VoucherInput disabled={isCashierDisabled} />

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
            <Button onClick={handleCancel} variant="outline" disabled={isCashierDisabled}>
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
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Confirm Transaction
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog for Cancelling Recommendation */}
      <ConfirmCancelRecommendationDialog
        isOpen={showCancelConfirmDialog}
        onClose={() => {
          setShowCancelConfirmDialog(false);
          setRecommendationToCancel(null);
        }}
        onConfirm={handleCancelRecommendationConfirm}
        serviceTitle={recommendationToCancel?.title}
      />
    </>
  );
}
