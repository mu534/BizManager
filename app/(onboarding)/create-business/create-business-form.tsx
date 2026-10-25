"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { BUSINESS_TYPES } from "@shared/validation/business.schema";

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  clothing: "Clothing shop",
  shoes: "Shoe shop",
  electronics: "Electronics shop",
  grocery: "Grocery shop",
  cosmetics: "Cosmetics shop",
  general_retail: "General retail store",
  other: "Other",
};

interface Props {
  userName: string;
}

type FormState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

export default function CreateBusinessForm({ userName }: Props) {
  const router = useRouter();
  const [formState, setFormState] = useState<FormState>({ status: "idle" });

  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<string>("");
  const [country, setCountry] = useState("ET");
  const [currency, setCurrency] = useState("ETB");
  const [phone, setPhone] = useState("");
  const [branchName, setBranchName] = useState("Main Branch");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!businessName.trim() || businessName.trim().length < 2) {
      setFormState({ status: "error", message: "Enter a business name (at least 2 characters)." });
      return;
    }
    if (!businessType) {
      setFormState({ status: "error", message: "Select a business type." });
      return;
    }

    setFormState({ status: "loading" });

    try {
      const res = await fetch("/api/business/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          businessType,
          country: country.toUpperCase(),
          currency: currency.toUpperCase(),
          phone: phone.trim() || undefined,
          branchName: branchName.trim() || "Main Branch",
        }),
      });

      const data = (await res.json()) as {
        businessId?: string;
        error?: { message?: string };
      };

      if (!res.ok) {
        setFormState({
          status: "error",
          message: data.error?.message ?? "Failed to create business. Please try again.",
        });
        return;
      }

      // Next step of registration: choose a plan and submit the payment.
      router.push(`/app/${data.businessId}/settings/subscription`);
    } catch {
      setFormState({
        status: "error",
        message: "Network error. Check your connection and try again.",
      });
    }
  }

  const loading = formState.status === "loading";

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <p className="text-sm text-ink-600">
        Welcome, <strong>{userName}</strong>! Tell us about your business.
      </p>

      {formState.status === "error" && (
        <div
          role="alert"
          className="rounded-md bg-danger-50 border border-danger-600/25 px-4 py-3 text-sm text-danger-700"
        >
          {formState.message}
        </div>
      )}

      <div>
        <label
          htmlFor="businessName"
          className="block text-sm font-medium text-ink-700 mb-1"
        >
          Business name <span className="text-danger-600">*</span>
        </label>
        <input
          id="businessName"
          type="text"
          required
          value={businessName}
          onChange={(e) => setBusinessName(e.target.value)}
          disabled={loading}
          maxLength={120}
          className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-ink-50"
          placeholder="e.g. Selam Fashion Store"
        />
      </div>

      <div>
        <label
          htmlFor="businessType"
          className="block text-sm font-medium text-ink-700 mb-1"
        >
          Business type <span className="text-danger-600">*</span>
        </label>
        <select
          id="businessType"
          required
          value={businessType}
          onChange={(e) => setBusinessType(e.target.value)}
          disabled={loading}
          className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-ink-50"
        >
          <option value="">Select type…</option>
          {BUSINESS_TYPES.map((type) => (
            <option key={type} value={type}>
              {BUSINESS_TYPE_LABELS[type] ?? type}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label
            htmlFor="country"
            className="block text-sm font-medium text-ink-700 mb-1"
          >
            Country
          </label>
          <input
            id="country"
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
            disabled={loading}
            maxLength={2}
            className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm uppercase focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-ink-50"
            placeholder="ET"
          />
          <p className="mt-1 text-xs text-ink-400">ISO 3166 2-letter code</p>
        </div>

        <div>
          <label
            htmlFor="currency"
            className="block text-sm font-medium text-ink-700 mb-1"
          >
            Currency
          </label>
          <input
            id="currency"
            type="text"
            value={currency}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())}
            disabled={loading}
            maxLength={3}
            className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm uppercase focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-ink-50"
            placeholder="ETB"
          />
          <p className="mt-1 text-xs text-ink-400">ISO 4217 3-letter code</p>
        </div>
      </div>

      <div>
        <label
          htmlFor="phone"
          className="block text-sm font-medium text-ink-700 mb-1"
        >
          Phone number{" "}
          <span className="font-normal text-ink-400">(optional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={loading}
          maxLength={30}
          className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-ink-50"
          placeholder="+251 91 123 4567"
        />
      </div>

      <div>
        <label
          htmlFor="branchName"
          className="block text-sm font-medium text-ink-700 mb-1"
        >
          First branch name{" "}
          <span className="font-normal text-ink-400">(your main shop)</span>
        </label>
        <input
          id="branchName"
          type="text"
          value={branchName}
          onChange={(e) => setBranchName(e.target.value)}
          disabled={loading}
          maxLength={100}
          className="block w-full rounded-md border border-line-strong px-3 py-2 text-sm shadow-sm placeholder-gray-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600 disabled:bg-ink-50"
          placeholder="Main Branch"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Creating…" : "Create business"}
      </button>
    </form>
  );
}
