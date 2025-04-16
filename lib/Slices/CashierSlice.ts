// lib/Slices/CashierSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
// Import Prisma types needed
import {
  DiscountRule as PrismaDiscountRule, // Optional if not directly used
  DiscountType,
  PaymentMethod as PrismaPaymentMethod, // Use Prisma enum if needed
} from "@prisma/client";
// Import necessary types from your central types file
// Ensure these types are correctly defined in ../Types (or adjust path)
import type {
  FetchedItem, // Assumes this has { id, title, price, type }
  UIDiscountRuleWithServices, // Assumes this has string dates
} from "../Types"; // Adjust path as needed

// Type for items added to the cashier state (cart)
// Ensure this type exists and matches the required structure
export type AvailedItem = {
  id: string; // Can be Service ID or ServiceSet ID
  name: string; // Title of the service or set
  price: number; // Price used for display/calculation (should typically be original)
  quantity: number;
  type: "service" | "set"; // <<< Type discriminator
  originalPrice: number; // <<< Explicit original price storage
  discountApplied: number; // Discount calculated for this specific item line
};

// Define the main state shape using imported types
export interface CashierState {
  name: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  email: string | null;
  servicesAvailed: AvailedItem[]; // <<< Use the correct item type
  serviceType: "single" | "set";
  voucherCode: string;
  voucherDiscountValue: number;
  serveTime: "now" | "later";
  paymentMethod: PrismaPaymentMethod | null; // <<< Use Prisma enum, allow null initially
  subTotal: number;
  grandTotal: number;
  totalDiscount: number;
  appliedDiscountRules: UIDiscountRuleWithServices[];
}

// --- Define Payload Action Types ---
// Payload when selecting an item from the list
type SelectItemPayload = {
  id: string;
  title: string;
  price: number; // The original price of the service/set
  type: "service" | "set"; // The type of the item
};
// Payload for updating quantity (increment/decrement)
type UpdateQuantityPayload = {
  id: string; // ID of the item to update
  type: "service" | "set"; // Type to ensure uniqueness if IDs overlap
  identifier: "inc" | "dec";
};
// Payload for applying discount rules fetched from server
type ApplyDiscountsPayload = {
  rules: UIDiscountRuleWithServices[]; // Expects rules with string dates
};
// Payload for applying/removing a simple voucher
type SetVoucherPayload = {
  isValid: boolean; // Changed from 'status' for clarity
  code: string;
  value: number; // The monetary value of the voucher discount
};

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
  paymentMethod: null, // Start with no payment method selected
  subTotal: 0,
  grandTotal: 0,
  totalDiscount: 0,
  appliedDiscountRules: [],
};

const calculateAllTotalsHelper = (state: CashierState): void => {
  let currentSubTotal = 0;
  let rulesDiscountTotal = 0;
  const now = new Date(); // For checking rule validity dates

  // 1. Calculate SubTotal and Apply Item-Level Discounts from Rules
  const updatedAvailedItems = state.servicesAvailed.map((item) => {
    // Use originalPrice for subtotal calculation consistency
    const originalItemTotal = item.originalPrice * item.quantity;
    currentSubTotal += originalItemTotal;
    let itemDiscount = 0; // Reset discount for this item line

    // Find the first applicable ACTIVE discount rule from the state's rules
    const applicableRule = state.appliedDiscountRules.find((rule) => {
      try {
        // Convert rule's string dates to Date objects for comparison
        const ruleStartDate = new Date(rule.startDate);
        const ruleEndDate = new Date(rule.endDate);
        if (isNaN(ruleStartDate.getTime()) || isNaN(ruleEndDate.getTime()))
          return false; // Invalid date format in rule

        // Check if rule is active and current date falls within its range
        // Adjust end date to be end of day for inclusive check if needed: ruleEndDate.setHours(23, 59, 59, 999);
        const ruleActive =
          rule.isActive && ruleStartDate <= now && ruleEndDate >= now;
        if (!ruleActive) return false;

        // Check if rule applies to this item
        const appliesToSpecific =
          !rule.applyToAll &&
          !!rule.services &&
          rule.services.some(
            (s) => s.id === item.id && item.type === "service",
          ); // Only apply specific rules to 'service' types

        return rule.applyToAll || appliesToSpecific;
      } catch (e) {
        console.error("Error processing rule date:", rule, e);
        return false; // Skip rule if date parsing fails
      }
    });

    if (applicableRule) {
      console.log(
        `Applying rule "${applicableRule.description || applicableRule.id}" to item "${item.name}"`,
      );
      if (applicableRule.discountType === DiscountType.PERCENTAGE) {
        itemDiscount =
          originalItemTotal * (Number(applicableRule.discountValue) / 100);
      } else {
        // FIXED_AMOUNT
        itemDiscount = Number(applicableRule.discountValue) * item.quantity;
        itemDiscount = Math.min(itemDiscount, originalItemTotal); // Cap discount
      }
    }

    rulesDiscountTotal += itemDiscount;
    return { ...item, discountApplied: itemDiscount }; // Return updated item with discount
  });
  state.servicesAvailed = updatedAvailedItems; // Update the array in state

  // 2. Calculate Subtotal After Rules Discount
  const subTotalAfterRules = currentSubTotal - rulesDiscountTotal;

  // 3. Apply Simple Voucher Discount
  let currentVoucherDiscount = 0;
  if (state.voucherCode && state.voucherDiscountValue > 0) {
    currentVoucherDiscount = Math.min(
      state.voucherDiscountValue,
      Math.max(0, subTotalAfterRules),
    );
    console.log(
      `Applying voucher "${state.voucherCode}" value: ${currentVoucherDiscount}`,
    );
  }

  // 4. Calculate Final Combined Discount and Grand Total
  const finalTotalDiscount = rulesDiscountTotal + currentVoucherDiscount;
  const finalGrandTotal = currentSubTotal - finalTotalDiscount;

  // 5. Final State Update
  state.subTotal = currentSubTotal; // Subtotal is always the sum of original prices * quantity
  state.totalDiscount = finalTotalDiscount;
  state.grandTotal = Math.max(0, finalGrandTotal); // Prevent negative total

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
        state.serviceType = action.payload;
        // Optional: Clear items when switching type? Decided against for now.
        // state.servicesAvailed = [];
        // calculateAllTotalsHelper(state);
      }
    },
    setServeTime(state, action: PayloadAction<"now" | "later">) {
      state.serveTime = action.payload;
    },
    setPaymentMethod(state, action: PayloadAction<PrismaPaymentMethod>) {
      // Use Prisma enum
      state.paymentMethod = action.payload;
    },
    setDateTime(state, action: PayloadAction<{ date: string; time: string }>) {
      state.date = action.payload.date;
      state.time = action.payload.time;
    },

    // --- Service/Set Manipulation Reducers ---
    selectItem(state, action: PayloadAction<SelectItemPayload>) {
      const { id, title, price, type } = action.payload;
      // Check using both id and type to handle potential overlaps if needed
      const existingIndex = state.servicesAvailed.findIndex(
        (item) => item.id === id && item.type === type,
      );

      if (existingIndex === -1) {
        // *** CORRECTED: Add item with type and originalPrice ***
        state.servicesAvailed.push({
          id: id,
          name: title,
          price: price, // Assume payload price is the one to use/display
          quantity: 1,
          type: type, // <<< Assign type from payload
          originalPrice: price, // <<< Assign originalPrice from payload price
          discountApplied: 0, // Initialize discount for this item
        });
      } else {
        // Item exists, remove it (toggle behavior)
        state.servicesAvailed.splice(existingIndex, 1);
      }
      calculateAllTotalsHelper(state); // Recalculate after adding/removing
    },

    handleItemQuantity(state, action: PayloadAction<UpdateQuantityPayload>) {
      const { id, type, identifier } = action.payload;
      const itemIndex = state.servicesAvailed.findIndex(
        (s) => s.id === id && s.type === type, // Find by ID and Type
      );

      // Only allow quantity change for 'service' type items
      if (itemIndex === -1 || state.servicesAvailed[itemIndex].type === "set") {
        console.warn("Cannot change quantity for sets or item not found.");
        return;
      }

      if (identifier === "inc") {
        state.servicesAvailed[itemIndex].quantity += 1;
      } else if (identifier === "dec") {
        state.servicesAvailed[itemIndex].quantity -= 1;
        // Remove item if quantity drops to 0 or less
        if (state.servicesAvailed[itemIndex].quantity <= 0) {
          state.servicesAvailed.splice(itemIndex, 1);
        }
      }
      calculateAllTotalsHelper(state); // Recalculate after quantity change
    },

    clearItems(state) {
      state.servicesAvailed = [];
      calculateAllTotalsHelper(state);
    },

    // --- Discount Rule Reducers ---
    applyDiscounts(state, action: PayloadAction<ApplyDiscountsPayload>) {
      state.appliedDiscountRules = action.payload.rules;
      console.log("Applying discount rules:", action.payload.rules.length);
      calculateAllTotalsHelper(state);
    },
    clearDiscounts(state) {
      state.appliedDiscountRules = [];
      calculateAllTotalsHelper(state);
    },

    // --- Simple Voucher Reducer ---
    // Renamed payload property 'status' to 'isValid' for clarity
    setVoucher(state, action: PayloadAction<SetVoucherPayload>) {
      if (action.payload.isValid) {
        state.voucherCode = action.payload.code;
        state.voucherDiscountValue = action.payload.value;
        console.log(
          `Applied Voucher: ${action.payload.code}, Value: ${action.payload.value}`,
        );
      } else {
        state.voucherCode = "";
        state.voucherDiscountValue = 0;
        console.log("Removed Voucher");
      }
      calculateAllTotalsHelper(state); // Recalculate after voucher change
    },

    // --- Reset Reducer ---
    reset(): CashierState {
      // Return initialState to reset the state completely
      console.log("Resetting cashier state");
      return initialState;
    },
  },
});

export const cashierActions = CashierSlice.actions;
export default CashierSlice.reducer;
