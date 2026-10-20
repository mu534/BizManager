import { describe, it, expect } from "vitest";
import { getDictionary, format, isLocale, homePathFor, LOCALES, type Dictionary } from "@shared/i18n";

const en = getDictionary("en");
const om = getDictionary("om");

/** Collect every string leaf with its path, and every array with its length. */
function walk(value: unknown, path: string, out: { strings: [string, string][]; lengths: [string, number][] }) {
  if (typeof value === "string") out.strings.push([path, value]);
  else if (Array.isArray(value)) {
    out.lengths.push([path, value.length]);
    value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, out);
  }
}
function collect(d: Dictionary) {
  const out = { strings: [] as [string, string][], lengths: [] as [string, number][] };
  walk(d, "", out);
  return out;
}

describe("i18n dictionaries", () => {
  const e = collect(en);
  const o = collect(om);

  it("have identical key paths", () => {
    expect(o.strings.map(([p]) => p)).toEqual(e.strings.map(([p]) => p));
  });

  it("have identical list lengths (features, steps, FAQ, ...)", () => {
    expect(o.lengths).toEqual(e.lengths);
  });

  it("contain no empty strings", () => {
    for (const [p, v] of [...e.strings, ...o.strings]) expect(v.trim().length, p).toBeGreaterThan(0);
  });

  it("keep placeholders and product identifiers intact", () => {
    const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const [i, [p, v]] of e.strings.entries()) {
      expect(placeholders(o.strings[i]?.[1] ?? ""), p).toEqual(placeholders(v));
    }
    expect(om.pricing.features.weightedCost.length).toBeGreaterThan(0);
    expect(om.pricing.plans).toHaveProperty("BASIC");
    expect(om.pricing.plans).toHaveProperty("PRO");
    expect(om.pricing.plans).toHaveProperty("BUSINESS");
    expect(om.cta.title).not.toBe(en.cta.title); // actually translated
  });

  it("do not leave the nav untranslated", () => {
    for (const k of ["features", "how", "pricing", "faq", "signIn", "getStarted"] as const) {
      expect(om.nav[k]).not.toBe(en.nav[k]);
    }
  });
});

describe("locale helpers", () => {
  it("validates locales and builds public paths", () => {
    expect(LOCALES).toEqual(["en", "om"]);
    expect(isLocale("om")).toBe(true);
    expect(isLocale("am")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(homePathFor("en")).toBe("/");
    expect(homePathFor("om")).toBe("/om");
  });

  it("formats placeholders", () => {
    expect(format(en.pricing.save, { pct: 20 })).toBe("Save 20% yearly");
    expect(format(om.pricing.includesPrev, { plan: "Basic" })).toContain("Basic");
    expect(format("hi {x}", {})).toBe("hi {x}");
  });
});
