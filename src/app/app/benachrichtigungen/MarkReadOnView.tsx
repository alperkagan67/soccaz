"use client";

import { useEffect } from "react";
import { markNotificationsReadAction } from "@/server/actions";

/** Markiert die Benachrichtigungen als gelesen, sobald die Liste angezeigt wurde. */
export function MarkReadOnView() {
  useEffect(() => {
    const timer = setTimeout(() => void markNotificationsReadAction(), 1500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
