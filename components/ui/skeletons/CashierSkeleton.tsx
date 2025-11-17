export function CashierSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      {/* Header */}
      <div className="mb-6 flex items-center gap-4">
        <div className="h-6 w-16 rounded bg-gray-200"></div>
        <div className="h-8 w-48 rounded bg-gray-200"></div>
      </div>

      {/* Form Fields */}
      <div className="space-y-5">
        {/* Customer Name */}
        <div>
          <div className="mb-2 h-4 w-24 rounded bg-gray-200"></div>
          <div className="h-10 w-full rounded-md bg-gray-200"></div>
        </div>

        {/* Email */}
        <div>
          <div className="mb-2 h-4 w-20 rounded bg-gray-200"></div>
          <div className="h-10 w-full rounded-md bg-gray-200"></div>
        </div>

        {/* Service Type */}
        <div>
          <div className="mb-2 h-4 w-24 rounded bg-gray-200"></div>
          <div className="h-10 w-full rounded-md bg-gray-200"></div>
        </div>

        {/* Services Select */}
        <div>
          <div className="mb-2 h-4 w-32 rounded bg-gray-200"></div>
          <div className="h-32 w-full rounded-md bg-gray-200"></div>
        </div>

        {/* Selected Items */}
        <div>
          <div className="mb-2 h-4 w-28 rounded bg-gray-200"></div>
          <div className="min-h-[80px] w-full rounded-md border border-customGray/50 bg-gray-100 p-2">
            <div className="h-12 rounded bg-gray-200"></div>
          </div>
        </div>

        {/* Totals */}
        <div className="mt-4 space-y-2">
          <div className="flex justify-between">
            <div className="h-4 w-20 rounded bg-gray-200"></div>
            <div className="h-4 w-24 rounded bg-gray-200"></div>
          </div>
          <div className="flex justify-between">
            <div className="h-5 w-32 rounded bg-gray-200"></div>
            <div className="h-5 w-28 rounded bg-gray-200"></div>
          </div>
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-around border-t border-customGray/30 pt-4">
          <div className="h-10 w-24 rounded bg-gray-200"></div>
          <div className="h-10 w-40 rounded bg-gray-200"></div>
        </div>
      </div>
    </div>
  );
}

