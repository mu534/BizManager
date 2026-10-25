/**
 * Loading skeleton for the reports section — 4 metric cards.
 */
export default function ReportsLoading() {
  return (
    <div className="p-4">
      {/* Page header */}
      <div className="mb-6 h-7 w-24 animate-pulse rounded bg-gray-200" />

      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
            <div className="h-7 w-28 animate-pulse rounded bg-gray-300" />
            <div className="h-3 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Chart placeholder */}
      <div className="mt-6 h-48 animate-pulse rounded-lg bg-gray-200" />
    </div>
  );
}
