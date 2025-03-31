// components/worker/ListedService.jsx

import React from "react";

// Updated Props: Added checked state and onChange handler for the checkbox
type ServiceProps = {
  id: string;
  name: string;
  price: number;
};

type ListedServiceProps = {
  customerName: string;
  service: ServiceProps;
  checked: boolean; // Is this item currently selected?
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void; // Function to call when checkbox changes
};

export default function ListedService({
  customerName,
  service,
  checked,
  onChange,
}: ListedServiceProps) {
  const uniqueId = `service-${service.id}-${customerName.replace(/\s+/g, "-")}`; // Create a more unique ID for the input/label

  return (
    // Use a container with margin-bottom for spacing within the list
    // Increased padding, softer corners, subtle shadow
    <div className="flex items-center rounded-lg bg-customDarkPink p-3 text-customOffWhite shadow-md transition-colors duration-150 ease-in-out hover:bg-pink-800">
      {/* Checkbox Area - ensure it doesn't shrink and aligns center */}
      <div className="mr-4 flex-shrink-0">
        <input
          type="checkbox"
          name="selectedService" // Give a common name if part of a form
          id={uniqueId}
          checked={checked}
          onChange={onChange}
          value={service.id} // Useful if submitting selected IDs
          // Style the checkbox - requires @tailwindcss/forms or manual styling
          // Using accent color for modern browsers
          className="size-5 cursor-pointer rounded border-gray-300 bg-gray-700 text-pink-400 accent-pink-400 focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 focus:ring-offset-customDarkPink"
        />
      </div>

      {/* Details Area - Takes remaining width */}
      <div className="w-full">
        {/* Customer Name - More prominent */}
        <p className="text-base font-semibold leading-tight">{customerName}</p>

        {/* Service Name and Price - Use flex, justify-between */}
        <div className="mt-1 flex items-baseline justify-between">
          {/* Label clicking also toggles checkbox */}
          <label
            htmlFor={uniqueId}
            className="cursor-pointer text-sm opacity-90"
          >
            {service.name}
          </label>
          <p className="text-sm font-medium opacity-90">
            ₱{service.price.toLocaleString()} {/* Added formatting */}
          </p>
        </div>
      </div>
    </div>
  );
}
