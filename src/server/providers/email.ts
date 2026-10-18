export type EmailMessage = { to: string; subject: string; text: string; html?: string };
export type SendResult = { status: "sent" | "skipped" | "failed"; detail?: string };

/** Versendet E-Mail über Resend. Ohne RESEND_API_KEY wird nur protokolliert (lokale Entwicklung). */
export async function sendEmail(message: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return { status: "skipped", detail: "Kein E-Mail-Anbieter konfiguriert (RESEND_API_KEY fehlt)." };

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM ?? "Socaz <noreply@socaz.de>",
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { status: "failed", detail: `Resend antwortete mit ${response.status}` };
    return { status: "sent" };
  } catch (error) {
    return { status: "failed", detail: error instanceof Error ? error.message : "Unbekannter Fehler" };
  }
}
