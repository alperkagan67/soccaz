"use client";

import { useEffect } from "react";

/** Registriert den Service Worker. In der Entwicklung nur auf Wunsch (NEXT_PUBLIC_ENABLE_SW=1), damit er HMR nicht stört. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_ENABLE_SW !== "1") return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => console.error("Service Worker:", error));
  }, []);
  return null;
}
