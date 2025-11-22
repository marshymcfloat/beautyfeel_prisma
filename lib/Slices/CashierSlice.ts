// lib/Slices/CashierSlice.ts - MODIFIED: Added originBranchId
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import {
  DiscountType,
  PaymentMethod as PrismaPaymentMethod,
  FollowUpPolicy,
} from "@prisma/client";
import type {
  UIDiscountRuleWithServices,
  RecommendedAppointmentData,
  AvailedItem,
} from "../Types"; // Adjust path as needed

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
  customerId: string | null;
  // --- ADDED THIS FIELD ---
  originBranchId: string | null;
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
export interface SetCustomerDataPayload {
  customer: {
    id: string;
    name: string;
    email: string | null;
    recommendedAppointments?: RecommendedAppointmentData[];
  } | null;
}

// --- Initial State ---
const initialState: CashierState = {
  name: "",
  customerId: null,
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
  // --- ADDED THIS FIELD TO INITIAL STATE ---
  originBranchId: null, // Default to null initially
};

// Helper function to get a Date object representing a specific time in a given timezone,
// then get its UTC equivalent ISO string.
// (Keep this helper if you still need it for other parts of your app, but it's not
// directly used within the slice reducers for the CashierState itself, only potentially
// for server-side calculations or if you needed to store UTC times *in* the state)
const getUtcEquivalentForLocalTime = (
  dateString: string,
  timeString: string,
  timeZone: string,
): string | null => {
  try {
    const [year, month, day] = dateString.split("-").map(Number);
    const [hours, minutes] = timeString.split(":").map(Number);

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const tempDateStringWithOffset = `${dateString}T${timeString}:00.000${getOffsetString(timeZone, new Date(year, month - 1, day))}`;
    const dateWithOffset = new Date(tempDateStringWithOffset);
    if (isNaN(dateWithOffset.getTime())) return null;
    return dateWithOffset.toISOString();
  } catch (e) {
    console.error("Error in getUtcEquivalentForLocalTime:", e);
    return null;
  }
};

// Helper to get timezone offset string
const getOffsetString = (timeZone: string, date: Date): string => {
  const formatter = new Intl.DateTimeFormat("en", {
    timeZoneName: "shortOffset",
    timeZone,
  });
  const parts = formatter.formatToParts(date);
  const gmtPart = parts.find((part) => part.type === "timeZoneName");
  if (gmtPart) {
    const match = gmtPart.value.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const sign = hours >= 0 ? "+" : "-";
      return `${sign}${String(Math.abs(hours)).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  // Fallback
  const zonedDate = new Date(date.toLocaleString("en-US", { timeZone }));
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  let offsetMinutes = (zonedDate.getTime() - utcDate.getTime()) / (1000 * 60);
  const sign = offsetMinutes >= 0 ? "+" : "-";
  offsetMinutes = Math.abs(offsetMinutes);
  const offsetH = Math.floor(offsetMinutes / 60);
  const offsetM = offsetMinutes % 60;
  return `${sign}${String(offsetH).padStart(2, "0")}:${String(offsetM).padStart(2, "0")}`;
};

// Helper function for calculating totals
// Ensure this function uses the `nowUTC` logic as provided previously,
// and correctly handles date comparisons based on how your server defines rule date boundaries (inclusive end of day).
const calculateAllTotalsHelper = (state: CashierState): void => {
  console.log("--- calculateAllTotalsHelper ---");
  // Add logging to see state before calculation
  try {
    console.log(
      "State before calculation:",
      JSON.parse(
        JSON.stringify({
          servicesAvailed: state.servicesAvailed,
          appliedDiscountRules: state.appliedDiscountRules,
          voucherCode: state.voucherCode,
          voucherDiscountValue: state.voucherDiscountValue,
        }),
      ),
    );
  } catch (e) {
    console.error("Error stringifying state for logging:", e);
  }

  let currentSubTotal = 0;
  let rulesDiscountAmount = 0;

  const nowUTC = new Date(); // Current moment in UTC
  console.log(
    `Client 'nowUTC': ${nowUTC.toISOString()} (${nowUTC.getTime()}ms)`,
  );

  const updatedAvailedItems = state.servicesAvailed.map((item) => {
    console.log(
      `  Processing item: ${item.name} (ID: ${item.id}, Type: ${item.type}, Original Price: ${item.originalPrice}, Qty: ${item.quantity})`,
    );
    const originalItemTotalValue = item.originalPrice * item.quantity;
    currentSubTotal += originalItemTotalValue;
    let currentItemDiscount = 0;

    if (state.appliedDiscountRules?.length > 0) {
      console.log(
        `  Checking ${state.appliedDiscountRules.length} appliedDiscountRules...`,
      );

      const applicableRule = state.appliedDiscountRules.find((rule) => {
        console.log(
          `    Checking rule: ${rule.description || rule.id} (Type: ${rule.discountType}, Value: ${rule.discountValue})`,
        );
        console.log(
          `      Rule raw dates (expected UTC ISO strings representing PHT boundaries): startDate=${rule.startDate}, endDate=${rule.endDate}`,
        );

        try {
          const ruleStartDateUTC = new Date(rule.startDate);
          const ruleEndDateInclusiveUTC = new Date(rule.endDate); // Assuming endDate is inclusive end of day UTC

          if (
            isNaN(ruleStartDateUTC.getTime()) ||
            isNaN(ruleEndDateInclusiveUTC.getTime())
          ) {
            console.warn(
              `      INVALID RULE DATES (NaN) after parsing for rule ${rule.id}. Start: ${rule.startDate}, End: ${rule.endDate}`,
            );
            return false;
          }

          const isRuleCurrentlyActive =
            rule.isActive &&
            ruleStartDateUTC.getTime() <= nowUTC.getTime() &&
            ruleEndDateInclusiveUTC.getTime() >= nowUTC.getTime(); // Check inclusive end time

          console.log(`      Rule isActive (flag): ${rule.isActive}`);
          console.log(
            `      Time check: ${ruleStartDateUTC.toISOString()} <= ${nowUTC.toISOString()} (${ruleStartDateUTC.getTime() <= nowUTC.getTime()}) AND ${ruleEndDateInclusiveUTC.toISOString()} >= ${nowUTC.toISOString()} (${ruleEndDateInclusiveUTC.getTime() >= nowUTC.getTime()})`,
          );
          console.log(
            `      Is Rule Currently Active (date range check): ${isRuleCurrentlyActive}`,
          );

          if (!isRuleCurrentlyActive) {
            console.log(
              "      RULE NOT ACTIVE (date range or isActive flag is false)",
            );
            return false;
          }

          const ruleServices = Array.isArray(rule.services)
            ? rule.services
            : [];
          const appliesToThisSpecificServiceItem =
            !rule.applyToAll &&
            ruleServices.some(
              (s) => s.id === item.id && item.type === "service",
            );

          console.log(`      Rule applyToAll: ${rule.applyToAll}`);
          console.log(
            `      Rule appliesToThisSpecificServiceItem: ${appliesToThisSpecificServiceItem}`,
          );

          const decision = rule.applyToAll || appliesToThisSpecificServiceItem;
          console.log(
            `      FINAL DECISION for this rule on this item: ${decision}`,
          );
          return decision;
        } catch (e: any) {
          console.error(
            `      Error processing rule ${rule.id} in calculateAllTotalsHelper:`,
            e.message,
            rule,
            e,
          );
          return false;
        }
      });

      if (applicableRule) {
        console.log(
          `    APPLICABLE RULE FOUND for item ${item.name}:`,
          JSON.parse(JSON.stringify(applicableRule)),
        );
        if (applicableRule.discountType === DiscountType.PERCENTAGE) {
          currentItemDiscount =
            originalItemTotalValue *
            (Number(applicableRule.discountValue) / 100);
        } else {
          // For FIXED_AMOUNT, apply the fixed amount *per quantity*
          currentItemDiscount =
            Number(applicableRule.discountValue) * item.quantity;
          // Ensure fixed discount doesn't exceed the item's value
          currentItemDiscount = Math.min(
            currentItemDiscount,
            originalItemTotalValue,
          );
        }
        console.log(
          `    Discount amount for this item: ${currentItemDiscount}`,
        );
      } else {
        console.log(`    NO APPLICABLE RULE found for item ${item.name}`);
      }
    } else {
      console.log("  No appliedDiscountRules to consider.");
    }

    rulesDiscountAmount += currentItemDiscount;
    // Ensure discountApplied on the item is an integer (assuming currencies are integers)
    const roundedItemDiscount = Math.round(currentItemDiscount);
    return { ...item, discountApplied: roundedItemDiscount };
  });
  state.servicesAvailed = updatedAvailedItems; // Update the state with the new items including discountApplied

  let currentVoucherDiscountAmount = 0;
  if (state.voucherCode && state.voucherDiscountValue > 0) {
    const totalAfterItemRules = currentSubTotal - rulesDiscountAmount;
    currentVoucherDiscountAmount = Math.min(
      state.voucherDiscountValue, // Voucher value is a total fixed amount
      Math.max(0, totalAfterItemRules), // Ensure it doesn't make total negative
    );
    // Ensure voucher discount amount is an integer
    currentVoucherDiscountAmount = Math.round(currentVoucherDiscountAmount);
  }

  const finalTotalDiscountApplied =
    rulesDiscountAmount + currentVoucherDiscountAmount;
  const finalGrandTotalValue = currentSubTotal - finalTotalDiscountApplied;

  // Ensure all final totals are integers
  state.subTotal = Math.round(currentSubTotal);
  state.totalDiscount = Math.round(finalTotalDiscountApplied);
  state.grandTotal = Math.max(0, Math.round(finalGrandTotalValue));

  console.log("Final totals calculated:", {
    subTotal: state.subTotal,
    rulesDiscountAmount: Math.round(rulesDiscountAmount), // Log rounded value
    currentVoucherDiscountAmount,
    totalDiscount: state.totalDiscount,
    grandTotal: state.grandTotal,
  });
  console.log("--- calculateAllTotalsHelper END ---");
};

// --- Create the Slice ---
export const CashierSlice = createSlice({
  name: "cashier",
  initialState,
  reducers: {
    setCustomerName(state, action: PayloadAction<string>) {
      state.name = action.payload;
    },
    setEmail(state, action: PayloadAction<string | null>) {
      state.email = action.payload;
    },
    setCustomerData(state, action: PayloadAction<SetCustomerDataPayload>) {
      if (action.payload.customer) {
        state.customerId = action.payload.customer.id;
        state.name = action.payload.customer.name;
        state.email = action.payload.customer.email;
        state.customerRecommendations =
          action.payload.customer.recommendedAppointments || [];
        // Reset RA selection when customer changes
        state.selectedRecommendedAppointmentId = null;
        state.generateNewFollowUpForFulfilledRA = false;
      } else {
        // Clear customer data
        state.customerId = null;
        state.name = "";
        state.email = null;
        state.customerRecommendations = [];
        state.selectedRecommendedAppointmentId = null;
        state.generateNewFollowUpForFulfilledRA = false;
      }
    },
    setServiceType(state, action: PayloadAction<"single" | "set">) {
      if (state.serviceType !== action.payload) {
        state.serviceType = action.payload;
        // Optionally clear selected items if switching type? Depends on UX.
        // state.servicesAvailed = [];
        // calculateAllTotalsHelper(state);
      }
    },
    setServeTime(state, action: PayloadAction<"now" | "later">) {
      state.serveTime = action.payload;
      if (action.payload === "now") {
        // Clear date/time if setting to 'now'
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
          // Default 'generate new' based on policy
          state.generateNewFollowUpForFulfilledRA =
            policy === FollowUpPolicy.EVERY_TIME;
        } else {
          state.generateNewFollowUpForFulfilledRA = false;
        }
      } else {
        state.generateNewFollowUpForFulfilledRA = false;
      }
    },

    selectItem(state, action: PayloadAction<SelectItemPayload>) {
      const { id, title, price, type } = action.payload;
      // Always add as a new line item, even if same service/set selected multiple times
      state.servicesAvailed.push({
        // Use a unique client-side ID if needed, otherwise using DB ID might conflict
        // For simplicity here, just pushing the item data. You might need `uuidv4()` or similar.
        id, // WARNING: This might cause issues if you select the same item twice and rely on this ID being unique in the UI/state. Consider generating a temporary client ID here.
        name: title,
        quantity: 1, // Start with quantity 1 when selecting
        type,
        originalPrice: price, // Store the original price per unit/set
        discountApplied: 0, // Initial discount is 0
      });

      calculateAllTotalsHelper(state); // Recalculate after adding/removing
    },
    // Modified handleItemQuantity to handle individual items
    handleItemQuantity(state, action: PayloadAction<UpdateQuantityPayload>) {
      const { id, type, identifier } = action.payload;
      // The id now needs to be a unique identifier for the *specific line item instance*
      // in servicesAvailed, not just the service/set ID. If item.id is the DB ID,
      // this approach still assumes only one instance of a service/set is in the list,
      // which conflicts with adding the same item multiple times.
      // REVISED: Assuming item.id IS unique (e.g., temporary client ID or first instance ID).
      // If you need multiple instances of the same service as separate line items,
      // the `selectItem` logic needs to assign unique temporary IDs.
      const itemIndex = state.servicesAvailed.findIndex(
        (s) => s.id === id && s.type === type, // This still matches based on original service/set ID
      );

      if (itemIndex !== -1) {
        if (identifier === "inc") {
          state.servicesAvailed[itemIndex].quantity += 1;
        } else if (identifier === "dec") {
          if (state.servicesAvailed[itemIndex].quantity > 1) {
            state.servicesAvailed[itemIndex].quantity -= 1;
          } else {
            // If quantity goes to 0, remove the item
            state.servicesAvailed.splice(itemIndex, 1);
          }
        }
        calculateAllTotalsHelper(state); // Recalculate after changing quantity
      } else {
        console.warn(
          `handleItemQuantity: Item not found with id ${id} and type ${type}`,
        );
      }
    },
    // Modified removeItem to handle individual items
    removeItem(
      state,
      action: PayloadAction<{ id: string; type: "service" | "set" }>, // ID must be the unique line item ID
    ) {
      const { id, type } = action.payload;
      // Assuming the id here is the unique identifier for the line item you want to remove
      const initialLength = state.servicesAvailed.length;
      state.servicesAvailed = state.servicesAvailed.filter(
        (item) => item.id !== id || item.type !== type, // Filter out the specific item by its unique ID and type
      );
      if (state.servicesAvailed.length < initialLength) {
        calculateAllTotalsHelper(state); // Recalculate only if an item was actually removed
      } else {
        console.warn(
          `removeItem: Item not found with id ${id} and type ${type}`,
        );
      }
    },
    clearItems(state) {
      state.servicesAvailed = [];
      calculateAllTotalsHelper(state);
    },
    applyDiscounts(state, action: PayloadAction<ApplyDiscountsPayload>) {
      state.appliedDiscountRules = action.payload.rules;
      // After applying rules, recalculate totals which reapplies the rules
      calculateAllTotalsHelper(state);
    },
    clearDiscounts(state) {
      state.appliedDiscountRules = [];
      calculateAllTotalsHelper(state);
    },
    setDiscountRules(state, action: PayloadAction<UIDiscountRuleWithServices[]>) {
      state.appliedDiscountRules = action.payload;
      // Recalculate totals when setting discount rules
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
      calculateAllTotalsHelper(state); // Recalculate after voucher change
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

    // --- ADDED THIS NEW REDUCER ---
    setOriginBranchId: (state, action: PayloadAction<string | null>) => {
      state.originBranchId = action.payload;
      // Note: Changing branch ID might affect which services/sets are *available* to add,
      // but it typically doesn't change the price or discount applicability of items
      // *already added* to servicesAvailed, unless your discount rules are branch-specific.
      // If they are branch-specific, you might need to re-run calculation or filter rules here.
      // For now, assume it's just data storage for the transaction.
    },
    // --- END NEW REDUCER ---

    reset(): CashierState {
      // Reset to initial state, including the new originBranchId field
      return JSON.parse(JSON.stringify(initialState));
    },
  },
});

export const cashierActions = CashierSlice.actions;
export default CashierSlice.reducer;
