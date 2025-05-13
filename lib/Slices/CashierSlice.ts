// lib/Slices/CashierSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  DiscountType,
  PaymentMethod as PrismaPaymentMethod,
  FollowUpPolicy,
} from "@prisma/client";
import type {
  FetchedItem,
  UIDiscountRuleWithServices,
  RecommendedAppointmentData,
  AvailedItem,
} from "../Types";

// --- Define the main state shape ---
export interface CashierState {
  name: string;
  date: string;
  time: string;
  email: string | null;
  servicesAvailed: AvailedItem[];
  serviceType: "single" | "set";
  voucherCode: string;
  voucherDiscountValue: number;
  serveTime: "now" | "later";
  paymentMethod: PrismaPaymentMethod | null;
  subTotal: number;
  grandTotal: number;
  totalDiscount: number;
  appliedDiscountRules: UIDiscountRuleWithServices[];
  customerRecommendations: RecommendedAppointmentData[];
  selectedRecommendedAppointmentId: string | null;
  generateNewFollowUpForFulfilledRA: boolean;
  // Add customerId to store the ID if a customer is selected
  customerId: string | null;
}

// --- Define Payload Action Types ---
type SelectItemPayload = {
  id: string;
  title: string;
  price: number;
  type: "service" | "set";
};
type UpdateQuantityPayload = {
  id: string;
  type: "service" | "set";
  identifier: "inc" | "dec";
};
type ApplyDiscountsPayload = {
  rules: UIDiscountRuleWithServices[];
};
type SetVoucherPayload = {
  isValid: boolean;
  code: string;
  value: number;
};
// Corrected SetCustomerDataPayload to allow customer to be null
export interface SetCustomerDataPayload {
  customer: {
    id: string;
    name: string;
    email: string | null;
  } | null; // Customer object itself can be null
  recommendations: RecommendedAppointmentData[];
}

// --- Initial State ---
const initialState: CashierState = {
  name: "",
  customerId: null, // Initialize customerId
  serviceType: "single",
  serveTime: "now",
  date: "",
  time: "",
  email: null,
  servicesAvailed: [],
  voucherCode: "",
  voucherDiscountValue: 0,
  paymentMethod: null,
  subTotal: 0,
  grandTotal: 0,
  totalDiscount: 0,
  appliedDiscountRules: [],
  customerRecommendations: [],
  selectedRecommendedAppointmentId: null,
  generateNewFollowUpForFulfilledRA: false,
};

// Helper function for calculating totals
const calculateAllTotalsHelper = (state: CashierState): void => {
  let currentSubTotal = 0;
  let rulesDiscountAmount = 0;
  const now = new Date();

  const updatedAvailedItems = state.servicesAvailed.map((item) => {
    const originalItemTotalValue = item.originalPrice * item.quantity;
    currentSubTotal += originalItemTotalValue;
    let currentItemDiscount = 0;

    const applicableRule = state.appliedDiscountRules.find((rule) => {
      try {
        const ruleStartDate = new Date(rule.startDate);
        const ruleEndDateInclusive = new Date(rule.endDate);
        ruleEndDateInclusive.setHours(23, 59, 59, 999);

        if (
          isNaN(ruleStartDate.getTime()) ||
          isNaN(ruleEndDateInclusive.getTime())
        )
          return false;

        const isRuleCurrentlyActive =
          rule.isActive && ruleStartDate <= now && ruleEndDateInclusive >= now;
        if (!isRuleCurrentlyActive) return false;

        const appliesToThisSpecificServiceItem =
          !rule.applyToAll &&
          rule.services?.some(
            (s) => s.id === item.id && item.type === "service",
          );
        return rule.applyToAll || appliesToThisSpecificServiceItem;
      } catch (e) {
        console.error(
          "Error processing rule date in calculateAllTotalsHelper:",
          rule,
          e,
        );
        return false;
      }
    });

    if (applicableRule) {
      if (applicableRule.discountType === DiscountType.PERCENTAGE) {
        currentItemDiscount =
          originalItemTotalValue * (Number(applicableRule.discountValue) / 100);
      } else {
        currentItemDiscount =
          Number(applicableRule.discountValue) * item.quantity;
        currentItemDiscount = Math.min(
          currentItemDiscount,
          originalItemTotalValue,
        );
      }
    }
    rulesDiscountAmount += currentItemDiscount;
    return { ...item, discountApplied: currentItemDiscount };
  });
  state.servicesAvailed = updatedAvailedItems;

  let currentVoucherDiscountAmount = 0;
  if (state.voucherCode && state.voucherDiscountValue > 0) {
    const totalAfterItemRules = currentSubTotal - rulesDiscountAmount;
    currentVoucherDiscountAmount = Math.min(
      state.voucherDiscountValue,
      Math.max(0, totalAfterItemRules),
    );
  }

  const finalTotalDiscountApplied =
    rulesDiscountAmount + currentVoucherDiscountAmount;
  const finalGrandTotalValue = currentSubTotal - finalTotalDiscountApplied;

  state.subTotal = currentSubTotal;
  state.totalDiscount = finalTotalDiscountApplied;
  state.grandTotal = Math.max(0, finalGrandTotalValue);
};

// --- Create the Slice ---
export const CashierSlice = createSlice({
  name: "cashier",
  initialState,
  reducers: {
    setCustomerName(state, action: PayloadAction<string>) {
      state.name = action.payload;
      if (!action.payload) {
        state.customerId = null; // Clear customerId if name is cleared
        state.email = null;
        state.customerRecommendations = [];
        state.selectedRecommendedAppointmentId = null;
        state.generateNewFollowUpForFulfilledRA = false;
      }
      // If a name is set, but there's no customerId, it means it's a new customer being typed
      // We might not want to clear recommendations if a customer was previously selected
      // and then the cashier types a new name. This logic might need refinement based on exact UX.
    },
    setEmail(state, action: PayloadAction<string | null>) {
      state.email = action.payload;
    },
    setCustomerData(state, action: PayloadAction<SetCustomerDataPayload>) {
      // This is the corrected part
      if (action.payload.customer) {
        // If a customer object is provided
        state.customerId = action.payload.customer.id;
        state.name = action.payload.customer.name;
        state.email = action.payload.customer.email;
      } else {
        // If action.payload.customer is null (customer cleared)
        state.customerId = null;
        state.name = ""; // Reset name to empty or initial
        state.email = null; // Reset email
      }
      state.customerRecommendations = action.payload.recommendations || [];
      state.selectedRecommendedAppointmentId = null;
      state.generateNewFollowUpForFulfilledRA = false;
    },
    setServiceType(state, action: PayloadAction<"single" | "set">) {
      if (state.serviceType !== action.payload) {
        state.serviceType = action.payload;
      }
    },
    setServeTime(state, action: PayloadAction<"now" | "later">) {
      state.serveTime = action.payload;
      if (action.payload === "now") {
        state.date = "";
        state.time = "";
      }
    },
    setPaymentMethod(state, action: PayloadAction<PrismaPaymentMethod | null>) {
      state.paymentMethod = action.payload;
    },
    setDateTime(state, action: PayloadAction<{ date: string; time: string }>) {
      state.date = action.payload.date;
      state.time = action.payload.time;
    },
    setSelectedRecommendedAppointmentId(
      state,
      action: PayloadAction<string | null>,
    ) {
      state.selectedRecommendedAppointmentId = action.payload;
      if (action.payload) {
        const selectedRec = state.customerRecommendations.find(
          (r) => r.id === action.payload,
        );
        if (selectedRec && selectedRec.originatingService) {
          const policy = selectedRec.originatingService.followUpPolicy;
          if (policy === FollowUpPolicy.NONE) {
            state.generateNewFollowUpForFulfilledRA = false;
          } else if (policy === FollowUpPolicy.ONCE) {
            state.generateNewFollowUpForFulfilledRA = false;
          } else if (policy === FollowUpPolicy.EVERY_TIME) {
            state.generateNewFollowUpForFulfilledRA = true;
          } else {
            state.generateNewFollowUpForFulfilledRA = false;
          }
        } else {
          state.generateNewFollowUpForFulfilledRA = false;
        }
      } else {
        state.generateNewFollowUpForFulfilledRA = false;
      }
    },
    selectItem(state, action: PayloadAction<SelectItemPayload>) {
      const { id, title, price, type } = action.payload;
      const existingIndex = state.servicesAvailed.findIndex(
        (item) => item.id === id && item.type === type,
      );
      if (existingIndex === -1) {
        state.servicesAvailed.push({
          id,
          name: title,
          quantity: 1,
          type,
          originalPrice: price,
          discountApplied: 0,
        });
      } else {
        state.servicesAvailed.splice(existingIndex, 1);
      }
      calculateAllTotalsHelper(state);
    },
    handleItemQuantity(state, action: PayloadAction<UpdateQuantityPayload>) {
      const { id, type, identifier } = action.payload;
      if (type === "set") return;

      const itemIndex = state.servicesAvailed.findIndex(
        (s) => s.id === id && s.type === type,
      );
      if (itemIndex !== -1) {
        if (identifier === "inc") {
          state.servicesAvailed[itemIndex].quantity += 1;
        } else if (identifier === "dec") {
          state.servicesAvailed[itemIndex].quantity = Math.max(
            0,
            state.servicesAvailed[itemIndex].quantity - 1,
          );
          if (state.servicesAvailed[itemIndex].quantity === 0) {
            state.servicesAvailed.splice(itemIndex, 1);
          }
        }
        calculateAllTotalsHelper(state);
      }
    },
    clearItems(state) {
      state.servicesAvailed = [];
      calculateAllTotalsHelper(state);
    },
    applyDiscounts(state, action: PayloadAction<ApplyDiscountsPayload>) {
      state.appliedDiscountRules = action.payload.rules;
      calculateAllTotalsHelper(state);
    },
    clearDiscounts(state) {
      state.appliedDiscountRules = [];
      calculateAllTotalsHelper(state);
    },
    setVoucher(state, action: PayloadAction<SetVoucherPayload>) {
      if (action.payload.isValid) {
        state.voucherCode = action.payload.code;
        state.voucherDiscountValue = action.payload.value;
      } else {
        state.voucherCode = "";
        state.voucherDiscountValue = 0;
      }
      calculateAllTotalsHelper(state);
    },
    removeRecommendation(state, action: PayloadAction<string>) {
      const idToRemove = action.payload;
      state.customerRecommendations = state.customerRecommendations.filter(
        (rec) => rec.id !== idToRemove,
      );
      if (state.selectedRecommendedAppointmentId === idToRemove) {
        state.selectedRecommendedAppointmentId = null;
        state.generateNewFollowUpForFulfilledRA = false;
      }
    },
    setGenerateNewFollowUpForFulfilledRA(
      state,
      action: PayloadAction<boolean>,
    ) {
      state.generateNewFollowUpForFulfilledRA = action.payload;
    },
    reset(): CashierState {
      return initialState;
    },
  },
});

export const cashierActions = CashierSlice.actions;
export default CashierSlice.reducer;
