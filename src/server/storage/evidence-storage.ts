
import "server-only";
import { getStorage } from "firebase-admin/storage";
import { adminApp } from "@server/auth/firebase-admin";
import { appError } from "@shared/errors";
import type { EvidenceKind } from "@shared/payment-evidence";

function bucket() {
  const name = process.env.FIREBASE_STORAGE_BUCKET ?? process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
  if (!name) {
    throw appError.serverError(
      "Receipt storage is not configured. Set FIREBASE_STORAGE_BUCKET on the server.",
    );
  }
  return getStorage(adminApp).bucket(name);
}

/** Object keys are generated server-side only; never derived from user input. */
export function evidenceKeyFor(businessId: string, paymentId: string, extension: string): string {
  return `payment-evidence/${businessId}/${paymentId}.${extension}`;
}

export async function saveEvidence(
  key: string,
  data: Uint8Array,
  contentType: EvidenceKind,
): Promise<void> {
  await bucket()
    .file(key)
    .save(Buffer.from(data), {
      resumable: false,
      contentType,
      metadata: { cacheControl: "private, no-store" },
    });
}

export async function readEvidence(key: string): Promise<Buffer> {
  const [buf] = await bucket().file(key).download();
  return buf;
}

/** Best-effort cleanup (e.g. when the database insert fails after upload). */
export async function deleteEvidenceQuietly(key: string): Promise<void> {
  try {
    await bucket().file(key).delete({ ignoreNotFound: true });
  } catch (err) {
    console.error("[evidence-storage] cleanup failed", key, err);
  }
}
