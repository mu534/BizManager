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
  "inline-flex h-12 items-center justify-center rounded-control bg-brand-gradient px-6 text-base font-medium text-white shadow-card transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";
const secondaryBtn =
  "inline-flex h-12 items-center justify-center rounded-control border border-line-strong bg-surface px-6 text-base font-medium text-ink-800 transition hover:bg-ink-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600";

function Section({ id, title, subtitle, children, tint }: { id?: string; title: string; subtitle?: string; children: ReactNode; tint?: boolean }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={`scroll-mt-20 py-16 sm:py-20 ${tint ? "bg-ink-50/70" : ""}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <h2 id={id ? `${id}-title` : undefined} className="text-2xl font-semibold tracking-tight text-ink-900 sm:text-3xl">{title}</h2>
          {subtitle && <p className="mt-3 text-base text-ink-600">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-[17px] font-semibold tracking-tight text-ink-900">
      <span aria-hidden="true" className="grid size-7 place-items-center rounded-control bg-brand-gradient text-sm font-bold text-white">B</span>
      BizManager
    </span>
  );
}

function Check({ tone }: { tone: "brand" | "muted" | "warn" }) {
  const c = tone === "brand" ? "text-brand-600" : tone === "warn" ? "text-warning-600" : "text-ink-400";
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" width="16" height="16" className={`mt-0.5 size-4 shrink-0 ${c}`} fill="currentColor">
      <path fillRule="evenodd" d="M16.7 5.3a1 1 0 0 1 0 1.4l-7.5 7.5a1 1 0 0 1-1.4 0L3.3 9.7a1 1 0 1 1 1.4-1.4l3.8 3.8 6.8-6.8a1 1 0 0 1 1.4 0Z" clipRule="evenodd" />
    </svg>
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
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-3 focus:py-2 focus:shadow-pop">
        {t.nav.skip}
      </a>

      {/* Navigation */}
      <header className="sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href={homePathFor(locale)} aria-label="BizManager"><Logo /></Link>
          <nav aria-label="Primary" className="ml-6 hidden items-center gap-1 text-sm lg:flex">
            {links.map((l) => (
              <a key={l.href} href={l.href} className="rounded-control px-3 py-2 text-ink-700 hover:bg-ink-100 hover:text-ink-900">{l.label}</a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LanguageSwitcher current={locale} label={t.nav.language} />
            <Link href={signIn} className="hidden rounded-control px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 sm:inline-block">{t.nav.signIn}</Link>
            <Link href={signUp} className="hidden h-10 items-center rounded-control bg-brand-gradient px-4 text-sm font-medium text-white shadow-card hover:brightness-110 sm:inline-flex">{t.nav.getStarted}</Link>
            <details className="relative lg:hidden">
              <summary className="grid size-10 cursor-pointer list-none place-items-center rounded-control border border-line-strong text-ink-800 [&::-webkit-details-marker]:hidden" aria-label={t.nav.menu}>
                <svg aria-hidden="true" viewBox="0 0 20 20" className="size-5" fill="currentColor"><path d="M3 5h14v2H3V5Zm0 4h14v2H3V9Zm0 4h14v2H3v-2Z" /></svg>
              </summary>
              <div className="absolute right-0 mt-2 w-56 rounded-card border border-line bg-surface p-2 shadow-pop">
                {links.map((l) => (
                  <a key={l.href} href={l.href} className="block rounded-control px-3 py-2 text-sm text-ink-800 hover:bg-ink-100">{l.label}</a>
                ))}
                <hr className="my-1 border-line" />
                <Link href={signIn} className="block rounded-control px-3 py-2 text-sm text-ink-800 hover:bg-ink-100">{t.nav.signIn}</Link>
                <Link href={signUp} className="block rounded-control px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50">{t.nav.getStarted}</Link>
              </div>
            </details>
          </div>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="border-b border-line bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="inline-block rounded bg-brand-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-brand-800">{t.hero.eyebrow}</p>
              <h1 className="mt-4 text-4xl font-semibold leading-[1.1] tracking-tight text-ink-950 sm:text-5xl">{t.hero.title}</h1>
              <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-600">{t.hero.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={signUp} className={primaryBtn}>{t.hero.primaryCta}</Link>
                <a href="#pricing" className={secondaryBtn}>{t.hero.secondaryCta}</a>
              </div>
              <p className="mt-5 flex max-w-xl items-start gap-2 text-sm text-ink-500"><Check tone="brand" /><span>{t.hero.note}</span></p>
            </div>
            <div className="mx-auto w-full max-w-md"><ProductPreview t={t.preview} compact /></div>
          </div>
        </section>

        {/* Capability strip */}
        <section aria-label="Capabilities" className="border-b border-line bg-surface py-5">
          <div className="bm-marquee">
            <div className="bm-marquee-track">
              <ul className="bm-marquee-group">
                {t.marquee.map((m) => (
                  <li key={m} className="whitespace-nowrap rounded-full border border-line bg-ink-50 px-4 py-1.5 text-sm font-medium text-ink-700">{m}</li>
                ))}
              </ul>
              <ul className="bm-marquee-group bm-marquee-dup" aria-hidden="true">
                {t.marquee.map((m) => (
                  <li key={m} className="whitespace-nowrap rounded-full border border-line bg-ink-50 px-4 py-1.5 text-sm font-medium text-ink-700">{m}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <Section title={t.preview.title} subtitle={t.preview.subtitle}>
          <div className="mx-auto max-w-4xl"><ProductPreview t={t.preview} /></div>
        </Section>

        <Section id="features" title={t.features.title} subtitle={t.features.subtitle} tint>
          <ul className="grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
            {t.features.items.map((f, i) => (
              <li key={f.title} className="border-t border-line-strong pt-4">
                <span className="text-xs font-semibold tabular-nums text-brand-700">{String(i + 1).padStart(2, "0")}</span>
                <h3 className="mt-1 text-base font-semibold text-ink-900">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{f.body}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section id="how" title={t.how.title} subtitle={t.how.subtitle}>
          <ol className="mx-auto grid max-w-5xl gap-6 md:grid-cols-5">
            {t.how.steps.map((s, i) => (
              <li key={s.title} className="relative">
                <span className="grid size-8 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">{i + 1}</span>
                <h3 className="mt-3 text-[15px] font-semibold text-ink-900">{s.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{s.body}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title={t.offline.title} subtitle={t.offline.subtitle} tint>
          <div className="grid gap-5 md:grid-cols-3">
            {[
              { title: t.offline.canTitle, items: t.offline.can, tone: "brand" as const },
              { title: t.offline.syncTitle, items: t.offline.sync, tone: "warn" as const },
              { title: t.offline.needsTitle, items: t.offline.needs, tone: "muted" as const },
            ].map((col) => (
              <div key={col.title} className="rounded-card border border-line bg-surface p-5 shadow-card">
                <h3 className="text-[15px] font-semibold text-ink-900">{col.title}</h3>
                <ul className="mt-3 space-y-2.5 text-sm text-ink-700">
                  {col.items.map((it) => (
                    <li key={it} className="flex items-start gap-2"><Check tone={col.tone} />{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>

        <Section id="pricing" title={t.pricing.title} subtitle={t.pricing.subtitle}>
          <Suspense fallback={<PricingSkeleton />}>
            <PricingSection locale={locale} />
          </Suspense>
        </Section>

        <Section title={t.trust.title} subtitle={t.trust.subtitle} tint>
          <ul className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {t.trust.items.map((it) => (
              <li key={it.title} className="flex gap-3">
                <Check tone="brand" />
                <div>
                  <h3 className="text-[15px] font-semibold text-ink-900">{it.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{it.body}</p>
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
                <li key={q.name} className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <blockquote className="text-sm leading-relaxed text-ink-700">“{q.quote}”</blockquote>
                  <p className="mt-3 text-sm font-medium text-ink-900">{q.name}</p>
                  <p className="text-xs text-ink-500">{q.role}, {q.business}</p>
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Section title={t.benefits.title}>
            <ul className="grid gap-6 md:grid-cols-3">
              {t.benefits.items.map((b) => (
                <li key={b.title} className="rounded-card border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-base font-semibold text-ink-900">{b.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{b.body}</p>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section id="faq" title={t.faq.title} tint>
          <div className="mx-auto max-w-3xl divide-y divide-line rounded-card border border-line bg-surface shadow-card">
            {t.faq.items.map((f) => (
              <details key={f.q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                  {f.q}
                  <svg aria-hidden="true" viewBox="0 0 20 20" className="size-4 shrink-0 text-ink-500 transition group-open:rotate-180" fill="currentColor"><path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" /></svg>
                </summary>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* Final CTA */}
        <section className="bg-brand-900 py-16 text-center">
          <div className="mx-auto max-w-2xl px-4">
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">{t.cta.title}</h2>
            <p className="mt-3 text-brand-100">{t.cta.subtitle}</p>
            <Link href={signUp} className="mt-7 inline-flex h-12 items-center rounded-control bg-white px-6 text-base font-medium text-brand-800 transition hover:bg-brand-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
              {t.cta.button}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          <div className="md:col-span-2">
            <Logo />
            <p className="mt-3 max-w-sm text-sm text-ink-600">{t.footer.tagline}</p>
            <div className="mt-4"><LanguageSwitcher current={locale} label={t.nav.language} /></div>
          </div>
          <nav aria-label={t.footer.product}>
            <p className="text-sm font-semibold text-ink-900">{t.footer.product}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              {links.map((l) => (<li key={l.href}><a href={l.href} className="hover:text-ink-900 hover:underline">{l.label}</a></li>))}
            </ul>
          </nav>
          <div>
            <p className="text-sm font-semibold text-ink-900">{t.footer.legal}</p>
            <ul className="mt-3 space-y-2 text-sm text-ink-600">
              <li><Link href="/privacy" className="hover:text-ink-900 hover:underline">{t.footer.privacy}</Link> <span className="text-xs text-ink-400">({t.footer.legalNote})</span></li>
              <li><Link href="/terms" className="hover:text-ink-900 hover:underline">{t.footer.terms}</Link> <span className="text-xs text-ink-400">({t.footer.legalNote})</span></li>
            </ul>
            {(SUPPORT_EMAIL || SUPPORT_PHONE) && (
              <>
                <p className="mt-5 text-sm font-semibold text-ink-900">{t.footer.support}</p>
                <ul className="mt-3 space-y-2 text-sm text-ink-600">
                  {SUPPORT_EMAIL && <li><a href={`mailto:${SUPPORT_EMAIL}`} className="hover:underline">{SUPPORT_EMAIL}</a></li>}
                  {SUPPORT_PHONE && <li><a href={`tel:${SUPPORT_PHONE.replace(/\s+/g, "")}`} className="hover:underline">{SUPPORT_PHONE}</a></li>}
                </ul>
              </>
            )}
          </div>
        </div>
        <div className="border-t border-line py-4 text-center text-xs text-ink-500">© BizManager. {t.footer.rights}</div>
      </footer>
    </div>
  );
}
