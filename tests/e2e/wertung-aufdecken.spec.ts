import { expect, test } from "@playwright/test";
import { addParticipant, closeContexts, devLogin, run, seedUser, testDb } from "./helpers";

// Vertrag 013 v3, AC-20 (Text ohne Animation) und AC-17 (nur die eigene Wertung): nach einem bestätigten Ergebnis zeigt /spiele/[id] dem Spieler seine Wertungsänderung.
test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

test("Spieler sieht nach dem bestätigten Ergebnis NUR seine Wertungsänderung, Gast und Fremde nichts; Screenshots 390/1280 hell/dunkel", async ({ browser }, testInfo) => {
  const starName = `Aufsteiger ${run}`;
  const rivalName = `Absteiger ${run}`;
  const star = await seedUser("rvstar", starName);
  const rival = await seedUser("rvrival", rivalName);
  const stranger = await seedUser("rvfremd", `Fremder ${run}`);
  const db = testDb();
  const mkTeam = async (name: string, admin: string) => {
    const { rows } = await db.query("insert into teams (name, slug, city, created_by) values ($1, $2, 'Essen', $3) returning id", [name, `e2e-rv-${name.replace(/\W+/g, "-").toLowerCase()}`, admin]);
    await db.query("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [rows[0].id, admin]);
    return rows[0].id as string;
  };
  const home = await mkTeam(`Reveal Heim ${run}`, star);
  const away = await mkTeam(`Reveal Gast ${run}`, rival);
  const { rows } = await db.query(
    `insert into matches (home_team_id, away_team_id, starts_at, duration_min, status, finalized_at)
     values ($1, $2, now() - interval '3 hours', 60, 'played', now() - interval '1 hour') returning id`,
    [home, away],
  );
  const matchId = rows[0].id as string;
  await addParticipant(matchId, star, home);
  await addParticipant(matchId, rival, away);
  await db.query("insert into match_results (match_id, home_score, away_score, confirmed_home, confirmed_away) values ($1, 3, 1, true, true)", [matchId]);
  // Elo 1000 -> 1090 (Wertung 50 -> 61, Aufstieg Kreide -> Rasen) bzw. 1000 -> 910 (50 -> 39, Stufe bleibt Kreide)
  await db.query("insert into rating_history (kind, subject_id, match_id, elo_before, elo_after) values ('user', $1, $3, 1000, 1090), ('user', $2, $3, 1000, 910)", [star, rival, matchId]);

  // Gast: keine Wertungsänderung im Dokument
  const anon = await (await browser.newContext()).newPage();
  await anon.goto(`/spiele/${matchId}`);
  await expect(anon.getByText(`3 : 1`).first()).toBeVisible();
  await expect(anon.getByTestId("rating-reveal")).toHaveCount(0);
  expect(await anon.content()).not.toContain("Deine Wertung nach diesem Spiel");

  // Spieler: sieht Karte und Text, nur die eigene Änderung
  const sp = await (await browser.newContext()).newPage();
  await devLogin(sp, `rvstar-${run}@test.local`, starName);
  await sp.goto(`/spiele/${matchId}`);
  const reveal = sp.getByTestId("rating-reveal");
  await expect(reveal).toBeVisible();
  await expect(sp.getByTestId("rating-reveal-text")).toHaveText("Wertung 50 → 61 (+11), Stufe Rasen. Aufstieg: Kreide → Rasen");
  await expect(reveal).toHaveAttribute("data-tier-change", "up");
  await expect(reveal.getByTestId("player-card")).toHaveAttribute("data-kind", "full");
  expect(await sp.content()).not.toContain("Wertung 50 → 39"); // die Änderung des Gegners steht nirgends im Dokument
  for (const [w, h] of [[390, 844], [1280, 800]] as const) {
    for (const scheme of ["dark", "light"] as const) {
      await sp.setViewportSize({ width: w, height: h });
      await sp.emulateMedia({ colorScheme: scheme });
      await reveal.scrollIntoViewIfNeeded();
      await testInfo.attach(`wertung-${w}-${scheme}.png`, { body: await sp.screenshot({ fullPage: true }), contentType: "image/png" });
    }
  }

  // Gegner: eigene Änderung (Stufe bleibt), nicht die des Siegers
  const rp = await (await browser.newContext()).newPage();
  await devLogin(rp, `rvrival-${run}@test.local`, rivalName);
  await rp.goto(`/spiele/${matchId}`);
  await expect(rp.getByTestId("rating-reveal-text")).toHaveText("Wertung 50 → 39 (−11), Stufe Kreide");
  await expect(rp.getByTestId("rating-reveal")).toHaveAttribute("data-tier-change", "same");
  expect(await rp.content()).not.toContain("Wertung 50 → 61");

  // Angemeldeter Fremder (nicht im Spiel): nichts
  const fp = await (await browser.newContext()).newPage();
  await devLogin(fp, `rvfremd-${run}@test.local`, `Fremder ${run}`);
  await fp.goto(`/spiele/${matchId}`);
  await expect(fp.getByTestId("rating-reveal")).toHaveCount(0);
  expect(stranger).toBeTruthy();
});
