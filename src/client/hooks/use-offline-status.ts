"use client";

/**
 * useOfflineStatus — connectivity detection hook.
 *
 * Primary signal: window online/offline events (fast).
 * Secondary signal: periodic HEAD probe to /api/health every 30 s
 * when navigator.onLine is false — catches situations where the
 * interface is up but there is no real internet.
 *
 * Returns { isOffline, lastChecked }.
 */
import { useState, useEffect, useRef } from "react";

export interface OfflineStatus {
  isOffline: boolean;
  lastChecked: Date;
}

const PROBE_URL = "/api/health";
const PROBE_INTERVAL_MS = 30_000;

async function probe(): Promise<boolean> {
  try {
    const res = await fetch(PROBE_URL, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

export function useOfflineStatus(): OfflineStatus {
  const [isOffline, setIsOffline] = useState<boolean>(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearProbeInterval() {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function startProbeInterval() {
    clearProbeInterval();
    intervalRef.current = setInterval(async () => {
      const online = await probe();
      setIsOffline(!online);
      setLastChecked(new Date());
    }, PROBE_INTERVAL_MS);
  }

  useEffect(() => {
    function handleOnline() {
      setIsOffline(false);
      setLastChecked(new Date());
      clearProbeInterval();
    }

    function handleOffline() {
      setIsOffline(true);
      setLastChecked(new Date());
      // Start probing to detect when connectivity is actually restored.
      startProbeInterval();
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // If we start offline, begin probing immediately.
    if (!navigator.onLine) {
      startProbeInterval();
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      clearProbeInterval();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isOffline, lastChecked };
}
