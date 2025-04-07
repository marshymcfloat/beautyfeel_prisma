// components/ui/cashier/SelectedItem.tsx (Renamed file)
"use client";

import { Minus, Plus, X } from "lucide-react";
import { useDispatch } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import type { AppDispatch } from "@/lib/reduxStore";

// Updated props to match AvailedItem structure from Redux
type SelectedItemProps = {
  id: string;
  name: string;
  quantity: number;
  originalPrice: number; // Use originalPrice
  discountApplied: number; // Amount of discount applied
  type: "service" | "set"; // Distinguish type
  // Removed onQuantityChange prop, dispatch directly
};

// Renamed component
export default function SelectedItem({
  id,
  name,
  quantity,
  originalPrice,
  discountApplied,
  type,
}: SelectedItemProps) {
  const dispatch = useDispatch<AppDispatch>();

  const handleRemove = () => {
    // Dispatch action to remove the item (toggle behavior)
    dispatch(
      cashierActions.selectItem({
        id,
        title: name,
        price: originalPrice,
        type,
      }),
    );
  };

  const handleQuantityChange = (changeType: "inc" | "dec") => {
    // Dispatch the correct action for quantity change
    if (type === "service") {
      // Only allow for services
      dispatch(
        cashierActions.handleItemQuantity({ id, identifier: changeType }),
      );
    }
  };

  // Calculate effective price AFTER discount for display
  const finalPricePerUnit = originalPrice - discountApplied / quantity;
  const finalTotalPrice = finalPricePerUnit * quantity;

  return (
    // Use custom theme colors
    <div className="mb-2 flex items-center justify-between rounded-md border border-customGray/50 bg-customWhiteBlue p-2 shadow-sm">
      {/* Item Details */}
      <div className="flex-grow pr-2">
        <p className="text-sm font-medium text-customBlack">
          {name}{" "}
          {type === "set" ? (
            <span className="text-xs font-normal text-customDarkPink">
              (Set)
            </span>
          ) : (
            ""
          )}
        </p>
        <p className="text-xs text-gray-600">
          {/* Show original price and discount if applied */}
          {discountApplied > 0 ? (
            <>
              <span className="line-through">
                ₱{originalPrice.toLocaleString()}
              </span>{" "}
              <span className="text-green-700">
                ₱{finalPricePerUnit.toLocaleString()}
              </span>
              {/* Optional: Show discount per item -> <span className="text-xs text-red-600"> (-₱{(discountApplied / quantity).toLocaleString()})</span> */}
            </>
          ) : (
            `₱${originalPrice.toLocaleString()}` // Show original if no discount
          )}{" "}
          / each
        </p>
      </div>

      {/* Quantity Controls (Only for Services) */}
      <div className="flex flex-shrink-0 items-center space-x-1">
        {type === "service" ? (
          <>
            <button
              onClick={() => handleQuantityChange("dec")}
              className="rounded border border-customDarkPink p-0.5 text-customDarkPink transition hover:bg-customDarkPink hover:text-white disabled:cursor-not-allowed disabled:border-customGray disabled:text-customGray"
              title="Decrease quantity"
              disabled={quantity <= 1} // Disable if quantity is 1
            >
              <Minus size={14} />
            </button>
            <span className="w-6 text-center text-sm font-medium">
              {quantity}
            </span>
            <button
              onClick={() => handleQuantityChange("inc")}
              className="rounded border border-customDarkPink p-0.5 text-customDarkPink transition hover:bg-customDarkPink hover:text-white"
              title="Increase quantity"
            >
              <Plus size={14} />
            </button>
          </>
        ) : (
          // Display quantity for sets, but no controls
          <span className="w-6 text-center text-sm font-medium">
            {quantity}x
          </span>
        )}
      </div>

      {/* Total Price & Remove Button */}
      <div className="flex w-[25%] flex-shrink-0 items-center justify-end space-x-2 pl-2 md:w-[20%]">
        <span className="text-right text-sm font-medium text-customBlack">
          ₱{finalTotalPrice.toLocaleString()}
        </span>
        <button
          onClick={handleRemove}
          className="rounded p-1 text-red-500 transition hover:bg-red-100"
          title="Remove item"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
