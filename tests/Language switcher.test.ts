import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LanguageSwitcher } from "../src/components/marketing/language-switcher";

function render(current: "en" | "om" | "am", placement?: "top" | "bottom") {
  return renderToStaticMarkup(createElement(LanguageSwitcher, { current, label: "Language", tone: "dark", placement }));
}

describe("LanguageSwitcher dropdown", () => {
  it("shows the current language on the button and lists every language as a real link", () => {
    const html = render("om");
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    for (const href of ['href="/"', 'href="/om"', 'href="/am"']) expect(html).toContain(href);
    for (const lang of ['hrefLang="en"', 'hrefLang="om"', 'hrefLang="am"']) expect(html.replace(/hreflang/gi, "hrefLang")).toContain(lang);
    expect(html).toContain("አማርኛ");
    expect(html).toContain("Afaan Oromoo");
  });
  it("marks only the current language as active", () => {
    const html = render("am");
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/am"[^>]*aria-current="true"|aria-current="true"[^>]*href="\/am"/);
  });
  it("opens upward in the footer and downward in the header", () => {
    expect(render("en", "top")).toContain("bottom-full");
    expect(render("en", "bottom")).toContain("top-full");
  });
});