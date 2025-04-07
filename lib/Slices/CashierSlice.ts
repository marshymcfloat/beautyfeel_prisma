// lib/Slices/CashierSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
// Import Prisma types needed
import {
  DiscountRule as PrismaDiscountRule,
  DiscountType,
} from "@prisma/client";
// Import necessary types from your central types file
// Ensure these types are correctly defined in ../Types (or adjust path)
import type { FetchedItem, UIDiscountRuleWithServices } from "../Types";

// Type for items added to the cashier state (cart)
type AvailedItem = {
  id: string; // Can be Service ID or ServiceSet ID
  name: string; // Title of the service or set
  price: number; // Original price per unit (service) or price of the set
  quantity: number; // Usually 1 for sets
  type: "service" | "set"; // To distinguish items
  originalPrice: number; // Store original price explicitly
  discountApplied: number; // Amount of discount calculated *for this item line*
};

// Define the main state shape using imported types
export interface CashierState {
  name: string; // Customer name
  date: string; // Service date (YYYY-MM-DD) if 'later'
  time: string; // Service time (HH:MM) if 'later'
  email: string | null; // Customer email
  servicesAvailed: AvailedItem[]; // Array of items in the transaction
  serviceType: "single" | "set"; // Current selection mode for ServicesSelect
  voucherCode: string; // Applied simple voucher code
  voucherDiscountValue: number; // Discount amount from the simple voucher
  serveTime: "now" | "later"; // When the service will be performed
  paymentMethod: "ewallet" | "cash" | "bank"; // Selected payment method
  subTotal: number; // Sum of (originalPrice * quantity) for all items
  grandTotal: number; // Final amount due after all discounts
  totalDiscount: number; // TOTAL combined discount (rules + voucher)
  appliedDiscountRules: UIDiscountRuleWithServices[]; // Active discount rules currently considered
}

// --- Define Payload Action Types ---
type SelectItemPayload = {
  id: string;
  title: string;
  price: number;
  type: "service" | "set";
};
type UpdateQuantityPayload = { identifier: "inc" | "dec"; id: string };
type ApplyDiscountsPayload = { rules: UIDiscountRuleWithServices[] }; // Payload contains rules with string dates
type SetDiscountPayload = { status: boolean; code: string; value: number };

// --- Initial State ---
const initialState: CashierState = {
  name: "",
  serviceType: "single", // Default to selecting single services
  serveTime: "now",
  date: "",
  time: "",
  email: null,
  servicesAvailed: [],
  voucherCode: "",
  voucherDiscountValue: 0, // Initialize voucher value
  paymentMethod: "cash",
  subTotal: 0,
  grandTotal: 0,
  totalDiscount: 0,
  appliedDiscountRules: [], // Initialize as empty array
};

// --- Helper function to RE-calculate ALL totals ---
// This function MUTATES the state object passed to it (intended for Immer via Redux Toolkit)
const calculateAllTotalsHelper = (state: CashierState): void => {
  let currentSubTotal = 0;
  let rulesDiscountTotal = 0;
  const now = new Date();

  // 1. Calculate SubTotal and Apply Item-Level Discounts from Rules
  const updatedAvailedItems = state.servicesAvailed.map((item) => {
    // Use originalPrice for consistent subtotal calculation
    const originalItemTotal = item.originalPrice * item.quantity;
    currentSubTotal += originalItemTotal;
    let itemDiscount = 0; // Discount calculated for *this* item line

    // Find the first applicable ACTIVE discount rule from the state
    // Ensure state.appliedDiscountRules has rules with string dates here
    const applicableRule = state.appliedDiscountRules.find((rule) => {
      // Convert rule's string dates to Date objects for comparison
      const ruleStartDate = new Date(rule.startDate);
      const ruleEndDate = new Date(rule.endDate);
      // Basic validity check for parsed dates
      if (isNaN(ruleStartDate.getTime()) || isNaN(ruleEndDate.getTime())) {
        return false;
      }

      // Check if rule is active and current date falls within its range
      // TODO: Consider timezone and end-of-day precision for endDate comparison
      const ruleActive =
        rule.isActive && ruleStartDate <= now && ruleEndDate >= now;
      if (!ruleActive) return false;

      // Check if rule applies to this item (all services or specific service)
      const appliesToSpecific =
        !rule.applyToAll && // Rule is specifically targeted
        !!rule.services && // Services array exists
        rule.services.some((s) => s.id === item.id); // Item is in the list

      return rule.applyToAll || appliesToSpecific; // Apply if global or specific match
    });

    if (applicableRule) {
      console.log(
        `Applying rule "${applicableRule.description || applicableRule.id}" to item "${item.name}"`,
      );
      if (applicableRule.discountType === DiscountType.PERCENTAGE) {
        // Use imported enum
        itemDiscount =
          originalItemTotal * (Number(applicableRule.discountValue) / 100);
      } else {
        // FIXED_AMOUNT
        itemDiscount = Number(applicableRule.discountValue) * item.quantity; // Apply fixed amount per unit quantity
        itemDiscount = Math.min(itemDiscount, originalItemTotal); // Ensure discount doesn't exceed item's total original value
      }
    }

    rulesDiscountTotal += itemDiscount; // Accumulate total discount FROM RULES
    // Return updated item object with the calculated discount for this specific item
    return { ...item, discountApplied: itemDiscount };
  });
  // IMPORTANT: Update the state's servicesAvailed array with the new one containing calculated discounts
  state.servicesAvailed = updatedAvailedItems;

  // 2. Calculate Subtotal After Rules Discount is known
  const subTotalAfterRules = currentSubTotal - rulesDiscountTotal;

  // 3. Apply Simple Voucher Discount (if applicable) to the remaining subtotal
  let currentVoucherDiscount = 0;
  if (state.voucherCode && state.voucherDiscountValue > 0) {
    // Voucher value cannot exceed the remaining amount after rule discounts
    currentVoucherDiscount = Math.min(
      state.voucherDiscountValue,
      Math.max(0, subTotalAfterRules),
    );
    console.log(
      `Applying voucher "${state.voucherCode}" value: ${currentVoucherDiscount}`,
    );
  }

  // 4. Calculate Final Combined Discount and Grand Total
  const finalTotalDiscount = rulesDiscountTotal + currentVoucherDiscount; // Sum of all applied discounts
  const finalGrandTotal = currentSubTotal - finalTotalDiscount; // Apply combined discount to original subtotal

  // 5. Final State Update
  state.subTotal = currentSubTotal;
  state.totalDiscount = finalTotalDiscount;
  state.grandTotal = Math.max(0, finalGrandTotal); // Ensure grand total is not negative

  console.log("Totals Calculated:", {
    subTotal: state.subTotal,
    totalDiscount: state.totalDiscount,
    grandTotal: state.grandTotal,
  });
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
      if (state.serviceType !== action.payload) {
        // Only clear if type actually changes
        state.serviceType = action.payload;
        // state.servicesAvailed = []; // Optional: Clear items on type change
        // calculateAllTotalsHelper(state); // Recalculate if items cleared
      }
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
        // Add item with original price and zero initial discount
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
      // Prevent quantity change for sets or if item not found
      if (itemIndex === -1 || state.servicesAvailed[itemIndex].type === "set")
        return;

      if (action.payload.identifier === "inc") {
        state.servicesAvailed[itemIndex].quantity += 1;
      } else if (action.payload.identifier === "dec") {
        state.servicesAvailed[itemIndex].quantity -= 1;
        if (state.servicesAvailed[itemIndex].quantity <= 0)
          state.servicesAvailed.splice(itemIndex, 1);
      }
      calculateAllTotalsHelper(state); // Recalculate after quantity change
    },
    // Optional: Action to clear all availed items explicitely
    clearItems(state) {
      state.servicesAvailed = [];
      calculateAllTotalsHelper(state);
    },

    // --- Discount Rule Reducers ---
    applyDiscounts(state, action: PayloadAction<ApplyDiscountsPayload>) {
      // Expects rules with string dates from server action
      state.appliedDiscountRules = action.payload.rules;
      console.log("Applying discount rules:", action.payload.rules.length);
      calculateAllTotalsHelper(state);
    },
    clearDiscounts(state) {
      state.appliedDiscountRules = [];
      calculateAllTotalsHelper(state);
    },

    // --- Simple Voucher Reducer ---
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
