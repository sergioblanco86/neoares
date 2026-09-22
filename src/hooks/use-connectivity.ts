import { useCallback, useEffect, useRef, useState } from "react";

export type ConnectivityState = "ONLINE" | "OFFLINE";

const RECHECK_INTERVAL_MS = 60_000;

export function useConnectivity() {
  const [state, setState] = useState<ConnectivityState>("ONLINE");
  const [checking, setChecking] = useState(false);
  const activeRef = useRef(true);
  const offlineRef = useRef(false);
  const requestRef = useRef<Promise<boolean> | null>(null);
  const failedChecksRef = useRef(0);

  const check = useCallback(async (): Promise<boolean> => {
    if (requestRef.current) return requestRef.current;
    const request = (async () => {
      if (activeRef.current && offlineRef.current) setChecking(true);
      const browserReportsOffline = navigator.onLine === false;
      const online = !browserReportsOffline && (
        window.desktop ? await window.desktop.connectivity.check() : true
      );
      if (activeRef.current) {
        if (online) {
          failedChecksRef.current = 0;
          offlineRef.current = false;
          setState("ONLINE");
        } else {
          failedChecksRef.current += 1;
          if (browserReportsOffline || failedChecksRef.current >= 2) {
            offlineRef.current = true;
            setState("OFFLINE");
          }
        }
        setChecking(false);
      }
      return online;
    })().catch(() => {
      if (activeRef.current) {
        failedChecksRef.current += 1;
        if (failedChecksRef.current >= 2) {
          offlineRef.current = true;
          setState("OFFLINE");
        }
        setChecking(false);
      }
      return false;
    }).finally(() => {
      requestRef.current = null;
    });
    requestRef.current = request;
    return request;
  }, []);

  useEffect(() => {
    activeRef.current = true;
    const handleOffline = () => {
      failedChecksRef.current = 2;
      offlineRef.current = true;
      setState("OFFLINE");
      setChecking(false);
    };
    const handleOnline = () => void check();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void check();
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void check();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, RECHECK_INTERVAL_MS);
    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [check]);

  return { checking, retry: check, state };
}
