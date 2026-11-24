import type { ReactNode } from "react";
import { BereichGate } from "@/components/BereichGate";

// TURNIER_ONLY: dieser Bereich ist gesperrt ("Kommt bald"), Plattform-Admin ausgenommen (src/lib/turnier-only.ts).
export default function Layout({ children }: { children: ReactNode }) {
  return <BereichGate>{children}</BereichGate>;
}
