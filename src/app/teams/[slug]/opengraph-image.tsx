import { CARD_SIZE, teamCard } from "@/server/cards";

export const alt = "Team auf Socaz";
export const size = CARD_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  return teamCard((await params).slug);
}
