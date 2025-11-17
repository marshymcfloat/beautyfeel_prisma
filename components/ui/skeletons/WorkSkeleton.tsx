export function WorkSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-customGray bg-white p-3">
        <div className="h-6 w-32 rounded bg-gray-200"></div>
      </div>

      {/* Content */}
      <div className="flex h-full flex-col">
        {/* Table Header */}
        <div className="sticky top-0 z-20 border-b border-t border-customGray bg-customOffWhite px-4 py-2.5">
          <div className="h-5 w-40 rounded bg-gray-200"></div>
        </div>

        {/* Table Rows */}
        <div className="space-y-1 bg-white p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 border-b border-customGray py-3">
              <div className="h-4 w-24 rounded bg-gray-200"></div>
              <div className="h-4 w-32 rounded bg-gray-200"></div>
              <div className="h-6 w-20 rounded-full bg-gray-200"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

