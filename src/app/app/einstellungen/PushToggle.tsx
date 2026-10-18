"use client";

import { useEffect, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/server/actions";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = "loading" | "unsupported" | "unconfigured" | "denied" | "off" | "on";

/** Schaltet Push-Nachrichten für dieses Gerät ein oder aus. */
export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const [state, setState] = useState<State>("loading");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: State;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) next = "unsupported";
      else if (!vapidPublicKey) next = "unconfigured";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = await reg?.pushManager.getSubscription();
        next = sub ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(undefined);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) });
      const json = sub.toJSON();
      const result = await savePushSubscriptionAction({ endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" }, navigator.userAgent.slice(0, 200));
      if (result.error) throw new Error(result.error);
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push konnte nicht aktiviert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(undefined);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Push konnte nicht deaktiviert werden.");
    } finally {
      setBusy(false);
    }
  }

  const text: Record<State, string> = {
    loading: "Prüfe dein Gerät…",
    unsupported: "Dieses Gerät oder dieser Browser unterstützt keine Push-Nachrichten. Auf dem iPhone musst du Socaz zuerst zum Home-Bildschirm hinzufügen.",
    unconfigured: "Push ist auf diesem Server noch nicht eingerichtet.",
    denied: "Du hast Benachrichtigungen im Browser blockiert. Erlaube sie in den Browser-Einstellungen für diese Seite.",
    off: "Auf diesem Gerät sind Push-Nachrichten aus.",
    on: "Auf diesem Gerät sind Push-Nachrichten an.",
  };

  return (
    <div className="card space-y-3">
      <h3 className="font-semibold">Dieses Gerät</h3>
      <p className="text-sm text-muted" role="status">{text[state]}</p>
      {state === "off" && <button className="btn btn-primary w-full disabled:opacity-60" disabled={busy} onClick={enable}>Push aktivieren</button>}
      {state === "on" && <button className="btn btn-ghost w-full disabled:opacity-60" disabled={busy} onClick={disable}>Push ausschalten</button>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
