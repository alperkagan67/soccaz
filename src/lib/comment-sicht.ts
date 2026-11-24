import { autorLabel, type LobbySicht } from "./lobby-namen";

// AC-17 (Entscheid t2q 2026-11-24): was die Kommentarliste je Betrachter von einem Autor ausliefert. Für Gäste und reine Hallenbetreiber verlassen Name und Autor-Kennung den Server NICHT (weder im HTML noch in der RSC-Nutzlast): die Zeile trägt nur Initialen, `href` ist dann null.
export type CommentRowIn = { id: string; body: string; rating: number | null; createdAt: Date; authorId: string; authorName: string; mine: boolean };
export type CommentRow = { id: string; body: string; rating: number | null; createdAt: Date; mine: boolean; label: string; href: string | null };

export function commentView(rows: readonly CommentRowIn[], sicht: LobbySicht): CommentRow[] {
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    rating: r.rating,
    createdAt: r.createdAt,
    mine: r.mine,
    label: autorLabel(r.authorName, sicht),
    href: sicht === "member" ? `/spieler/${r.authorId}` : null,
  }));
}
