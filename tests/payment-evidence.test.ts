import { describe, it, expect } from "vitest";
import {
  checkEvidenceFile,
  sniffEvidenceKind,
  normalizeReference,
  MAX_EVIDENCE_BYTES,
} from "@shared/payment-evidence";

const bytes = (...b: number[]) => Uint8Array.from(b);
const pad = (head: number[], total: number) => {
  const a = new Uint8Array(total);
  a.set(head);
  return a;
};

describe("payment evidence validation", () => {
  it("accepts JPEG, PNG, WebP and PDF by content", () => {
    expect(sniffEvidenceKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffEvidenceKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(
      sniffEvidenceKind(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50)),
    ).toBe("image/webp");
    expect(sniffEvidenceKind(bytes(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31))).toBe("application/pdf");
  });

  it("rejects HTML/SVG/script content regardless of how it is named", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    expect(checkEvidenceFile(html)).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    expect(checkEvidenceFile(svg)).toEqual({ ok: false, reason: "UNSUPPORTED_TYPE" });
  });

  it("rejects empty and oversized files", () => {
    expect(checkEvidenceFile(new Uint8Array(0))).toEqual({ ok: false, reason: "EMPTY" });
    const big = pad([0xff, 0xd8, 0xff], MAX_EVIDENCE_BYTES + 1);
    expect(checkEvidenceFile(big)).toEqual({ ok: false, reason: "TOO_LARGE" });
  });

  it("derives the extension from content, not the file name", () => {
    const r = checkEvidenceFile(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 64));
    expect(r).toEqual({ ok: true, kind: "image/png", extension: "png" });
  });

  it("normalizes references for duplicate detection", () => {
    expect(normalizeReference("  ft 24 abc-9 ")).toBe("FT24ABC-9");
    expect(normalizeReference("FT24ABC-9")).toBe(normalizeReference("ft24abc-9"));
  });
});
