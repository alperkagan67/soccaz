"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Env = "server" | "hidden" | "ios" | "other";

const KEY = "socaz.installHint.dismissed";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function detect(): Env {
  if (readDismissed()) return "hidden";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  if (standalone) return "hidden";
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua) ? "ios" : "other";
}

const subscribe = () => () => {};

/** Zeigt auf dem Handy einen Hinweis zum Installieren: Android per Knopf, iPhone mit Anleitung (Push geht dort nur installiert). */
export function InstallHint() {
  const env = useSyncExternalStore(subscribe, detect, (): Env => "server");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const visible = !closed && (env === "ios" || (env === "other" && deferred !== null));
  if (!visible) return null;

  const dismiss = () => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ohne Speicher bleibt der Hinweis nur für diese Sitzung geschlossen */
    }
    setClosed(true);
  };

  return (
    <aside className="card flex items-start gap-3 border-green" aria-label="App installieren">
      <div className="flex-1 space-y-1 text-sm">
        <p className="font-semibold">Socaz als App nutzen</p>
        {env === "ios" ? (
          <p className="text-muted">Tippe in Safari auf „Teilen“ und dann auf „Zum Home-Bildschirm“. Nur so bekommst du auf dem iPhone Push-Nachrichten.</p>
        ) : (
          <>
            <p className="text-muted">Installiere Socaz auf deinem Startbildschirm für schnellen Zugriff und Push-Nachrichten.</p>
            <button
              className="btn btn-primary !min-h-9"
              onClick={async () => {
                await deferred?.prompt();
                await deferred?.userChoice;
                dismiss();
              }}
            >
              Installieren
            </button>
          </>
        )}
      </div>
      <button className="px-2 text-muted hover:text-ink" onClick={dismiss} aria-label="Hinweis schließen">×</button>
    </aside>
  );
}
