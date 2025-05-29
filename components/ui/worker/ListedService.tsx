import React from "react";

type ServiceProps = {
  id: string;
  name: string;
  price: number;
};

type ListedServiceProps = {
  customerName: string;
  service: ServiceProps;
  checked: boolean;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export default function ListedService({
  customerName,
  service,
  checked,
  onChange,
}: ListedServiceProps) {
  const uniqueId = `service-${service.id}-${customerName.replace(/\s+/g, "-")}`;

  return (
    <div className="flex items-center rounded-lg bg-customDarkPink p-3 text-customOffWhite shadow-md transition-colors duration-150 ease-in-out hover:bg-pink-800">
      {}
      <div className="mr-4 flex-shrink-0">
        <input
          type="checkbox"
          name="selectedService"
          id={uniqueId}
          checked={checked}
          onChange={onChange}
          value={service.id}
          className="size-5 cursor-pointer rounded border-gray-300 bg-gray-700 text-pink-400 accent-pink-400 focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 focus:ring-offset-customDarkPink"
        />
      </div>

      {}
      <div className="w-full">
        {}
        <p className="text-base font-semibold leading-tight">{customerName}</p>

        {}
        <div className="mt-1 flex items-baseline justify-between">
          {}
          <label
            htmlFor={uniqueId}
            className="cursor-pointer text-sm opacity-90"
          >
            {service.name}
          </label>
          <p className="text-sm font-medium opacity-90">
            ₱{service.price.toLocaleString()} {}
          </p>
        </div>
      </div>
    </div>
  );
}
