import React from "react";
import { useDispatch } from "react-redux";
import { MinusCircle, PlusCircle, XCircle } from "lucide-react";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import { AvailedItem } from "@/lib/Types";

// SelectedItemProps type is now AvailedItem + the disabled prop
type SelectedItemProps = AvailedItem & {
  disabled?: boolean; // Define the disabled prop
};

export default function SelectedItem({
  id,
  name,
  quantity,
  originalPrice,
  discountApplied,
  type,
  disabled, // Accept the disabled prop
}: SelectedItemProps) {
  const dispatch = useDispatch();

  const handleRemove = () => {
    // Prevent action if disabled
    if (!disabled) {
      dispatch(
        cashierActions.selectItem({
          id,
          title: name,
          price: originalPrice,
          type,
        }),
      );
    }
  };

  const handleQuantity = (identifier: "inc" | "dec") => {
    // Prevent action if disabled
    if (!disabled) {
      if (type === "set") {
        console.warn("Cannot change quantity of a Service Set item.");
        return;
      }
      dispatch(cashierActions.handleItemQuantity({ id, type, identifier }));
    }
  };

  // Calculate display price per unit after item-level discount
  const discountedPricePerUnit =
    quantity > 0
      ? (originalPrice * quantity - discountApplied) / quantity
      : originalPrice;

  return (
    // Added disabled opacity style to the container div
    <div
      className={`mb-2 flex items-center justify-between rounded-md border border-gray-200 bg-gray-50 p-2 text-sm shadow-sm ${disabled ? "opacity-60" : ""}`}
    >
      <div className="flex-grow pr-2">
        <p className="font-medium text-gray-800">{name}</p>
        <p className="text-xs text-gray-600">
          ₱
          {discountedPricePerUnit.toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}{" "}
          each x {quantity}
          {discountApplied > 0 && (
            <span className="ml-1 text-green-700">
              (Disc: ₱
              {discountApplied.toLocaleString(undefined, {
                minimumFractionDigits: 2,
              })}
              )
            </span>
          )}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center space-x-1">
        {type === "service" && (
          <>
            <button
              onClick={() => handleQuantity("dec")}
              // Disable if quantity is 1 or less OR if the component is disabled
              disabled={quantity <= 1 || disabled} // Apply the disabled prop here
              className="rounded-full p-1 text-red-600 hover:bg-red-100 disabled:cursor-not-allowed disabled:text-gray-400"
              aria-label="Decrease quantity"
            >
              <MinusCircle size={16} />
            </button>
            <span className="px-1 font-medium">{quantity}</span>
            <button
              onClick={() => handleQuantity("inc")}
              // Disable if the component is disabled
              disabled={disabled} // Apply the disabled prop here
              className="rounded-full p-1 text-green-600 hover:bg-green-100 disabled:cursor-not-allowed disabled:text-gray-400"
              aria-label="Increase quantity"
            >
              <PlusCircle size={16} />
            </button>
          </>
        )}
        <button
          onClick={handleRemove}
          // Disable if the component is disabled
          disabled={disabled} // Apply the disabled prop here
          className="ml-2 rounded-full p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700 disabled:cursor-not-allowed disabled:text-gray-400"
          aria-label="Remove item"
        >
          <XCircle size={16} />
        </button>
      </div>
    </div>
  );
}
