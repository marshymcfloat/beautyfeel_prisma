export function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Header */}
      <div className="mb-6 flex flex-shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-8 w-64 rounded bg-gray-200"></div>
      </div>

      {/* Desktop Grid */}
      <div className="hidden xl:block">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
          {/* Attendance Widget */}
          <div className="min-h-[300px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 md:col-span-2 xl:col-span-2">
            <div className="mb-3 h-5 w-32 rounded bg-gray-200"></div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded bg-gray-200"></div>
              ))}
            </div>
          </div>

          {/* Sales Widget */}
          <div className="w-full rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 md:col-span-2 xl:col-span-1">
            <div className="mb-3 h-5 w-24 rounded bg-gray-200"></div>
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 rounded bg-gray-200"></div>
              ))}
            </div>
          </div>

          {/* Calendar & Widgets */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:justify-between md:col-span-2 md:gap-6 xl:col-span-1 xl:flex-row xl:flex-wrap xl:gap-4">
            <div className="aspect-square w-full rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 sm:w-auto xl:flex-1">
              <div className="h-full rounded bg-gray-200"></div>
            </div>
            <div className="aspect-square w-full rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 sm:w-auto xl:flex-1">
              <div className="h-full rounded bg-gray-200"></div>
            </div>
          </div>

          {/* Salary Widget */}
          <div className="flex min-h-[170px] flex-col items-start justify-between space-y-2 rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 md:col-span-1 xl:col-span-1">
            <div className="mb-2 h-5 w-32 rounded bg-gray-200"></div>
            <div className="h-16 w-full rounded bg-gray-200"></div>
            <div className="mt-auto h-10 w-full rounded bg-gray-200"></div>
          </div>

          {/* Claims Widget */}
          <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 md:col-span-1 xl:col-span-1">
            <div className="mb-3 h-5 w-24 rounded bg-gray-200"></div>
            <div className="h-20 rounded bg-gray-200"></div>
          </div>

          {/* GC Widget */}
          <div className="rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 md:col-span-1 xl:col-span-1">
            <div className="h-24 rounded bg-gray-200"></div>
          </div>

          {/* Customer History Widget */}
          <div className="min-h-[170px] rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4 md:col-span-1 xl:col-span-1">
            <div className="mb-3 h-5 w-32 rounded bg-gray-200"></div>
            <div className="h-20 rounded bg-gray-200"></div>
          </div>
        </div>
      </div>

      {/* Mobile View */}
      <div className="block xl:hidden">
        <div className="grid grid-cols-2 gap-3 p-2 sm:grid-cols-3 sm:gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="aspect-square rounded-lg border border-customGray/30 bg-customOffWhite/90 p-4"
            >
              <div className="h-full rounded bg-gray-200"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

