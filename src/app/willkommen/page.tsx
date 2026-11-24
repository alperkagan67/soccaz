import type { Metadata } from "next";
import { APPLE_NAME_PLATZHALTER } from "@/lib/apple-login";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-path";
import { completeOnboardingAction } from "@/server/actions";
import { requireLoggedIn } from "@/server/session";
import { PlayerOnboarding } from "./PlayerOnboarding";

export const metadata: Metadata = { title: "Willkommen" };

export default async function WelcomePage({ searchParams }: PageProps<"/willkommen">) {
  const user = await requireLoggedIn();
  const params = await searchParams;
  const next = safeInternalPath(params.next);
  if (user.onboardedAt) redirect(next);

  return (
    <section className="mx-auto mt-6 max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Willkommen bei Socaz</h1>
      <p className="text-muted">Noch ein paar Angaben, dann kannst du loslegen.</p>
      <PlayerOnboarding defaultName={user.name === APPLE_NAME_PLATZHALTER ? "" : user.name} next={next} userId={user.id} abschlussAction={completeOnboardingAction} />
    </section>
  );
}
