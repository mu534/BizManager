"use client";

import { useState } from "react";
import Link from "next/link";
import { formatMoney } from "@components/ui/format";

export interface PricingPlanView {
  code: string;
  name: string;
  tagline: string;
  currency: string | null;
  monthlyMinor: number | null;
  yearlyMinor: number | null;
  savePercent: number;
  includesLabel: string | null;
  lines: { text: string; soon: boolean }[];
  featured: boolean;
}
export interface PricingLabels {
  monthly: string;
  yearly: string;
  perMonth: string;
  perYear: string;
  save: string; // already formatted per plan via savePercent below (template with {pct})
  cta: string;
  soon: string;
  priceUnavailable: string;
}

export function PricingClient({
  plans,
  labels,
  signUpHref,
}: {
  plans: PricingPlanView[];
  labels: PricingLabels;
  signUpHref: string;
}) {
  const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY");

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div
          role="radiogroup"
          aria-label={`${labels.monthly} / ${labels.yearly}`}
          className="inline-flex rounded-control border border-line-strong bg-surface p-0.5 text-sm"
        >
          {(["MONTHLY", "YEARLY"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={period === v}
              onClick={() => setPeriod(v)}
              className={`rounded-[5px] px-4 py-1.5 font-medium transition focus-visible:outline-2 focus-visible:outline-brand-600 ${
                period === v
                  ? "bg-brand-600 text-white"
                  : "text-ink-700 hover:bg-ink-100"
              }`}
            >
              {v === "MONTHLY" ? labels.monthly : labels.yearly}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => {
          const amount =
            period === "MONTHLY" ? p.monthlyMinor : p.yearlyMinor;
          return (
            <article
              key={p.code}
              className={`flex flex-col rounded-card p-6 ${
                p.featured
                  ? "bg-brand-gradient text-white shadow-pop ring-2 ring-brand-400/40"
                  : "border border-line-strong bg-surface shadow-card"
              }`}
            >
              {p.featured && (
                <div className="mb-3 self-start rounded-full border border-white/30 bg-white/20 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-widest text-white">
                  Most popular
                </div>
              )}
              <h3
                className={`text-lg font-semibold ${
                  p.featured ? "text-white" : "text-ink-900"
                }`}
              >
                {p.name}
              </h3>
              <p
                className={`mt-1 text-sm ${
                  p.featured ? "text-brand-100" : "text-ink-500"
                }`}
              >
                {p.tagline}
              </p>

              <div className="mt-5 min-h-[4.5rem]">
                {amount !== null && p.currency ? (
                  <>
                    <p
                      className={`text-3xl font-semibold tracking-tight ${
                        p.featured ? "text-white" : "text-ink-900"
                      }`}
                    >
                      {formatMoney(amount, p.currency)}
                    </p>
                    <p
                      className={`text-sm ${
                        p.featured ? "text-brand-100" : "text-ink-500"
                      }`}
                    >
                      {period === "MONTHLY" ? labels.perMonth : labels.perYear}
                    </p>
                    {period === "YEARLY" && p.savePercent > 0 && (
                      <p
                        className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          p.featured
                            ? "bg-white/20 text-white"
                            : "bg-brand-50 text-brand-800"
                        }`}
                      >
                        {labels.save.replace("{pct}", String(p.savePercent))}
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    className={`text-sm ${
                      p.featured ? "text-brand-100" : "text-ink-500"
                    }`}
                  >
                    {labels.priceUnavailable}
                  </p>
                )}
              </div>

              <Link
                href={signUpHref}
                className={`mt-5 inline-flex h-11 items-center justify-center rounded-control text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  p.featured
                    ? "bg-white text-brand-800 hover:bg-brand-50 focus-visible:outline-white"
                    : "border border-line-strong bg-surface text-ink-800 hover:bg-ink-50 focus-visible:outline-brand-600"
                }`}
              >
                {labels.cta}
              </Link>

              <div
                className={`mt-6 border-t pt-5 ${
                  p.featured ? "border-white/20" : "border-line"
                }`}
              >
                {p.includesLabel && (
                  <p
                    className={`mb-3 text-[13px] font-medium ${
                      p.featured ? "text-brand-100" : "text-ink-700"
                    }`}
                  >
                    {p.includesLabel}
                  </p>
                )}
                <ul className="space-y-2.5 text-sm">
                  {p.lines.map((l) => (
                    <li key={l.text} className="flex items-start gap-2">
                      <svg
                        aria-hidden="true"
                        viewBox="0 0 20 20"
                        className={`mt-0.5 size-4 shrink-0 ${
                          p.featured
                            ? l.soon
                              ? "text-white/40"
                              : "text-white"
                            : l.soon
                            ? "text-ink-300"
                            : "text-brand-600"
                        }`}
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span
                        className={`${
                          p.featured
                            ? l.soon
                              ? "text-white/60"
                              : "text-white"
                            : l.soon
                            ? "text-ink-500"
                            : "text-ink-700"
                        }`}
                      >
                        {l.text}
                        {l.soon && (
                          <span
                            className={`ml-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
                              p.featured
                                ? "bg-white/20 text-white"
                                : "bg-warning-50 text-warning-700"
                            }`}
                          >
                            {labels.soon}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
