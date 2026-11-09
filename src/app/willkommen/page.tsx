import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { safeInternalPath } from "@/lib/safe-path";
import { requireLoggedIn } from "@/server/session";
import { OnboardingForm } from "./OnboardingForm";

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
      <OnboardingForm defaultName={user.name} next={next} />
    </section>
  );
}
