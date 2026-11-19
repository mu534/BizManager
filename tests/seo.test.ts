import { describe, expect, it } from "vitest";
import robots from "../app/robots";
import sitemap from "../app/sitemap";
import { PRIVATE_PATHS, PUBLIC_PATHS } from "@shared/site-url";

describe("robots", () => {
  it("blocks every private area and points at the sitemap", () => {
    const r = robots();
    const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    expect(rule?.disallow).toEqual([...PRIVATE_PATHS]);
    expect(r.sitemap).toMatch(/\/sitemap\.xml$/);
  });
});

describe("sitemap", () => {
  it("lists only public pages", () => {
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    expect(urls).toEqual(PUBLIC_PATHS.map((p) => p));
    for (const p of PRIVATE_PATHS) expect(urls.some((u) => u.startsWith(p))).toBe(false);
  });
  it("links the English and Afaan Oromo homepages to each other", () => {
    const home = sitemap()[0];
    expect(home?.alternates?.languages).toMatchObject({ en: expect.stringContaining("/"), om: expect.stringContaining("/om") });
  });
});