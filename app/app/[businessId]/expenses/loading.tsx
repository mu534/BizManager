/**
 * Loading skeleton for the expenses page — skeleton list with 5 items.
 */
export default function ExpensesLoading() {
  return (
    <div className="p-4">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-7 w-28 animate-pulse rounded bg-gray-200" />
        <div className="h-9 w-32 animate-pulse rounded-lg bg-gray-200" />
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <div className="flex flex-col gap-2">
              <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
              <div className="h-3 w-24 animate-pulse rounded bg-gray-100" />
            </div>
            <div className="h-5 w-20 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
