import { exportMyData } from "@/server/account";
import { getCurrentUser } from "@/server/session";

/** Download aller eigenen Daten als JSON. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return new Response("Nicht angemeldet", { status: 401 });
  const data = await exportMyData(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="socaz-meine-daten.json"`,
      "Cache-Control": "no-store",
    },
  });
}
