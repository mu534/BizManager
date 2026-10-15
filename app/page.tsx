import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "BizManager — Business Management for Retail Shops",
};

/**
 * Public landing page — shown to all visitors including unauthenticated users.
 * Does NOT read cookies or session data — fully statically renderable.
 */
export default function HomePage() {
  return (
    <div className="min-h-full flex flex-col">
      {/* Nav */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <span className="text-base font-bold text-gray-900">BizManager</span>
            <div className="flex items-center gap-3">
              <Link href="/sign-in"
                className="text-sm font-medium text-gray-600 hover:text-gray-900">
                Sign in
              </Link>
              <Link href="/sign-up"
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                Get started free
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 bg-gray-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
            Run your shop smarter
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            BizManager gives retail shops a fast, simple way to track inventory,
            record sales, manage expenses, and understand profit — even without internet.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/sign-up"
              className="rounded-md bg-blue-600 px-6 py-3 text-base font-semibold text-white hover:bg-blue-700">
              Create free account
            </Link>
            <Link href="/sign-in"
              className="rounded-md border border-gray-300 bg-white px-6 py-3 text-base font-semibold text-gray-700 hover:bg-gray-50">
              Sign in
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 pb-20">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-lg border border-gray-200 bg-white p-5">
                <div className="text-2xl mb-2">{f.icon}</div>
                <h3 className="font-semibold text-gray-900">{f.title}</h3>
                <p className="mt-1 text-sm text-gray-500">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </main>

      <footer className="border-t border-gray-200 bg-white py-6 text-center text-sm text-gray-400">
        © {new Date().getFullYear()} BizManager
      </footer>
    </div>
  );
}

const FEATURES = [
  {
    icon: "🛒",
    title: "Fast point of sale",
    description: "Complete a sale in seconds. Search by name or scan a barcode.",
  },
  {
    icon: "📦",
    title: "Inventory tracking",
    description: "Know exactly what you have in stock and get alerts when running low.",
  },
  {
    icon: "💰",
    title: "Expenses and accounts",
    description: "Record expenses, track your cash, Telebirr, and bank balances.",
  },
  {
    icon: "📊",
    title: "Profit reports",
    description: "See your revenue, costs, and net profit clearly — no accounting degree needed.",
  },
  {
    icon: "📵",
    title: "Works offline",
    description: "Record sales and expenses even without internet. Data syncs automatically.",
  },
  {
    icon: "🏪",
    title: "Multi-branch ready",
    description: "Start with one shop. Expand to multiple branches when you're ready.",
  },
];
