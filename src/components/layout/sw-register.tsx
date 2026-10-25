"use client";

import { useEffect, useState } from "react";

/**
 * Registers the service worker on first client render.
 * Shows an update banner when a new SW version is waiting.
 * Must be a client component — navigator.serviceWorker is browser-only.
 */
export function SWRegister() {
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let registration: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;

        // If there is already a waiting worker, show the banner immediately.
        if (reg.waiting) {
          setWaitingWorker(reg.waiting);
        }

        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" && navigator.serviceWorker.controller) {
              setWaitingWorker(installing);
            }
          });
        });
      })
      .catch(() => {
        // Non-fatal — app works without the service worker.
      });

    // When the controller changes (new SW took over), reload the page.
    const handleControllerChange = () => {
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const handleUpdate = () => {
    if (!waitingWorker) return;
    waitingWorker.postMessage({ type: "SKIP_WAITING" });
    setWaitingWorker(null);
  };

  if (!waitingWorker) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-ink-900 px-4 py-3 text-sm text-white shadow-lg md:bottom-4"
    >
      <span>A new version is available.</span>{" "}
      <button
        type="button"
        onClick={handleUpdate}
        className="ml-2 font-semibold underline underline-offset-2"
      >
        Reload to update
      </button>
    </div>
  );
}

/**
 * @deprecated Use SWRegister instead.
 */
export const ServiceWorkerRegistration = SWRegister;
