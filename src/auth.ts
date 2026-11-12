import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import type { Role } from "@/lib/roles";
import { redeemVenueInvites } from "@/server/venue-access";

const isDev = process.env.NODE_ENV !== "production";

async function upsertUser(input: { email: string; name: string; googleId?: string; avatarUrl?: string }) {
  const email = input.email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) return existing;
  const [created] = await db
    .insert(users)
    .values({ email, name: input.name, googleId: input.googleId, avatarUrl: input.avatarUrl })
    .returning();
  return created;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/anmelden" },
  providers: [
    ...(process.env.AUTH_GOOGLE_ID
      ? [Google({ authorization: { params: { prompt: "select_account" } } })]
      : []),
    ...(isDev
      ? [
          Credentials({
            id: "dev",
            name: "Dev-Login",
            credentials: { email: {}, name: {} },
            async authorize(c) {
              const email = String(c?.email ?? "").trim();
              if (!email) return null;
              const user = await upsertUser({ email, name: String(c?.name || email.split("@")[0]) });
              // Nur lokal: Wer sich mit admin@… anmeldet, ist Plattform-Admin (so lässt sich der Betreiber-Weg ausprobieren)
              if (email.toLowerCase().startsWith("admin@") && (user.role !== "admin" || !user.isOwner)) {
                // lokal ist admin@ Admin 1 (users.is_owner), solange es noch keinen anderen Admin 1 gibt (der Teilindex erlaubt nur einen)
                await db
                  .update(users)
                  .set({ role: "admin", isOwner: sql`not exists (select 1 from users o where o.is_owner and o.id <> ${user.id})` })
                  .where(eq(users.id, user.id));
              }
              return { id: user.id, email: user.email, name: user.name };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "google" && profile?.email) {
        const user = await upsertUser({
          email: profile.email,
          name: profile.name ?? profile.email,
          googleId: profile.sub ?? undefined,
          avatarUrl: typeof profile.picture === "string" ? profile.picture : undefined,
        });
        // Betreiber-Einladungen einlösen (011 M1): nur Google mit verifizierter E-Mail, nie der Dev-Login; ein Fehler hier darf die Anmeldung nicht verhindern
        try {
          await redeemVenueInvites({ userId: user.id, email: user.email, provider: "google", emailVerified: profile.email_verified === true });
        } catch (e) {
          console.error("Einlösen der Betreiber-Einladung fehlgeschlagen", e);
        }
      }
      return true;
    },
    async jwt({ token }) {
      if (token.email) {
        const [u] = await db.select().from(users).where(eq(users.email, token.email.toLowerCase()));
        if (u) {
          token.uid = u.id;
          token.role = u.role;
          token.banned = !!u.bannedAt;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});
