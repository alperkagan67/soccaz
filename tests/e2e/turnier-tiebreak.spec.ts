import { expect, test } from "@playwright/test";
import { closeContexts, run } from "./helpers";
import { clickReady } from "./flows";
import { query } from "./helpers-db";
import { expectCleanPhonePage, loginPhone, phonePage, seedFreeTournament, seedOrganizer, seedTeam } from "./turnier-tag-helpers";
import { knockout } from "@/lib/tournament";

// PR 1b (Gratis-Turnier, Zahlungen AUS): Tie-Break im K.-o. auf dem Handy (390 px): Gast sieht nur den Hinweis; der Veranstalter trifft eine PFLICHTAUSWAHL (Golden Goal für A/B, Neunmeter-Sieger A/B),
// bestätigt in der Rückfrage mit großem Spielstand und sieht danach "n. GG" bzw. "n. 9m (a:b)" im Bracket; der Sieger rückt weiter. Server-Regeln: tests/integration/tournament-tiebreak.test.ts (PR 1a).
test.setTimeout(240_000);
test.afterEach(async ({ browser }) => {
  await closeContexts(browser);
});

const dialog = (page: import("@playwright/test").Page) => page.getByTestId("confirm-dialog").filter({ visible: true });

async function seedKo() {
  const org = await seedOrganizer("tb");
  const t = await seedFreeTournament(org.id, "tb", 4);
  const teams: Awaited<ReturnType<typeof seedTeam>>[] = [];
  for (let i = 0; i < 4; i++) teams.push(await seedTeam(t.id, `tb${i}`, true));
  await query("update tournaments set status = 'running', bracket_generated_at = now(), starts_at = now() - interval '1 hour', registration_deadline = now() - interval '5 days' where id = $1", [t.id]);
  const fixtures = knockout(teams.map((x) => x.teamId));
  const idOf = new Map<string, string>();
  const k = (s: { stage: string; round: number; slot: number }) => `${s.stage}|${s.round}|${s.slot}`;
  for (const f of fixtures) idOf.set(k(f), (await query<{ id: string }>("insert into tournament_matches (tournament_id, stage, round, slot, team_a, team_b) values ($1, $2, $3, $4, $5, $6) returning id", [t.id, f.stage, f.round, f.slot, f.a, f.b]))[0].id);
  for (const f of fixtures) if (f.feeds) await query("update tournament_matches set feeds_match_id = $1, feeds_side = $2 where id = $3", [idOf.get(k(f.feeds)), f.feeds.side, idOf.get(k(f))]);
  // beide Halbfinals enden unentschieden (2:2 und 1:1)
  const semis = await query<{ id: string; team_a: string; team_b: string; slot: number }>("select id, team_a, team_b, slot from tournament_matches where tournament_id = $1 and stage = 'ko:4' order by slot", [t.id]);
  await query("update tournament_matches set score_a = 2, score_b = 2 where id = $1", [semis[0].id]);
  await query("update tournament_matches set score_a = 1, score_b = 1 where id = $1", [semis[1].id]);
  const name = (id: string) => teams.find((x) => x.teamId === id)!.name;
  return { org, t, semis, name };
}

test("Gast sieht nur den Hinweis; Veranstalter wählt Pflicht, Golden Goal und Neunmeter mit Trefferzahlen (Handy)", async ({ browser }) => {
  const { org, t, semis, name } = await seedKo();

  // Gast: Hinweis, kein Formular
  const gast = await phonePage(browser);
  await gast.goto(`/turniere/${t.id}`);
  await expect(gast.getByTestId("tiebreak-offen").first()).toContainText("Der Veranstalter trägt Golden Goal oder Neunmeter ein");
  await expect(gast.getByTestId("tiebreak-form")).toHaveCount(0);
  await expectCleanPhonePage(gast, "Turnierseite Gast (Gleichstand offen)");

  // Veranstalter: Pflichtauswahl
  const page = await loginPhone(browser, org.email, org.name);
  await page.goto(`/turniere/${t.id}`);
  await page.waitForLoadState("networkidle");
  const forms = page.getByTestId("tiebreak-form");
  await expect(forms).toHaveCount(2);
  const m1 = forms.nth(0);
  await expect(m1.getByRole("radio")).toHaveCount(4);
  await expect(m1.getByRole("button", { name: "Entscheidung eintragen" })).toBeDisabled(); // ohne Auswahl keine Eintragung
  await expect(m1.getByTestId("tiebreak-pflicht")).toBeVisible();
  const kasten = await m1.getByRole("button", { name: "Entscheidung eintragen" }).boundingBox();
  expect(kasten!.height, "44 px").toBeGreaterThanOrEqual(44);
  await expectCleanPhonePage(page, "Turnierseite Veranstalter (Gleichstand offen)");

  // Spiel 1: Golden Goal für Team A: Rückfrage mit großem Spielstand, danach 3:2 n. GG, Sieger im Finale
  const a1 = name(semis[0].team_a);
  const b1 = name(semis[0].team_b);
  await m1.getByLabel(`Golden Goal für ${a1}`, { exact: true }).check();
  await clickReady(m1.getByRole("button", { name: "Entscheidung eintragen" }));
  await expect(dialog(page).getByTestId("confirm-consequence")).toContainText(`${a1} 2 : 2 ${b1} → Golden Goal für ${a1}`);
  await dialog(page).getByRole("button", { name: "Endgültig eintragen" }).click();
  await expect.poll(async () => (await query<{ s: number; d: string | null; w: string | null }>("select score_a as s, decided_by as d, shootout_winner as w from tournament_matches where id = $1", [semis[0].id]))[0], { timeout: 30_000 }).toEqual({ s: 3, d: "gg", w: null });
  const fin = (await query<{ team_a: string | null; team_b: string | null }>("select team_a, team_b from tournament_matches where tournament_id = $1 and stage = 'ko:2'", [t.id]))[0];
  expect([fin.team_a, fin.team_b]).toContain(semis[0].team_a); // der Sieger rückt weiter
  await page.reload();
  await expect(page.getByTestId("tiebreak-marke").filter({ hasText: "n. GG" })).toHaveCount(1);

  // Spiel 2: Neunmeter, Sieger B, erst nur EINE Trefferzahl (Fehler), dann beide 4:3
  const m2 = page.getByTestId("tiebreak-form").first();
  const a2 = name(semis[1].team_a);
  const b2 = name(semis[1].team_b);
  await m2.getByLabel(`Neunmeter, Sieger ${b2}`, { exact: true }).check();
  await m2.getByLabel(`Treffer ${a2}`).fill("4");
  await expect(m2.getByTestId("tiebreak-zaehler-fehler")).toBeVisible();
  await expect(m2.getByRole("button", { name: "Entscheidung eintragen" })).toBeDisabled();
  await m2.getByLabel(`Treffer ${b2}`).fill("3");
  await expect(m2.getByTestId("tiebreak-zaehler-fehler")).toHaveCount(0);
  await clickReady(m2.getByRole("button", { name: "Entscheidung eintragen" }));
  await expect(dialog(page).getByTestId("confirm-consequence")).toContainText(`${a2} 1 : 1 ${b2} → Neunmeter, Sieger ${b2}`);
  await dialog(page).getByRole("button", { name: "Endgültig eintragen" }).click();
  await expect.poll(async () => (await query<{ d: string | null; w: string | null; a: number | null; b: number | null }>("select decided_by as d, shootout_winner as w, shootout_a as a, shootout_b as b from tournament_matches where id = $1", [semis[1].id]))[0], { timeout: 30_000 }).toEqual({ d: "9m", w: semis[1].team_b, a: 4, b: 3 });
  await page.reload();
  await expect(page.getByTestId("tiebreak-marke").filter({ hasText: "n. 9m (4:3)" })).toHaveCount(1);
  await expect(page.getByTestId("tiebreak-form")).toHaveCount(0); // nichts mehr offen
  await expectCleanPhonePage(page, "Turnierseite Veranstalter (nach der Entscheidung)");
  expect(run.length).toBeGreaterThan(0);
});
