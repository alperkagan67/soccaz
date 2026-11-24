import { Suspense, type ReactNode } from "react";
import { bereichGesperrt } from "@/server/turnier-only";
import { KommtBald } from "./KommtBald";

async function Gate({ children }: { children: ReactNode }) {
  if (await bereichGesperrt()) return <KommtBald />;
  return <>{children}</>;
}

/** Hüllt einen Bereich: bei TURNIER_ONLY (und ohne Plattform-Admin) wird statt der Seite "Kommt bald" gezeigt; die Seite selbst wird dann nicht gerendert. */
export function BereichGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
