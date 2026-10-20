import { describe, it, expect } from "vitest";
import { safeNextPath } from "@shared/safe-redirect";
import { authErrorMessage } from "@shared/auth-errors";
import { getDictionary } from "@shared/i18n";

describe("safeNextPath (open-redirect guard)", () => {
  it("accepts in-app paths", () => {
    expect(safeNextPath("/app")).toBe("/app");
    expect(safeNextPath("/app/abc/dashboard?x=1#y")).toBe("/app/abc/dashboard?x=1#y");
    expect(safeNextPath("/admin/payments")).toBe("/admin/payments");
    expect(safeNextPath("/create-business")).toBe("/create-business");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    for (const bad of [
      "https://evil.example",
      "http://evil.example/app",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "javascript:alert(1)",
      "/https://evil.example",
    ]) {
      expect(safeNextPath(bad), bad).toBe("/app");
    }
  });

  it("rejects encoded tricks, control characters and paths outside the app", () => {
    expect(safeNextPath("/%2F%2Fevil.example")).toBe("/app");
    expect(safeNextPath("/app\r\nSet-Cookie: x=1")).toBe("/app");
    expect(safeNextPath("/application")).toBe("/app");
    expect(safeNextPath("/sign-in")).toBe("/app");
    expect(safeNextPath("/" + "a".repeat(600))).toBe("/app");
  });

  it("falls back on empty input and honours a custom fallback", () => {
    expect(safeNextPath(null)).toBe("/app");
    expect(safeNextPath("", "/x")).toBe("/x");
  });
});

describe("authErrorMessage", () => {
  const en = getDictionary("en").auth;
  const om = getDictionary("om").auth;
  const e = (code: string) => Object.assign(new Error(code), { code });

  it("does not reveal whether an email has an account", () => {
    expect(authErrorMessage(e("auth/user-not-found"), en)).toBe(authErrorMessage(e("auth/wrong-password"), en));
    expect(authErrorMessage(e("auth/invalid-credential"), en)).toBe(en.wrongCredentials);
  });

  it("is translated per language", () => {
    expect(authErrorMessage(e("auth/email-already-in-use"), om)).toBe(om.emailInUse);
    expect(om.emailInUse).not.toBe(en.emailInUse);
  });

  it("never leaks raw errors; unknown codes get the generic message", () => {
    expect(authErrorMessage(new Error("Firebase: secret internal detail"), en)).toBe(en.failed);
    expect(authErrorMessage("boom", en)).toBe(en.failed);
    expect(authErrorMessage(new TypeError("FIREBASE_CONFIG_MISSING"), en)).toBe(en.unavailable);
  });
});
