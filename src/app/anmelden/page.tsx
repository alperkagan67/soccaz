import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/auth";
import { appleLoginEnabled } from "@/lib/apple-login";
import { safeInternalPath } from "@/lib/safe-path";
import { getT } from "@/server/locale";
import { getCurrentUser, isCurrentSessionBanned } from "@/server/session";

export const metadata: Metadata = { title: "Anmelden" };

export default async function SignInPage({ searchParams }: PageProps<"/anmelden">) {
  const params = await searchParams;
  const next = safeInternalPath(params.next);
  if (await getCurrentUser()) redirect(next);
  const banned = await isCurrentSessionBanned();
  const { t } = await getT();

  const hasGoogle = Boolean(process.env.AUTH_GOOGLE_ID);
  const hasApple = appleLoginEnabled(process.env);
  const fehler = typeof params.fehler === "string" ? params.fehler : "";
  const isDev = process.env.NODE_ENV !== "production";

  return (
    <section className="mx-auto mt-8 max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">{t("signin.title")}</h1>
      {banned && (
        <p className="card border-ink text-sm text-ink" role="alert">
          {t("signin.banned")}
        </p>
      )}
      {fehler === "apple_email" && (
        <p className="card border-ink text-sm text-ink" role="alert">
          {t("signin.appleEmail")}
        </p>
      )}
      {fehler === "apple_keine_email" && (
        <p className="card border-ink text-sm text-ink" role="alert">
          {t("signin.appleKeineEmail")}
        </p>
      )}
      <p className="text-muted">{t(hasApple ? "signin.leadApple" : "signin.lead")}</p>

      {hasGoogle ? (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: next });
          }}
        >
          <button className="btn btn-primary w-full">{t("signin.google")}</button>
        </form>
      ) : (
        <p className="card text-sm text-muted">
          {isDev
            ? "Google-Login ist noch nicht eingerichtet (AUTH_GOOGLE_ID fehlt). Lokal kannst du den Dev-Login nutzen."
            : t("signin.unavailable")}
        </p>
      )}

      {hasApple && (
        <form
          action={async () => {
            "use server";
            await signIn("apple", { redirectTo: next });
          }}
        >
          <button className="btn btn-ghost w-full">{t("signin.apple")}</button>
        </form>
      )}

      {isDev && (
        <form
          className="card space-y-3"
          action={async (formData: FormData) => {
            "use server";
            await signIn("dev", {
              email: String(formData.get("email") ?? ""),
              name: String(formData.get("name") ?? ""),
              redirectTo: next,
            });
          }}
        >
          <p className="text-sm font-semibold text-ink">Dev-Login (nur lokal)</p>
          <div>
            <label className="label" htmlFor="email">E-Mail</label>
            <input id="email" name="email" type="email" required defaultValue="dev@soccav2.local" className="field" />
          </div>
          <div>
            <label className="label" htmlFor="name">Name</label>
            <input id="name" name="name" defaultValue="Dev User" className="field" />
          </div>
          <button className="btn btn-ghost w-full">Als Dev-Nutzer anmelden</button>
        </form>
      )}
    </section>
  );
}
