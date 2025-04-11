// components/ui/cashier/SelectedItem.tsx
"use client";

import React from "react"; // Added React import
import { Minus, Plus, X } from "lucide-react";
import { useDispatch } from "react-redux";
import { cashierActions } from "@/lib/Slices/CashierSlice";
import type { AppDispatch } from "@/lib/reduxStore";

type SelectedItemProps = {
  id: string;
  name: string;
  quantity: number;
  originalPrice: number;
  discountApplied: number;
  type: "service" | "set";
};

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
    if (type === "service") {
      dispatch(
        cashierActions.handleItemQuantity({ id, identifier: changeType }),
      );
    }
  };

  // Calculate effective price AFTER discount for display
  const finalPricePerUnit = originalPrice - discountApplied / quantity;
  const finalTotalPrice = finalPricePerUnit * quantity;

  return (
    // Main container: Use padding, theme background/border
    <div className="mb-2 flex flex-col gap-2 rounded-md border border-customGray/40 bg-customWhiteBlue p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
      {/* Left Side: Item Details (Allow wrapping) */}
      <div className="mb-2 flex-grow sm:mb-0 sm:pr-4">
        {/* Title and Type */}
        <p className="text-sm font-medium leading-tight text-customBlack">
          {name}
          {type === "set" && (
            <span className="ml-1 rounded-full bg-customDarkPink px-1.5 py-0.5 align-middle text-[10px] font-normal text-white">
              SET
            </span>
          )}
        </p>
        {/* Price per Item (with discount shown) */}
        <p className="mt-0.5 text-xs text-gray-600">
          {discountApplied > 0 ? (
            <>
              <span className="line-through">
                ₱{originalPrice.toLocaleString()}
              </span>{" "}
              <span className="text-green-700">
                ₱
                {finalPricePerUnit.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                })}
              </span>
            </>
          ) : (
            `₱${originalPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}`
          )}
          <span className="text-gray-500"> / each</span>
        </p>
      </div>

      {/* Right Side: Controls, Total, Remove Button */}
      <div className="flex flex-shrink-0 items-center justify-end gap-3 sm:gap-4">
        {" "}
        {/* Increased gap */}
        {/* Quantity Controls (Only for Services) */}
        <div className="flex items-center space-x-1.5">
          {" "}
          {/* Increased space */}
          {type === "service" ? (
            <>
              <button
                onClick={() => handleQuantityChange("dec")}
                // Slightly larger button, better padding
                className="flex h-6 w-6 items-center justify-center rounded border border-customDarkPink/50 text-customDarkPink transition hover:bg-customDarkPink hover:text-white disabled:cursor-not-allowed disabled:border-customGray disabled:text-customGray"
                title="Decrease quantity"
                disabled={quantity <= 1}
              >
                <Minus size={14} strokeWidth={2.5} />
              </button>
              {/* Wider span for quantity */}
              <span className="w-7 text-center text-sm font-semibold text-customBlack">
                {quantity}
              </span>
              <button
                onClick={() => handleQuantityChange("inc")}
                className="flex h-6 w-6 items-center justify-center rounded border border-customDarkPink/50 text-customDarkPink transition hover:bg-customDarkPink hover:text-white"
                title="Increase quantity"
              >
                <Plus size={14} strokeWidth={2.5} />
              </button>
            </>
          ) : (
            // Display quantity for sets, maybe slightly smaller
            <span className="w-7 text-center text-sm font-medium text-customBlack/80">
              {quantity}x
            </span>
          )}
        </div>
        {/* Total Price */}
        {/* Made text slightly larger and bolder */}
        <span className="w-20 flex-shrink-0 text-right text-sm font-semibold text-customBlack sm:w-24">
          {" "}
          {/* Give it some minimum width */}₱
          {finalTotalPrice.toLocaleString(undefined, {
            minimumFractionDigits: 2,
          })}
        </span>
        {/* Remove Button */}
        <button
          onClick={handleRemove}
          className="flex-shrink-0 rounded p-1 text-red-500 transition hover:bg-red-100"
          title="Remove item"
        >
          <X size={18} /> {/* Slightly larger icon */}
        </button>
      </div>
    </div>
  );
}
