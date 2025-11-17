export function ManageSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-customGray bg-white p-4">
        <div className="h-8 w-48 rounded bg-gray-200"></div>
      </div>

      <div className="flex flex-grow overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 flex-shrink-0 border-r border-customGray bg-white p-4">
          <div className="space-y-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 w-full rounded-lg bg-gray-200"></div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-grow overflow-y-auto bg-customOffWhite p-6">
          <div className="space-y-4">
            <div className="h-8 w-64 rounded bg-gray-200"></div>
            <div className="h-64 w-full rounded-lg border border-customGray/30 bg-white p-4">
              <div className="space-y-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 rounded bg-gray-200"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

