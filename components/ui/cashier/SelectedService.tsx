// SelectedService.tsx
"use client";

import { Plus, Minus } from "lucide-react";
import { useDispatch } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";

export default function SelectedService({
  id, // <-- Add id to props definition
  name,
  quantity,
  price,
}: {
  id: string; // <-- Define the type for id
  name: string;
  quantity: number;
  price: number;
}) {
  const dispatch = useDispatch();

  return (
    <div className="my-2 flex min-h-[50px] items-center rounded-md bg-customDarkPink shadow-custom">
      <span className="w-[10%] text-center text-lg font-medium">
        {quantity}x
      </span>
      <div className="flex w-[50%] flex-col pl-2">
        <p className="font-medium tracking-widest">{name}</p>
        <p>{price}</p>
      </div>
      <div className="flex w-[20%] justify-around">
        <button
          type="button"
          onClick={() =>
            dispatch(
              cashierActions.handleServicesQuantity({
                identifier: "dec",
                id: id, // <-- Use the id prop here
              }),
            )
          }
          className="flex size-6 items-center justify-center rounded-md border-2 border-black bg-black"
        >
          <Minus color="#C28583" />
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch(
              cashierActions.handleServicesQuantity({
                identifier: "inc",
                id: id, // <-- Use the id prop here
              }),
            )
          }
          className="flex size-6 items-center justify-center rounded-md border-2 border-black"
        >
          <Plus color="black" />
        </button>
      </div>
      <span className="w-[20%] text-center font-medium">
        ₱{(quantity * price).toLocaleString()}{" "}
        {/* Added toLocaleString for formatting */}
      </span>
    </div>
  );
}
