import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// --- Define the structure for services *added* to the transaction ---
type AvailedService = {
  id: string;
  name: string; // Use 'name' consistently as expected elsewhere
  price: number;
  quantity: number;
};

// --- Define the main state shape ---
export interface CashierState {
  name: string;
  date: string; // Consider storing as Date object or ISO string for easier manipulation
  time: string; // Consider combining with date or using ISO string
  email: string | null; // Allow null if email is optional
  servicesAvailed: AvailedService[]; // Use the correct type here
  serviceType: "single" | "set";
  voucherCode: string;
  serveTime: "now" | "later";
  paymentMethod: "ewallet" | "cash" | "bank";
  grandTotal: number;
  totalDiscount: number;
}

// --- Define Payload Action Types ---
type SelectServicePayload = {
  id: string;
  title: string; // Comes in as 'title' from the fetched service list
  price: number;
};

type UpdateQuantityPayload = {
  identifier: "inc" | "dec";
  id: string; // Use ID to identify the service
};

type SetDiscountPayload = {
  status: boolean;
  code: string;
  value: number;
};

// --- Initial State ---
const initialState: CashierState = {
  name: "",
  serviceType: "single",
  serveTime: "now",
  date: "",
  time: "",
  email: null, // Use null for optional string fields
  servicesAvailed: [],
  voucherCode: "",
  paymentMethod: "cash",
  grandTotal: 0,
  totalDiscount: 0,
};

// --- Helper function to calculate total ---
const calculateTotals = (state: CashierState) => {
  const servicesTotal = state.servicesAvailed.reduce(
    (sum, service) => sum + service.price * service.quantity,
    0,
  );
  state.grandTotal = servicesTotal - state.totalDiscount;
};

// --- Create the Slice ---
export const CashierSlice = createSlice({
  name: "cashier",
  initialState,
  reducers: {
    // --- Customer Info Reducers ---
    selectCustomerSuggestion(
      state: CashierState,
      action: PayloadAction<string>,
    ) {
      state.name = action.payload;
    },
    setCustomerName(state: CashierState, action: PayloadAction<string>) {
      state.name = action.payload;
    },
    setEmail(state: CashierState, action: PayloadAction<string | null>) {
      // Allow setting to null
      state.email = action.payload;
    },

    // --- Transaction Settings Reducers ---
    settingServiceTimeOrType<
      K extends keyof Pick<
        CashierState,
        "serveTime" | "serviceType" | "paymentMethod"
      >,
    >(
      state: CashierState,
      action: PayloadAction<{ key: K; value: CashierState[K] }>,
    ) {
      state[action.payload.key] = action.payload.value;
    },
    setDateTime(
      state: CashierState,
      action: PayloadAction<{ date: string; time: string }>,
    ) {
      state.date = action.payload.date;
      state.time = action.payload.time;
    },

    // --- Service Manipulation Reducers ---
    selectingService(
      state: CashierState,
      action: PayloadAction<SelectServicePayload>,
    ) {
      // Find by ID is more reliable
      const existingServiceIndex = state.servicesAvailed.findIndex(
        (service) => service.id === action.payload.id,
      );

      if (existingServiceIndex === -1) {
        // Service not found, add it
        const newService: AvailedService = {
          id: action.payload.id,
          name: action.payload.title, // Map incoming 'title' to 'name'
          price: action.payload.price,
          quantity: 1, // Initialize quantity
        };
        state.servicesAvailed.push(newService);
      } else {
        // Service found, remove it (toggle behavior based on original code)
        // If you want to increment quantity instead, modify this else block
        state.servicesAvailed.splice(existingServiceIndex, 1);
      }
      calculateTotals(state); // Recalculate totals after adding/removing
    },

    handleServicesQuantity(
      state: CashierState,
      action: PayloadAction<UpdateQuantityPayload>,
    ) {
      const serviceIndex = state.servicesAvailed.findIndex(
        (s) => s.id === action.payload.id,
      ); // Find by ID

      if (serviceIndex === -1) {
        console.warn(
          "Service not found for quantity update:",
          action.payload.id,
        );
        return; // Service not found, do nothing
      }

      if (action.payload.identifier === "inc") {
        state.servicesAvailed[serviceIndex].quantity += 1;
      } else if (action.payload.identifier === "dec") {
        state.servicesAvailed[serviceIndex].quantity -= 1;
        // Remove service if quantity drops to 0 or below
        if (state.servicesAvailed[serviceIndex].quantity <= 0) {
          state.servicesAvailed.splice(serviceIndex, 1);
        }
      }
      calculateTotals(state); // Recalculate totals after quantity change
    },

    // --- Discount and Totals Reducers ---
    setDiscount(
      state: CashierState,
      action: PayloadAction<SetDiscountPayload>,
    ) {
      if (action.payload.status) {
        state.voucherCode = action.payload.code;
        state.totalDiscount = action.payload.value;
      } else {
        state.voucherCode = "";
        state.totalDiscount = 0;
      }
      // Always recalculate grandTotal from scratch after discount changes
      calculateTotals(state);
    },

    // handlingTotals is removed/refactored as totals are calculated directly

    // --- Reset Reducer ---
    reset(): CashierState {
      // Explicitly return CashierState type
      return initialState;
    },
  },
});

export const cashierActions = CashierSlice.actions;
export default CashierSlice.reducer; // Ensure you export the reducer as default
