/**
 * Loading skeleton for the POS / sell page.
 * Two-column layout: product search on the left, cart on the right.
 */
export default function SellLoading() {
  return (
    <div className="flex h-full gap-4 p-4">
      {/* Left: product search area */}
      <div className="flex flex-1 flex-col gap-3">
        {/* Search bar */}
        <div className="h-10 w-full animate-pulse rounded-lg bg-ink-200" />
        {/* Product grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg bg-ink-200"
            />
          ))}
        </div>
      </div>

      {/* Right: cart area */}
      <div className="flex w-72 flex-col gap-3">
        <div className="h-8 w-24 animate-pulse rounded bg-ink-200" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-ink-200" />
        ))}
        <div className="mt-auto h-12 animate-pulse rounded-lg bg-ink-300" />
      </div>
    </div>
  );
}
