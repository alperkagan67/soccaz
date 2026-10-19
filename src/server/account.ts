import { and, eq, gt, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { matchParticipants, matches, notifications, teamMembers, teams, users } from "@/db/schema";
import { ledgerEntries, payments, receipts } from "@/db/schema-finance";
import { comments, media } from "@/db/schema-content";
import { mvpVotes, playerStats, userBadges, userReliability } from "@/db/schema-community";
import { CITIES } from "@/lib/validation";
import { ACCENTS, FEET } from "@/lib/profile-options";
import { audit } from "./audit";
import { walletBalance } from "./ledger";
import { DomainError } from "./teams";

const POSITIONS = ["Torwart", "Abwehr", "Mittelfeld", "Angriff", "Flexibel"];

export function cleanBio(value: string | undefined | null): string | null {
  const text = (value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\r\n?/g, "\n").trim();
  if (text.length > 280) throw new DomainError("Der Steckbrief darf höchstens 280 Zeichen lang sein.");
  return text || null;
}

const cleanLine = (v: string | undefined, max: number, label: string) => {
  const t = (v ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
  if (t.length > max) throw new DomainError(`${label}: höchstens ${max} Zeichen.`);
  return t || null;
};

export type ProfileInput = { name: string; city: string; position: string; profilePublic: boolean; bio?: string; nickname?: string; accentColor?: string; shirtNumber?: string | number | null; favoriteClub?: string; strongFoot?: string };

export async function updateProfile(userId: string, input: ProfileInput) {
  const bio = cleanBio(input.bio);
  const nickname = cleanLine(input.nickname, 24, "Spitzname");
  const favoriteClub = cleanLine(input.favoriteClub, 40, "Lieblingsverein");
  const accentColor = input.accentColor && input.accentColor in ACCENTS ? input.accentColor : null;
  const strongFoot = input.strongFoot && (FEET as readonly string[]).includes(input.strongFoot) ? input.strongFoot : null;
  const rawNumber = input.shirtNumber === undefined || input.shirtNumber === null || input.shirtNumber === "" ? null : Number(input.shirtNumber);
  if (rawNumber !== null && (!Number.isInteger(rawNumber) || rawNumber < 1 || rawNumber > 99)) throw new DomainError("Die Rückennummer liegt zwischen 1 und 99.");
  const name = input.name.replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > 60) throw new DomainError("Der Name braucht 2 bis 60 Zeichen.");
  if (!(CITIES as readonly string[]).includes(input.city)) throw new DomainError("Bitte wähle eine Stadt.");
  if (!POSITIONS.includes(input.position)) throw new DomainError("Bitte wähle eine Position.");
  await db.update(users).set({ name, city: input.city, position: input.position, profilePublic: input.profilePublic, bio, nickname, accentColor, shirtNumber: rawNumber, favoriteClub, strongFoot }).where(eq(users.id, userId));
  await audit(userId, "profile.update", "user", userId, { after: { city: input.city, position: input.position, profilePublic: input.profilePublic } });
}

/** Alle Daten, die zu dieser Person gespeichert sind (Auskunft und Datenübertragbarkeit nach DSGVO). */
export async function exportMyData(userId: string) {
  const [user] = await db
    .select({ id: users.id, email: users.email, name: users.name, bio: users.bio, city: users.city, position: users.position, profilePublic: users.profilePublic, locale: users.locale, createdAt: users.createdAt, onboardedAt: users.onboardedAt, termsAcceptedAt: users.termsAcceptedAt })
    .from(users)
    .where(eq(users.id, userId));
  const [memberships, participations, myComments, stats, badges, reliability, ledger, myPayments, myReceipts, myNotifications, votes] = await Promise.all([
    db.select({ team: teams.name, role: teamMembers.role, joinedAt: teamMembers.joinedAt }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(eq(teamMembers.userId, userId)),
    db.select({ matchId: matchParticipants.matchId, readyAt: matchParticipants.readyAt, noShow: matchParticipants.noShow }).from(matchParticipants).where(eq(matchParticipants.userId, userId)),
    db.select({ targetType: comments.targetType, targetId: comments.targetId, body: comments.body, rating: comments.rating, status: comments.status, createdAt: comments.createdAt }).from(comments).where(eq(comments.authorId, userId)),
    db.select().from(playerStats).where(eq(playerStats.userId, userId)),
    db.select({ code: userBadges.code, awardedAt: userBadges.awardedAt }).from(userBadges).where(eq(userBadges.userId, userId)),
    db.select().from(userReliability).where(eq(userReliability.userId, userId)),
    db
      .select({ at: ledgerEntries.at, kind: ledgerEntries.kind, amountCents: ledgerEntries.amountCents, debit: ledgerEntries.debitAccount, credit: ledgerEntries.creditAccount, matchId: ledgerEntries.matchId, reason: ledgerEntries.reason })
      .from(ledgerEntries)
      .where(or(eq(ledgerEntries.debitUserId, userId), eq(ledgerEntries.creditUserId, userId))),
    db.select({ id: payments.id, amountCents: payments.amountCents, status: payments.status, createdAt: payments.createdAt }).from(payments).where(eq(payments.userId, userId)),
    db.select({ number: receipts.number, kind: receipts.kind, amountCents: receipts.amountCents, issuedAt: receipts.issuedAt }).from(receipts).where(eq(receipts.userId, userId)),
    db.select({ type: notifications.type, title: notifications.title, body: notifications.body, createdAt: notifications.createdAt }).from(notifications).where(eq(notifications.userId, userId)).limit(500),
    db.select({ matchId: mvpVotes.matchId, candidateId: mvpVotes.candidateId, at: mvpVotes.at }).from(mvpVotes).where(eq(mvpVotes.voterId, userId)),
  ]);
  return { exportedAt: new Date().toISOString(), user, memberships, participations, comments: myComments, stats: stats[0] ?? null, badges, reliability: reliability[0] ?? null, ledger, payments: myPayments, receipts: myReceipts, notifications: myNotifications, mvpVotes: votes };
}

/**
 * Löscht das Konto, indem alle persönlichen Angaben entfernt werden. Spiele, Ergebnisse und Buchungen bleiben ohne Personenbezug erhalten
 * (Belege und Buchungen müssen wir aufbewahren). Nicht möglich bei Guthaben, offenen Spielen oder wenn man das einzige Team-Admin eines Teams mit Mitspielern ist.
 */
export async function deleteAccount(userId: string) {
  await db.transaction(async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.id, userId)).for("update");
    if (!user || user.bannedAt) throw new DomainError("Dieses Konto gibt es nicht mehr.");
    if (user.role !== "player") throw new DomainError("Dein Konto hat eine Admin-Rolle. Bitte lass sie zuerst entfernen.");

    if ((await walletBalance(tx, userId)) > 0) throw new DomainError("Du hast noch Guthaben. Bitte melde dich beim Support, damit wir es dir auszahlen.");

    const open = await tx
      .select({ id: matches.id })
      .from(matchParticipants)
      .innerJoin(matches, eq(matches.id, matchParticipants.matchId))
      .where(and(eq(matchParticipants.userId, userId), inArray(matches.status, ["lobby", "confirmed"]), gt(matches.startsAt, new Date(Date.now() - 6 * 3_600_000))));
    if (open.length > 0) throw new DomainError("Du bist noch für ein offenes Spiel eingetragen. Bitte melde dich zuerst ab.");

    const mine = await tx.select({ teamId: teamMembers.teamId, role: teamMembers.role }).from(teamMembers).where(eq(teamMembers.userId, userId));
    for (const m of mine.filter((x) => x.role === "admin")) {
      const others = await tx.select({ userId: teamMembers.userId, role: teamMembers.role }).from(teamMembers).where(and(eq(teamMembers.teamId, m.teamId), sql`${teamMembers.userId} <> ${userId}`));
      if (others.length > 0 && !others.some((o) => o.role === "admin")) throw new DomainError("Du bist der einzige Admin eines Teams mit Mitgliedern. Bitte mache zuerst jemanden zum Admin.");
      if (others.length === 0) await tx.update(teams).set({ archivedAt: new Date() }).where(eq(teams.id, m.teamId));
    }

    await tx.delete(teamMembers).where(eq(teamMembers.userId, userId));
    await tx.delete(comments).where(eq(comments.authorId, userId));
    await tx.delete(media).where(and(eq(media.ownerId, userId), inArray(media.kind, ["avatar", "match_photo"])));
    await tx.delete(notifications).where(eq(notifications.userId, userId));
    await tx.execute(sql`delete from push_subscriptions where user_id = ${userId}`);
    await tx.execute(sql`delete from notification_prefs where user_id = ${userId}`);
    await tx.delete(mvpVotes).where(or(eq(mvpVotes.voterId, userId), eq(mvpVotes.candidateId, userId)));
    await tx.delete(userBadges).where(eq(userBadges.userId, userId));
    await tx.delete(playerStats).where(eq(playerStats.userId, userId));
    await tx.delete(userReliability).where(eq(userReliability.userId, userId));
    await tx.update(matchParticipants).set({ readyAt: null }).where(eq(matchParticipants.userId, userId));

    await tx
      .update(users)
      .set({
        name: "Gelöschter Nutzer",
        email: `geloescht-${userId}@geloescht.invalid`,
        googleId: null,
        avatarUrl: null,
        city: null,
        bio: null,
        nickname: null,
        accentColor: null,
        shirtNumber: null,
        favoriteClub: null,
        strongFoot: null,
        position: null,
        isVerifiedPro: false,
        profilePublic: false,
        bannedAt: new Date(),
      })
      .where(eq(users.id, userId));
    await audit(userId, "account.delete", "user", userId, {}, tx);
  });
}
