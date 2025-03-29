"use client";

import { Plus, Minus } from "lucide-react";
import { useDispatch } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";

export default function SelectedService({
  name,
  quantity,
  price,
}: {
  name: string;
  quantity: number;
  price: number;
}) {
  const dispatch = useDispatch();

  return (
    <div className="flex  my-2 items-center shadow-custom min-h-[50px] rounded-md bg-customDarkPink">
      <span className="w-[10%]  text-center text-lg font-medium">
        {quantity}x
      </span>
      <div className="flex  w-[50%] flex-col pl-2">
        <p className="tracking-widest font-medium">{name}</p>
        <p>{price}</p>
      </div>
      <div className="flex  justify-around w-[20%]">
        <button
          type="button"
          onClick={() =>
            dispatch(
              cashierActions.handleServicesQuantity({
                identifier: "dec",
                title: name,
              }),
            )
          }
          className="rounded-md size-6 border-2 border-black bg-black flex items-center justify-center"
        >
          <Minus color="#C28583" />
        </button>
        <button
          type="button"
          onClick={() =>
            dispatch(
              cashierActions.handleServicesQuantity({
                identifier: "inc",
                title: name,
              }),
            )
          }
          className="rounded-md size-6 border-2 border-black flex items-center justify-center"
        >
          <Plus color="black" />
        </button>
      </div>
      <span className="w-[20%] text-center font-medium">
        &#x20B1;{quantity * price}
      </span>
    </div>
  );
}
