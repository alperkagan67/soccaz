import { redirect } from "next/navigation";

// 012 M6a: Diese Seite gibt es nicht mehr (Vertrag 013 AC-14). Alte Links (Benachrichtigungen, Lesezeichen) führen zu "Mein Bereich".
export default function RemovedPage() {
  redirect("/app");
}
