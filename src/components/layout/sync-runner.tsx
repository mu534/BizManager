"use client";

import { useEffect } from "react";
import { processQueue, startSyncProcessor } from "@client/db/sync-queue";

/**
 * Runs the offline sync processor for the whole authenticated app (it used to
 * run only while the POS page was open, so queued expenses and sales could sit
 * unsynced indefinitely).
 */
export function SyncRunner({ businessId }: { businessId: string }) {
  useEffect(() => {
    void processQueue(businessId);
    return startSyncProcessor(businessId);
  }, [businessId]);
  return null;
}
