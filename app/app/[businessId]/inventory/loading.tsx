/**
 * Loading skeleton for the inventory page — skeleton table with 5 rows.
 */
export default function InventoryLoading() {
  return (
    <div className="p-4">
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="h-7 w-32 animate-pulse rounded bg-gray-200" />
        <div className="h-9 w-28 animate-pulse rounded-lg bg-gray-200" />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-gray-200">
        {/* Header row */}
        <div className="flex gap-4 border-b border-gray-200 bg-gray-50 px-4 py-3">
          {[140, 80, 80, 100, 70].map((w, i) => (
            <div
              key={i}
              className="h-4 animate-pulse rounded bg-gray-300"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* Data rows */}
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-4 border-b border-gray-100 px-4 py-3 last:border-0"
          >
            {[140, 80, 80, 100, 70].map((w, j) => (
              <div
                key={j}
                className="h-4 animate-pulse rounded bg-gray-200"
                style={{ width: w }}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
