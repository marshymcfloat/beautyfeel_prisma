import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface CashierState {
  name: string;
  date: string;
  time: string;
  email: string;
  servicesAvailed: ServiceProps[];
  serviceType: "single" | "set";
  voucherCode: string;
  serveTime: "now" | "later";
  paymentMethod: "ewallet" | "cash" | "bank";
  grandTotal: number;
  totalDiscount: number;
}

type ServiceProps = {
  id: string;
  title: string;
  price: number;
  quantity: number;
};

const initialState: CashierState = {
  name: "",
  serviceType: "single",
  serveTime: "now",
  date: "",
  time: "",
  email: "",
  servicesAvailed: [],
  voucherCode: "",
  paymentMethod: "cash",
  grandTotal: 0,
  totalDiscount: 0,
};

export const CashierSlice = createSlice({
  name: "cashier",
  initialState,
  reducers: {
    selectCustomerSuggestion(
      state: CashierState,
      action: PayloadAction<string>,
    ) {
      state.name = action.payload;
    },
    setCustomerName(state: CashierState, action: PayloadAction<string>) {
      state.name = action.payload;
    },
    setEmail(state: CashierState, action: PayloadAction<string>) {
      state.email = action.payload;
    },
    setServiceType(
      state: CashierState,
      action: PayloadAction<"single" | "set">,
    ) {
      state.serviceType = action.payload;
    },
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
    selectingService(state, action) {
      const existingService = state.servicesAvailed.find(
        (service) => service.title === action.payload.title,
      );

      if (!existingService) {
        // Ensure the service object matches ServiceProps structure
        state.servicesAvailed.push({
          id: action.payload.id,
          title: action.payload.title,
          price: action.payload.price,
          quantity: 1,
        });
      } else {
        // Remove the service if it already exists
        state.servicesAvailed = state.servicesAvailed.filter(
          (service) => service.title !== action.payload.title,
        );
      }
    },
    handleServicesQuantity(state, action) {
      if (action.payload.identifier === "inc") {
        state.servicesAvailed = state.servicesAvailed.map((service) =>
          service.title === action.payload.title
            ? { ...service, quantity: service.quantity + 1 }
            : service,
        );
      }

      if (action.payload.identifier === "dec") {
        state.servicesAvailed = state.servicesAvailed
          .map((service) =>
            service.title === action.payload.title
              ? { ...service, quantity: service.quantity - 1 }
              : service,
          )
          .filter((service) => service.quantity > 0);
      }

      // **Recalculate grandTotal after changing quantity**
      const total = state.servicesAvailed.reduce(
        (sum, service) => sum + service.price * service.quantity,
        0,
      );

      state.grandTotal = total - state.totalDiscount;
    },
    handlingTotals(state, action) {
      if (action.payload.identifier === "grandTotal") {
        state.grandTotal = action.payload.value - state.totalDiscount;
      }
    },
    setDiscount(state, action) {
      if (action.payload.status) {
        state.voucherCode = action.payload.code;
        state.totalDiscount = action.payload.value;
      } else {
        state.voucherCode = "";
        state.totalDiscount = 0;
      }

      state.grandTotal = state.grandTotal - state.totalDiscount;
    },
    setDateTime(state, action: PayloadAction<{ date: string; time: string }>) {
      state.date = action.payload.date;
      state.time = action.payload.time;
    },

    reset() {
      return initialState;
    },
  },
});

export const cashierActions = CashierSlice.actions;
