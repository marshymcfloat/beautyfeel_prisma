// lib/Slices/CashierSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
// Import Prisma types needed
import type {
  DiscountRule as PrismaDiscountRule,
  DiscountType,
} from "@prisma/client";
// Import necessary types from your central types file
import type { FetchedItem } from "../Types"; // Adjust path as needed

// Type for items in the cart
type AvailedItem = {
  id: string;
  name: string;
  price: number; // Original price per unit
  quantity: number;
  type: "service" | "set";
  originalPrice: number; // Store original price (redundant with price, but keep if used)
  discountApplied: number; // Amount of discount calculated and applied to this item total
};

// Type for DiscountRule including services relation
// This type MUST match the data structure fetched by getDiscountRules
type UIDiscountRuleWithServices = PrismaDiscountRule & {
  services?: { id: string; title: string }[]; // Include services relation
};

// Define the main state shape
export interface CashierState {
  name: string;
  date: string;
  time: string;
  email: string | null;
  servicesAvailed: AvailedItem[];
  serviceType: "single" | "set"; // For filtering selection list
  voucherCode: string; // For simple, single voucher code
  voucherDiscountValue: number; // Value of the applied simple voucher
  serveTime: "now" | "later";
  paymentMethod: "ewallet" | "cash" | "bank";
  subTotal: number; // Sum of original prices * quantities
  grandTotal: number; // Final amount due after all discounts
  totalDiscount: number; // Combined discount (rules + voucher)
  appliedDiscountRules: UIDiscountRuleWithServices[]; // Stores active rules for calculation
}

// --- Define Payload Action Types ---
type SelectItemPayload = {
  id: string;
  title: string;
  price: number;
  type: "service" | "set";
};
type UpdateQuantityPayload = { identifier: "inc" | "dec"; id: string };
// Payload for applying the list of active rules fetched from DB
type ApplyDiscountsPayload = { rules: UIDiscountRuleWithServices[] };
// Payload for simple voucher application
type SetDiscountPayload = { status: boolean; code: string; value: number };

// --- Initial State ---
const initialState: CashierState = {
  name: "",
  serviceType: "single",
  serveTime: "now",
  date: "",
  time: "",
  email: null,
  servicesAvailed: [],
  voucherCode: "",
  voucherDiscountValue: 0,
  paymentMethod: "cash",
  subTotal: 0,
  grandTotal: 0,
  totalDiscount: 0,
  appliedDiscountRules: [], // Initialize as empty array
};

// --- Helper function to RE-calculate ALL totals ---
const calculateAllTotalsHelper = (state: CashierState): void => {
  let currentSubTotal = 0;
  let rulesDiscountTotal = 0;
  const now = new Date();

  const updatedAvailedItems = state.servicesAvailed.map((item) => {
    const originalItemTotal = item.originalPrice * item.quantity;
    currentSubTotal += originalItemTotal;
    let itemDiscount = 0;

    // Find the first applicable ACTIVE discount rule
    const applicableRule = state.appliedDiscountRules.find((rule) => {
      // rule is UIDiscountRuleWithServices
      // Check date range and active status first
      const ruleActive =
        rule.isActive &&
        new Date(rule.startDate) <= now &&
        new Date(rule.endDate) >= now;

      if (!ruleActive) return false;

      // --- FIX: Use the applyToAll flag ---
      const appliesToSpecific =
        !rule.applyToAll && // Check it's NOT an "all" rule
        !!rule.services && // Check services array exists
        rule.services.some((s) => s.id === item.id); // Check if item is included

      // Rule applies if it's an active global rule OR an active specific rule matching the item
      return rule.applyToAll || appliesToSpecific;
    });

    console.log(applicableRule);

    if (applicableRule) {
      // ... (discount calculation remains the same) ...
      if (applicableRule.discountType === "PERCENTAGE") {
        itemDiscount =
          originalItemTotal * (Number(applicableRule.discountValue) / 100);
      } else {
        // FIXED_AMOUNT
        itemDiscount = Number(applicableRule.discountValue) * item.quantity;
        itemDiscount = Math.min(itemDiscount, originalItemTotal);
      }
    }

    rulesDiscountTotal += itemDiscount;
    return { ...item, discountApplied: itemDiscount };
  });
  state.servicesAvailed = updatedAvailedItems;

  // ... (rest of calculation: voucher, totals, state update - remains the same) ...
  const subTotalAfterRules = currentSubTotal - rulesDiscountTotal;
  let currentVoucherDiscount = 0;
  if (state.voucherCode && state.voucherDiscountValue > 0) {
    currentVoucherDiscount = Math.min(
      state.voucherDiscountValue,
      Math.max(0, subTotalAfterRules),
    );
  }
  const finalTotalDiscount = rulesDiscountTotal + currentVoucherDiscount;
  const finalGrandTotal = currentSubTotal - finalTotalDiscount;
  state.subTotal = currentSubTotal;
  state.totalDiscount = finalTotalDiscount;
  state.grandTotal = Math.max(0, finalGrandTotal);
};

// --- Create the Slice ---
export const CashierSlice = createSlice({
  name: "cashier",
  initialState,
  reducers: {
    // --- Customer & Transaction Settings Reducers ---
    setCustomerName(state, action: PayloadAction<string>) {
      state.name = action.payload;
    },
    setEmail(state, action: PayloadAction<string | null>) {
      state.email = action.payload;
    },
    setServiceType(state, action: PayloadAction<"single" | "set">) {
      state.serviceType =
        action.payload; /* Recalc needed if services cleared? */
    },
    setServeTime(state, action: PayloadAction<"now" | "later">) {
      state.serveTime = action.payload;
    },
    setPaymentMethod(
      state,
      action: PayloadAction<"ewallet" | "cash" | "bank">,
    ) {
      state.paymentMethod = action.payload;
    },
    setDateTime(state, action: PayloadAction<{ date: string; time: string }>) {
      state.date = action.payload.date;
      state.time = action.payload.time;
    },

    // --- Service/Set Manipulation Reducers ---
    selectItem(state, action: PayloadAction<SelectItemPayload>) {
      const { id, title, price, type } = action.payload;
      const existingIndex = state.servicesAvailed.findIndex(
        (item) => item.id === id,
      );
      if (existingIndex === -1) {
        // Add new item, ensure originalPrice is set
        state.servicesAvailed.push({
          id,
          name: title,
          price,
          quantity: 1,
          type,
          originalPrice: price,
          discountApplied: 0,
        });
      } else {
        state.servicesAvailed.splice(existingIndex, 1); // Toggle remove
      }
      calculateAllTotalsHelper(state); // Recalculate after adding/removing
    },
    handleItemQuantity(state, action: PayloadAction<UpdateQuantityPayload>) {
      const itemIndex = state.servicesAvailed.findIndex(
        (s) => s.id === action.payload.id,
      );
      if (itemIndex === -1 || state.servicesAvailed[itemIndex].type === "set")
        return; // No quantity change for sets
      if (action.payload.identifier === "inc") {
        state.servicesAvailed[itemIndex].quantity += 1;
      } else if (action.payload.identifier === "dec") {
        state.servicesAvailed[itemIndex].quantity -= 1;
        if (state.servicesAvailed[itemIndex].quantity <= 0)
          state.servicesAvailed.splice(itemIndex, 1);
      }
      calculateAllTotalsHelper(state); // Recalculate after quantity change
    },

    applyDiscounts(state, action: PayloadAction<ApplyDiscountsPayload>) {
      // Replace current rules with the newly fetched active ones
      state.appliedDiscountRules = action.payload.rules;
      console.log("Applying discount rules:", action.payload.rules.length);
      calculateAllTotalsHelper(state); // Recalculate totals with new rules
    },
    clearDiscounts(state) {
      // Could be called on reset or if discounts are manually turned off
      state.appliedDiscountRules = [];
      calculateAllTotalsHelper(state);
    },

    // --- Simple Voucher Reducer --- (Review if needed)
    setDiscount(state, action: PayloadAction<SetDiscountPayload>) {
      if (action.payload.status) {
        state.voucherCode = action.payload.code;
        state.voucherDiscountValue = action.payload.value; // Store VALUE
        console.log(
          `Applied Voucher: ${action.payload.code}, Value: ${action.payload.value}`,
        );
      } else {
        state.voucherCode = "";
        state.voucherDiscountValue = 0; // Reset VALUE
        console.log("Removed Voucher");
      }
      calculateAllTotalsHelper(state); // Recalculate after voucher change
    },

    // --- Reset Reducer ---
    reset(): CashierState {
      // Return initialState to reset the state completely
      return initialState;
    },
  },
});

export const cashierActions = CashierSlice.actions;
export default CashierSlice.reducer;
