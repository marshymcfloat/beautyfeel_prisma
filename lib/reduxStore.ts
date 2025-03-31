import { configureStore } from "@reduxjs/toolkit";
import { CashierSlice } from "@/lib/Slices/CashierSlice";
import { DataSlice } from "./Slices/DataSlice";

export const store = configureStore({
  reducer: {
    cashier: CashierSlice.reducer,
    data: DataSlice.reducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
