import webpush from "web-push";
import type { SendResult } from "./email";

let configured: boolean | undefined;

export function isPushConfigured(): boolean {
  if (configured !== undefined) return configured;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return (configured = false);
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@socaz.de", publicKey, privateKey);
  return (configured = true);
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };

/** Sendet eine Web-Push-Nachricht. `gone` heißt: das Gerät hat das Abo gelöscht, es kann entfernt werden. */
export async function sendPush(
  target: PushTarget,
  payload: { title: string; body: string; url?: string; tag?: string },
): Promise<SendResult & { gone?: boolean }> {
  if (!isPushConfigured()) return { status: "skipped", detail: "Web-Push nicht konfiguriert (VAPID-Schlüssel fehlen)." };
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 12 },
    );
    return { status: "sent" };
  } catch (error) {
    const code = (error as { statusCode?: number }).statusCode;
    if (code === 404 || code === 410) return { status: "failed", detail: "Abo abgelaufen", gone: true };
    return { status: "failed", detail: error instanceof Error ? error.message : "Unbekannter Fehler" };
  }
}
