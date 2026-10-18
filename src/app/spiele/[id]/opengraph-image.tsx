import { CARD_SIZE, matchCard } from "@/server/cards";

export const alt = "Spielbericht";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  return matchCard((await params).id);
}
