import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resolveUserIdentityFromSession } from "@server/auth/resolve-context";
import { getBusinessesForUser } from "@server/services/business.service";
import CreateBusinessForm from "./create-business-form";

export const metadata: Metadata = { title: "Set Up Your Business" };

// Reads cookies via resolveUserIdentityFromSession — must not prerender.
export const instant = false;

/**
 * Onboarding page — create your first business.
 *
 * If the user already has a business, redirect them to the app.
 * This is a Server Component that checks session state, then renders
 * the client-side form.
 */
export default async function CreateBusinessPage() {
  // Redirect to sign-in if not authenticated.
  const identity = await resolveUserIdentityFromSession().catch(() => null);
  if (!identity) {
    redirect("/sign-in");
  }

  // If the user already has businesses, skip onboarding.
  const businesses = await getBusinessesForUser(identity.userId);
  if (businesses.length > 0) {
    const firstBusiness = businesses[0]!;
    redirect(`/app?businessId=${firstBusiness.business.id}`);
  }

  return (
    <div className="min-h-full flex flex-col items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            BizManager
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Let&apos;s set up your business
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-sm rounded-lg border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-1">
            Create your business
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            You can update these details later from your settings.
          </p>
          <CreateBusinessForm userName={identity.name} />
        </div>
      </div>
    </div>
  );
}
