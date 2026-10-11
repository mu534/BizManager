import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        {/* Brand mark */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            BizManager
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Business management for retail shops
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
