import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { getDictionary, homePathFor, type Locale } from "@shared/i18n";
import { TESTIMONIALS } from "@content/testimonials";
import { LanguageSwitcher } from "./language-switcher";
import { PricingSection, PricingSkeleton } from "./pricing-section";
import { ProductPreview } from "./product-preview";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
const SUPPORT_PHONE = process.env.NEXT_PUBLIC_SUPPORT_PHONE;

const primaryBtn =
  "inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 text-base font-semibold text-brand-800 shadow-pop transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const secondaryBtn =
  "inline-flex h-12 items-center justify-center rounded-xl border border-white/30 bg-white/10 px-6 text-base font-medium text-white backdrop-blur-sm transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

type Tone = "light" | "mint" | "dark";

function Section({
  id,
  title,
  subtitle,
  children,
  tone = "light",
  align = "center",
  className,
}: {
  id?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  tone?: Tone;
  align?: "center" | "left";
  className?: string;
}) {
  const bg = tone === "dark" ? "bg-night bg-grid-light" : tone === "mint" ? "bg-mint" : "bg-surface";
  const dark = tone === "dark";
  const left = align === "left";
  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className={`scroll-mt-20 py-16 sm:py-24 ${bg} ${className ?? ""}`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className={`mb-12 max-w-2xl ${left ? "" : "mx-auto text-center"}`}>
          <h2
            id={id ? `${id}-title` : undefined}
            className={`text-3xl font-semibold tracking-tight sm:text-4xl ${
              dark ? "text-white" : "text-ink-900"
            }`}
          >
            {title}
          </h2>
          {subtitle && (
            <p className={`mt-4 text-base leading-relaxed sm:text-lg ${dark ? "text-brand-100" : "text-ink-600"}`}>
              {subtitle}
            </p>
          )}
        </div>
        {children}
      </div>
    </section>
  );
}

function Logo({ white }: { white?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2.5 text-[18px] font-semibold tracking-tight ${
        white ? "text-white" : "text-ink-900"
      }`}
    >
      <span
        aria-hidden="true"
        className="grid size-8 place-items-center rounded-lg bg-brand-gradient text-sm font-bold text-white shadow-card ring-1 ring-white/30"
      >
        B
      </span>
      BizManager
    </span>
  );
}

function Check({ tone }: { tone: "brand" | "muted" | "warn" | "white" }) {
  const c =
    tone === "brand"
      ? "text-brand-600"
      : tone === "warn"
      ? "text-warning-600"
      : tone === "white"
      ? "text-white"
      : "text-ink-400";
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" className={`mt-0.5 size-4 shrink-0 ${c}`} fill="currentColor">
      <path
        fillRule="evenodd"
        d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/** Icons follow the fixed order of t.features.items (same in every locale). */
const FEATURE_ICONS: readonly string[] = [
  "M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5", // inventory: box
  "M3 4h2l2.4 11h10.2L20 7H6.2M9 20a1 1 0 1 0 0 .01M17 20a1 1 0 1 0 0 .01", // point of sale: cart
  "M7 3h10a1 1 0 0 1 1 1v17l-3-2-3 2-3-2-3 2V4a1 1 0 0 1 1-1Zm2 5h6m-6 4h6", // expenses: receipt
  "M3 7a2 2 0 0 1 2-2h13v4M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1Zm13 6h2", // accounts: wallet
  "M4 20V10m6 10V4m6 16v-7m5 7H3", // profit: bars
  "M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0ZM5 20a7 7 0 0 1 14 0M19 8a2.5 2.5 0 0 1 0 5", // staff: user
  "M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5v.01", // offline: wifi
];

function FeatureIcon({ index }: { index: number }) {
  const d = FEATURE_ICONS[index % FEATURE_ICONS.length];
  return (
    <span
      aria-hidden="true"
      className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100"
    >
      <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d={d} />
      </svg>
    </span>
  );
}

export function Landing({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const signUp = `/sign-up?lang=${locale}`;
  const signIn = `/sign-in?lang=${locale}`;
  const links = [
    { href: "#features", label: t.nav.features },
    { href: "#how", label: t.nav.how },
    { href: "#pricing", label: t.nav.pricing },
    { href: "#faq", label: t.nav.faq },
  ];

  return (
    <div lang={locale} className="bg-canvas text-ink-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop"
      >
        {t.nav.skip}
      </a>

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-brand-900/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href={homePathFor(locale)} aria-label="BizManager">
            <Logo white />
          </Link>
          <nav
            aria-label="Primary"
            className="ml-6 hidden items-center gap-1 text-sm lg:flex"
          >
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="rounded-lg px-3 py-2 text-brand-100 transition hover:bg-white/10 hover:text-white"
              >
                {l.label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher current={locale} label={t.nav.language} tone="dark" />
            <Link
              href={signIn}
              className="hidden rounded-full border border-white/25 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 sm:inline-block"
            >
              {t.nav.signIn}
            </Link>
            <Link
              href={signUp}
              className="hidden h-10 items-center rounded-full bg-white px-5 text-sm font-semibold text-brand-800 shadow-card transition hover:bg-brand-50 sm:inline-flex"
            >
              {t.nav.getStarted}
            </Link>
            <details className="relative lg:hidden">
              <summary
                className="grid size-10 cursor-pointer list-none place-items-center rounded-control border border-white/25 text-white [&::-webkit-details-marker]:hidden"
                aria-label={t.nav.menu}
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 20 20"
                  className="size-5"
                  fill="currentColor"
                >
                  <path d="M3 5h14v2H3V5Zm0 4h14v2H3V9Zm0 4h14v2H3v-2Z" />
                </svg>
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-xl border border-white/15 bg-brand-900 p-2 shadow-pop">
                {links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="block rounded-lg px-3 py-2 text-sm text-brand-100 hover:bg-white/10"
                  >
                    {l.label}
                  </a>
                ))}
                <hr className="my-1 border-white/15" />
                <Link
                  href={signIn}
                  className="block rounded-lg px-3 py-2 text-sm text-brand-100 hover:bg-white/10"
                >
                  {t.nav.signIn}
                </Link>
                <Link
                  href={signUp}
                  className="block rounded-lg px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
                >
                  {t.nav.getStarted}
                </Link>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative overflow-hidden bg-hero-gradient">
          <div aria-hidden="true" className="bg-grid-fine pointer-events-none absolute inset-0" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 sm:pb-28 sm:pt-20 lg:grid-cols-[1fr_1.05fr]">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-brand-100 backdrop-blur-sm">
                <span aria-hidden="true" className="size-2 rounded-full bg-brand-300" />
                {t.hero.eyebrow}
              </p>
              <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.4rem]">
                {t.hero.title}
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-50/90">
                {t.hero.subtitle}
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <Link href={signUp} className={primaryBtn}>
                  {t.hero.primaryCta}
                </Link>
                <a href="#pricing" className={secondaryBtn}>
                  {t.hero.secondaryCta}
                </a>
              </div>
              <p className="mt-6 flex max-w-xl items-start gap-2 text-sm leading-relaxed text-brand-100">
                <Check tone="white" />
                {t.hero.note}
              </p>
            </div>
            <div className="bm-rise bm-rise-delay mx-auto w-full max-w-xl lg:max-w-none">
              <ProductPreview t={t.preview} compact />
            </div>
          </div>
        </section>

        {/* Capability strip */}
        <section
          aria-label="Capabilities"
          className="border-b border-white/10 bg-ink-950 py-5"
        >
          <div className="bm-marquee">
            <div className="bm-marquee-track">
              <ul className="bm-marquee-group">
                {t.marquee.map((m) => (
                  <li
                    key={m}
                    className="whitespace-nowrap rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-100"
                  >
                    {m}
                  </li>
                ))}
              </ul>
              <ul
                className="bm-marquee-group bm-marquee-dup"
                aria-hidden="true"
              >
                {t.marquee.map((m) => (
                  <li
                    key={m}
                    className="whitespace-nowrap rounded-full border border-brand-400/30 bg-brand-500/10 px-4 py-1.5 text-sm font-medium text-brand-100"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Product preview — full */}
        <Section
          title={t.preview.title}
          subtitle={t.preview.subtitle}
          tone="mint"
        >
          <div className="mx-auto max-w-5xl">
            <ProductPreview t={t.preview} />
          </div>
        </Section>

        {/* Features */}
        <Section
          id="features"
          title={t.features.title}
          subtitle={t.features.subtitle}
          align="left"
        >
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((f, i) => (
              <li
                key={f.title}
                className="group rounded-2xl border border-brand-100 bg-white p-6 shadow-card transition hover:border-brand-300 hover:shadow-pop"
              >
                <FeatureIcon index={i} />
                <h3 className="mt-5 text-lg font-semibold text-ink-900">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        {/* How it works */}
        <Section
          id="how"
          title={t.how.title}
          subtitle={t.how.subtitle}
          tone="mint"
        >
          <ol className="mx-auto grid max-w-6xl gap-5 md:grid-cols-5">
            {t.how.steps.map((s, i) => (
              <li key={s.title} className="relative rounded-2xl border border-brand-100 bg-white p-5 shadow-card">
                <div className="flex items-center">
                  <span className="relative z-10 grid size-10 shrink-0 place-items-center rounded-full bg-brand-gradient text-sm font-semibold text-white shadow-card ring-4 ring-brand-50">
                    {i + 1}
                  </span>
                  {i < t.how.steps.length - 1 && (
                    <div
                      aria-hidden="true"
                      className="-mr-9 hidden h-px flex-1 bg-brand-200 md:block"
                    />
                  )}
                </div>
                <h3 className="mt-3 text-[15px] font-semibold text-ink-900">
                  {s.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </Section>

        {/* Offline */}
        <Section
          title={t.offline.title}
          subtitle={t.offline.subtitle}
          tone="dark"
          className="clip-slant-top"
        >
          <div className="grid gap-5 md:grid-cols-3">
            {[
              {
                title: t.offline.canTitle,
                items: t.offline.can,
                tone: "brand" as const,
              },
              {
                title: t.offline.syncTitle,
                items: t.offline.sync,
                tone: "warn" as const,
              },
              {
                title: t.offline.needsTitle,
                items: t.offline.needs,
                tone: "muted" as const,
              },
            ].map((col) => (
              <div
                key={col.title}
                className="rounded-2xl border border-white/15 bg-white/[0.06] p-6 shadow-card backdrop-blur-sm"
              >
                <h3 className="text-[15px] font-semibold text-white">
                  {col.title}
                </h3>
                <ul className="mt-3 space-y-2.5 text-sm text-brand-100">
                  {col.items.map((it) => (
                    <li key={it} className="flex items-start gap-2">
                      <Check tone={col.tone} />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        {/* Pricing */}
        <Section
          id="pricing"
          title={t.pricing.title}
          subtitle={t.pricing.subtitle}
        >
          <Suspense fallback={<PricingSkeleton />}>
            <PricingSection locale={locale} />
          </Suspense>
        </Section>

        {/* Trust */}
        <Section
          title={t.trust.title}
          subtitle={t.trust.subtitle}
          tone="mint"
        >
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {t.trust.items.map((it) => (
              <li key={it.title} className="flex gap-3 rounded-2xl border border-brand-100 bg-white p-5 shadow-card">
                <Check tone="brand" />
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-900">
                    {it.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">
                    {it.body}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        {/* Testimonials render only when real, permissioned content exists. */}
        {TESTIMONIALS.length > 0 ? (
          <Section title="Testimonials">
            <ul className="grid gap-5 md:grid-cols-3">
              {TESTIMONIALS.map((q) => (
                <li
                  key={q.name}
                  className="rounded-2xl border border-brand-100 bg-surface p-6 shadow-card"
                >
                  <blockquote className="text-sm leading-relaxed text-ink-700">
                    &ldquo;{q.quote}&rdquo;
                  </blockquote>
                  <p className="mt-3 text-sm font-medium text-ink-900">
                    {q.name}
                  </p>
                  <p className="text-xs text-ink-500">
                    {q.role}, {q.business}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Section title={t.benefits.title}>
            <ul className="grid gap-6 md:grid-cols-3">
              {t.benefits.items.map((b) => (
                <li
                  key={b.title}
                  className="rounded-2xl border border-brand-100 bg-gradient-to-b from-white to-brand-50/60 p-7 shadow-card transition hover:border-brand-300 hover:shadow-pop"
                >
                  <h3 className="text-base font-semibold text-ink-900">
                    {b.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">
                    {b.body}
                  </p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* FAQ */}
        <Section id="faq" title={t.faq.title} tone="mint">
          <div className="mx-auto max-w-3xl divide-y divide-brand-100 rounded-2xl border border-brand-100 bg-surface shadow-card">
            {t.faq.items.map((f) => (
              <details key={f.q} className="group px-6 py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 20 20"
                    className="size-4 shrink-0 text-brand-600 transition group-open:rotate-180"
                    fill="currentColor"
                  >
                    <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
                  </svg>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">
                  {f.a}
                </p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="bg-surface px-4 pb-16 pt-4 sm:px-6 sm:pb-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-night px-6 py-14 text-center shadow-[0_30px_70px_-30px_rgb(8_63_57/0.9)] sm:px-12 sm:py-20">
            <div aria-hidden="true" className="bg-grid-fine pointer-events-none absolute inset-0" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                {t.cta.title}
              </h2>
              <p className="mt-4 text-lg text-brand-100">{t.cta.subtitle}</p>
              <Link href={signUp} className={`${primaryBtn} mt-9`}>
                {t.cta.button}
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 bg-ink-950">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo white />
            <p className="mt-3 max-w-sm text-sm text-ink-400">
              {t.footer.tagline}
            </p>
            <div className="mt-4">
  
              <LanguageSwitcher current={locale} label={t.nav.language} tone="dark" placement="top" />
            </div>
          </div>
          <nav aria-label={t.footer.product}>
            <p className="text-sm font-semibold text-ink-200">
              {t.footer.product}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-ink-400">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className="transition hover:text-white hover:underline"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div>
            <p className="text-sm font-semibold text-ink-200">
              {t.footer.legal}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-ink-400">
              <li>
                <Link
                  href="/privacy"
                  className="transition hover:text-white hover:underline"
                >
                  {t.footer.privacy}
                </Link>{" "}
                <span className="text-xs text-ink-600">
                  ({t.footer.legalNote})
                </span>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="transition hover:text-white hover:underline"
                >
                  {t.footer.terms}
                </Link>{" "}
                <span className="text-xs text-ink-600">
                  ({t.footer.legalNote})
                </span>
              </li>
            </ul>
            {(SUPPORT_EMAIL || SUPPORT_PHONE) && (
              <>
                <p className="mt-5 text-sm font-semibold text-ink-200">
                  {t.footer.support}
                </p>
                <ul className="mt-3 space-y-2 text-sm text-ink-400">
                  {SUPPORT_EMAIL && (
                    <li>
                      <a
                        href={`mailto:${SUPPORT_EMAIL}`}
                        className="transition hover:text-white hover:underline"
                      >
                        {SUPPORT_EMAIL}
                      </a>
                    </li>
                  )}
                  {SUPPORT_PHONE && (
                    <li>
                      <a
                        href={`tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`}
                        className="transition hover:text-white hover:underline"
                      >
                        {SUPPORT_PHONE}
                      </a>
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        </div>
        <div className="border-t border-ink-800 py-4 text-center text-xs text-ink-500">
          © BizManager. {t.footer.rights}
        </div>
      </footer>
    </div>
  );
}
