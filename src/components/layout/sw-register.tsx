"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on first client render.
 * Must be a client component — navigator.serviceWorker is browser-only.
 * Placed in the root layout so registration happens on every page.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        // Check for updates every time the page loads.
        registration.update().catch(() => null);
      })
      .catch(() => {
        // Non-fatal — app works without the service worker.
      });
  }, []);

  return null;
}
