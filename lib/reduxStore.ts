import { configureStore } from "@reduxjs/toolkit";
import { CashierSlice } from "@/lib/Slices/CashierSlice";

export const store = configureStore({
  reducer: {
    cashier: CashierSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
