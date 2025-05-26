// lib/Slices/CashierSlice.ts - MODIFIED: Removed areRulesFetched state and reducer
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
  // areRulesFetched: boolean; // <-- REMOVED
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
  // areRulesFetched: false, // <-- REMOVED
};

/**
 * Helper function to get a Date object representing a specific time in a given timezone,
 * then get its UTC equivalent ISO string.
 *
 * @param dateString YYYY-MM-DD
 * @param timeString HH:mm
 * @param timeZone IANA timezone string (e.g., 'Asia/Manila')
 * @returns UTC ISO string or null if invalid
 */
const getUtcEquivalentForLocalTime = (
  dateString: string,
  timeString: string,
  timeZone: string,
): string | null => {
  try {
    // Construct a date string that's more likely to be parsed correctly by Date constructor
    // for a specific local time, then we'll format it to get parts for UTC.
    // This is a bit of a dance with vanilla JS.
    const [year, month, day] = dateString.split("-").map(Number);
    const [hours, minutes] = timeString.split(":").map(Number);

    // Create a formatter for the target timezone to extract parts
    const formatter = new Intl.DateTimeFormat("en-CA", {
      // en-CA gives YYYY-MM-DD
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false, // Use 24-hour format for easier parsing
    });

    // Create a temporary date object. Its internal value is UTC.
    // We want to find the UTC moment that *corresponds* to, e.g., 2025-05-25 00:00:00 in Asia/Manila.
    // Step 1: Create a date representing the desired local time components in UTC.
    // This is NOT the final UTC equivalent yet.
    const dateInUtcParts = new Date(
      Date.UTC(year, month - 1, day, hours, minutes, 0, 0),
    );

    // Step 2: Format this UTC date *as if it were in the target timezone*
    // This tells us what time it would be in the target timezone if the UTC parts were local.
    // This step isn't directly giving us the UTC equivalent from a local time,
    // but helps understand the offset.

    // A more direct (but still slightly complex without a library) approach:
    // 1. Create a date in the local system that *matches* the target timezone's desired time numerically.
    //    This is hard because `new Date(y,m,d,h,m,s)` uses the system's local timezone.
    // 2. Calculate the offset.

    // Let's simplify for the rule creation process:
    // If an admin picks "2025-05-25" and "00:00" for "Asia/Manila"
    // We need to find the UTC string for that.
    // One way: create a date string with offset, then parse.
    const tempDateStringWithOffset = `${dateString}T${timeString}:00.000${getOffsetString(timeZone, new Date(year, month - 1, day))}`;
    const dateWithOffset = new Date(tempDateStringWithOffset);
    if (isNaN(dateWithOffset.getTime())) return null;
    return dateWithOffset.toISOString();
  } catch (e) {
    console.error("Error in getUtcEquivalentForLocalTime:", e);
    return null;
  }
};

/**
 * Helper to get timezone offset string like "+08:00" or "-05:00"
 * This is a simplified helper and might not be perfectly robust for all historical TZ changes.
 * @param timeZone IANA timezone string
 * @param date The date for which to get the offset
 */
const getOffsetString = (timeZone: string, date: Date): string => {
  // Get the date string in the target timezone
  const zonedDateStr = date.toLocaleString("en-US", {
    timeZone,
    hour12: false,
  });
  // Get the same date string in UTC
  const utcDateStr = date.toLocaleString("en-US", {
    timeZone: "UTC",
    hour12: false,
  });

  const zonedDate = new Date(zonedDateStr);
  const utcDate = new Date(utcDateStr);

  let offsetMinutes = (zonedDate.getTime() - utcDate.getTime()) / (1000 * 60);

  // If the date parts made it cross a DST boundary or such, this simple getTime diff might be skewed.
  // A more robust way for offset:
  const formatter = new Intl.DateTimeFormat("en", {
    timeZoneName: "shortOffset",
    timeZone,
  });
  const parts = formatter.formatToParts(date);
  const gmtPart = parts.find((part) => part.type === "timeZoneName"); // e.g., GMT+8
  if (gmtPart) {
    const match = gmtPart.value.match(/GMT([+-]\d+)(?::(\d+))?/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const sign = hours >= 0 ? "+" : "-";
      return `${sign}${String(Math.abs(hours)).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }
  }
  // Fallback if precise offset string isn't found, this is less ideal
  const sign = offsetMinutes >= 0 ? "+" : "-";
  offsetMinutes = Math.abs(offsetMinutes);
  const offsetH = Math.floor(offsetMinutes / 60);
  const offsetM = offsetMinutes % 60;
  return `${sign}${String(offsetH).padStart(2, "0")}:${String(offsetM).padStart(2, "0")}`;
};

// Helper function for calculating totals
// THIS FUNCTION ASSUMES rule.startDate and rule.endDate in appliedDiscountRules
// are ALREADY UTC ISO strings that represent the PHT-aware boundaries.
const calculateAllTotalsHelper = (state: CashierState): void => {
  console.log("--- calculateAllTotalsHelper ---");
  try {
    console.log(
      "Current state (servicesAvailed, appliedDiscountRules, voucher):",
      {
        servicesAvailed: JSON.parse(JSON.stringify(state.servicesAvailed)),
        appliedDiscountRules: JSON.parse(
          JSON.stringify(state.appliedDiscountRules),
        ),
        voucherCode: state.voucherCode,
        voucherDiscountValue: state.voucherDiscountValue,
      },
    );
  } catch (e) {
    console.error("Error stringifying state for logging:", e);
  }

  let currentSubTotal = 0;
  let rulesDiscountAmount = 0;

  const nowUTC = new Date(); // Current moment in UTC
  console.log(
    "Client 'nowUTC' (ISO String - THIS IS THE UTC VALUE):",
    nowUTC.toISOString(),
  );
  console.log(
    "Client 'nowUTC' (Local String representation):",
    nowUTC.toString(),
  );
  console.log(
    "Client 'nowUTC' (UTC Milliseconds timestamp):",
    nowUTC.getTime(),
  );

  const updatedAvailedItems = state.servicesAvailed.map((item) => {
    console.log(
      `  Processing item: ${item.name} (ID: ${item.id}, Type: ${item.type}, Original Price: ${item.originalPrice}, Qty: ${item.quantity})`,
    );
    const originalItemTotalValue = item.originalPrice * item.quantity;
    currentSubTotal += originalItemTotalValue;
    let currentItemDiscount = 0;

    if (
      !state.appliedDiscountRules ||
      state.appliedDiscountRules.length === 0
    ) {
      console.log(
        "  No appliedDiscountRules in state to consider for this item.",
      );
    } else {
      console.log(
        "  Considering appliedDiscountRules:",
        JSON.parse(JSON.stringify(state.appliedDiscountRules)),
      );
    }

    const applicableRule = state.appliedDiscountRules?.find((rule) => {
      // Added optional chaining
      console.log(
        `    Checking rule: ${rule.description || rule.id} (Type: ${rule.discountType}, Value: ${rule.discountValue})`,
      );
      console.log(
        `      Rule raw dates (expected UTC ISO strings representing PHT boundaries): startDate=${rule.startDate}, endDate=${rule.endDate}`,
      );
      try {
        // These are expected to be UTC ISO strings from the server,
        // already adjusted to reflect PHT start/end times.
        const ruleStartDateUTC = new Date(rule.startDate);
        const ruleEndDateRawUTC = new Date(rule.endDate);

        if (isNaN(ruleEndDateRawUTC.getTime())) {
          console.warn(
            `      INVALID rule.endDate for rule ${rule.id}: ${rule.endDate}`,
          );
          return false;
        }
        // This logic assumes rule.endDate (from DB, via server) represents the END of the last active day (inclusive) in UTC.
        // If rule.endDate represents the START of the day AFTER the last active day (exclusive),
        // then the comparison would be nowUTC.getTime() < ruleEndDateRawUTC.getTime()
        const ruleEndDateInclusiveUTC = ruleEndDateRawUTC; // Assuming it's already inclusive end from DB

        console.log(
          `      Comparing with 'nowUTC' (${nowUTC.toISOString()} | ${nowUTC.getTime()}ms):`,
        );
        console.log(
          `        Rule Start Date UTC (from state): ${ruleStartDateUTC.toISOString()} | ${ruleStartDateUTC.getTime()}ms`,
        );
        console.log(
          `        Rule End Date Inclusive UTC (from state): ${ruleEndDateInclusiveUTC.toISOString()} | ${ruleEndDateInclusiveUTC.getTime()}ms`,
        );

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
          ruleEndDateInclusiveUTC.getTime() >= nowUTC.getTime();

        console.log(`      Rule isActive (flag): ${rule.isActive}`);
        console.log(
          `      ruleStartDateUTC.getTime() <= nowUTC.getTime(): ${ruleStartDateUTC.getTime() <= nowUTC.getTime()}`,
        );
        console.log(
          `      ruleEndDateInclusiveUTC.getTime() >= nowUTC.getTime(): ${ruleEndDateInclusiveUTC.getTime() >= nowUTC.getTime()}`,
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

        const appliesToThisSpecificServiceItem =
          !rule.applyToAll &&
          rule.services?.some(
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
          originalItemTotalValue * (Number(applicableRule.discountValue) / 100);
      } else {
        currentItemDiscount =
          Number(applicableRule.discountValue) * item.quantity;
        currentItemDiscount = Math.min(
          currentItemDiscount,
          originalItemTotalValue,
        );
      }
      console.log(`    Discount amount for this item: ${currentItemDiscount}`);
    } else {
      console.log(`    NO APPLICABLE RULE found for item ${item.name}`);
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

  console.log("Final totals calculated:", {
    subTotal: state.subTotal,
    rulesDiscountAmount,
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
        state.selectedRecommendedAppointmentId = null;
        state.generateNewFollowUpForFulfilledRA = false;
      } else {
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
      const existingItemIndex = state.servicesAvailed.findIndex(
        (item) => item.id === id && item.type === type,
      );

      if (existingItemIndex !== -1) {
        state.servicesAvailed.splice(existingItemIndex, 1);
      } else {
        state.servicesAvailed.push({
          id,
          name: title,
          quantity: 1,
          type,
          originalPrice: price,
          discountApplied: 0,
        });
      }
      calculateAllTotalsHelper(state);
    },
    handleItemQuantity(state, action: PayloadAction<UpdateQuantityPayload>) {
      const { id, type, identifier } = action.payload;
      const itemIndex = state.servicesAvailed.findIndex(
        (s) => s.id === id && s.type === type,
      );
      if (itemIndex !== -1) {
        if (identifier === "inc") {
          state.servicesAvailed[itemIndex].quantity += 1;
        } else if (identifier === "dec") {
          if (state.servicesAvailed[itemIndex].quantity > 1) {
            state.servicesAvailed[itemIndex].quantity -= 1;
          } else {
            state.servicesAvailed.splice(itemIndex, 1);
          }
        }
        calculateAllTotalsHelper(state);
      }
    },
    removeItem(
      state,
      action: PayloadAction<{ id: string; type: "service" | "set" }>,
    ) {
      const { id, type } = action.payload;
      state.servicesAvailed = state.servicesAvailed.filter(
        (item) => !(item.id === id && item.type === type),
      );
      calculateAllTotalsHelper(state);
    },
    clearItems(state) {
      state.servicesAvailed = [];
      calculateAllTotalsHelper(state);
    },
    applyDiscounts(state, action: PayloadAction<ApplyDiscountsPayload>) {
      state.appliedDiscountRules = action.payload.rules;
      console.log(
        "Discounts applied to state from applyDiscounts action:",
        JSON.parse(JSON.stringify(state.appliedDiscountRules)),
      );
      // calculateAllTotalsHelper is called HERE, which updates servicesAvailed.
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
    // REMOVED: setRulesFetched reducer
    // setRulesFetched: (state, action: PayloadAction<boolean>) => {
    //   state.areRulesFetched = action.payload;
    // },

    reset(): CashierState {
      // Reset to initial state, which no longer includes areRulesFetched
      return JSON.parse(JSON.stringify(initialState));
    },
  },
});

export const cashierActions = CashierSlice.actions;
export default CashierSlice.reducer;
