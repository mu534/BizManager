/**
 * Payment-evidence upload validation — pure.
 *
 * The declared MIME type and file name are never trusted: the file type is
 * decided from the leading "magic" bytes, and the stored extension/content
 * type are derived from that decision.
 */

/** Kept under typical serverless request-body limits (~4.5 MB). */
export const MAX_EVIDENCE_BYTES = 4 * 1024 * 1024;

export type EvidenceKind = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

const EXTENSION: Record<EvidenceKind, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function evidenceExtension(kind: EvidenceKind): string {
  return EXTENSION[kind];
}

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

export function sniffEvidenceKind(bytes: Uint8Array): EvidenceKind | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  return null;
}

export type EvidenceCheck =
  | { ok: true; kind: EvidenceKind; extension: string }
  | { ok: false; reason: "EMPTY" | "TOO_LARGE" | "UNSUPPORTED_TYPE" };

export function checkEvidenceFile(bytes: Uint8Array): EvidenceCheck {
  if (bytes.length === 0) return { ok: false, reason: "EMPTY" };
  if (bytes.length > MAX_EVIDENCE_BYTES) return { ok: false, reason: "TOO_LARGE" };
  const kind = sniffEvidenceKind(bytes);
  if (!kind) return { ok: false, reason: "UNSUPPORTED_TYPE" };
  return { ok: true, kind, extension: EXTENSION[kind] };
}

/** Canonical form of a transfer reference used for duplicate detection. */
export function normalizeReference(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}
