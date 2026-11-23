import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Formulare vor der Hydration (Backlog 223/224, Kandidat 28): Ein <form> mit onSubmit, aber ohne `action`, wird vor der Hydration vom Browser nativ als GET gesendet (alle Felder in der Adresse, die Aktion läuft
// nicht). Jedes <form> mit onSubmit braucht darum `action=` (Server-Aktion: läuft auch vor der Hydration) oder, nur für Client-Handler-Formulare (Welle 5), `method="post"` PLUS einen bis zur Hydration gesperrten
// Knopf (`useHydrated`): `method="post"` allein schützt nur vor dem GET-Leck, die Aktion läuft dann NICHT. Bestehende Formulare stehen in der Ausnahmeliste (je Datei begründet), bis ihre Welle umgesetzt ist; die Liste
// darf nur kleiner werden (ein Eintrag ohne Verstoß lässt den Test rot werden: dann streichen).
const root = join(__dirname, "..", "..", "src");

/** Datei -> Grund (Welle laut docs/loop/BACKLOG.md 224). Client-Handler brauchen JavaScript ohnehin (Welle 5: Knopf bis zur Hydration gesperrt + method=post). */
export const EXCEPTIONS: Record<string, string> = {
  "app/willkommen/OnboardingForm.tsx": "Welle 2 (Konto und Profil): bleibt, bis das Spieler-Onboarding PR 2 (#272) die Datei löscht",
  "app/mitspieler/PostForm.tsx": "Welle 3 (Inhalte)",
  "components/CommentForm.tsx": "Welle 3 (Inhalte)",
  "app/app/teams/neu/TeamForm.tsx": "Welle 3 (Inhalte)",
  "app/app/suche/neu/RequestForm.tsx": "Welle 3 (Inhalte)",
  "app/app/privatspiel/neu/PrivateGameForm.tsx": "Welle 3 (Inhalte)",
  "app/app/turniere/neu/TournamentForm.tsx": "Welle 3 (Inhalte)",
  "app/turniere/[id]/RegisterForm.tsx": "Welle 3 (Inhalte)",
  "app/einladung/[token]/JoinForm.tsx": "Welle 3 (Inline-Closure: joinTeamAction per bind)",
  "components/ActionForm.tsx": "Welle 4 (Bausteine, 29 Verwendungen)",
  "components/ui/Form.tsx": "Welle 4 (Bausteine)",
  "components/ui/Assistent.tsx": "Welle 5 (Client-Handler)",
  "app/lobby/[id]/CardForm.tsx": "Welle 5 (Client-Handler, Stripe Elements)",
  "app/lobby/[id]/LobbyClient.tsx": "Welle 5 (Client-Handler)",
  "app/spiele/[id]/MatchClient.tsx": "Welle 5 (Client-Handler)",
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

/** Öffnende <form ...>-Tags samt Attributen; `>` in {...} oder Anführungszeichen zählt nicht als Ende (onSubmit={(e) => {...}}). */
export function formTags(src: string): string[] {
  const out: string[] = [];
  const re = /<form(?=[\s>])/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 0;
    let quote = "";
    let i = m.index + 5;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = "";
      } else if (depth === 0 && (c === '"' || c === "'")) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

// `(?<![-\w])`: `data-action=` oder `formAction=` zählen nicht als `action=`.
const attr = (tag: string, name: string) => new RegExp(`(?<![-\\w])${name}=`).test(tag);
/** `src` ist der Quelltext der Datei: `method="post"` allein genügt nicht, der Knopf muss bis zur Hydration gesperrt sein (`useHydrated`). */
export const violates = (tag: string, src = "") => attr(tag, "onSubmit") && !attr(tag, "action") && !(/(?<![-\w])method=["']post["']/i.test(tag) && /\buseHydrated\b/.test(src));

describe("Formulare mit onSubmit brauchen action oder method=post (Progressive Enhancement)", () => {
  const all = files(root).map((f) => ({ rel: relative(root, f).split("\\").join("/"), src: readFileSync(f, "utf8") }));
  const bad = all.filter((f) => formTags(f.src).some((tag) => violates(tag, f.src))).map((f) => f.rel);

  it("kein NEUES Formular ohne action: jede Verletzung steht in der Ausnahmeliste", () => {
    expect(bad.filter((f) => !(f in EXCEPTIONS))).toEqual([]);
  });

  it("die Ausnahmeliste enthält nur noch Dateien mit Verstoß (nach einer Welle streichen)", () => {
    expect(Object.keys(EXCEPTIONS).filter((f) => !bad.includes(f))).toEqual([]);
  });

  it("Welle 2: kein Formular mit personenbezogenen Feldern (Geburtsdatum, E-Mail, Telefon, IBAN, Spitzname, Bio, Lieblingsverein, Rückennummer) ohne action; nur OnboardingForm steht noch in der Ausnahmeliste, bis PR 2 sie löscht", () => {
    const pii = /name="[^"]*(mail|phone|iban|birth|street|address|postal|zip|bio|nick|club|shirt)[^"]*"/i; // Teilstrings: Name/Stadt/Position sind kein Personenbezug im engeren Sinn (werden im selben Absenden mit abgedeckt)
    const leaky = all.filter((f) => bad.includes(f.rel) && pii.test(f.src)).map((f) => f.rel);
    expect(leaky.filter((f) => f !== "app/willkommen/OnboardingForm.tsx")).toEqual([]);
  });

  it("Welle 2: ProfileForm (Profil und Konto löschen) und PrefsForm haben action={formAction} und onSubmit an jedem Formular", () => {
    for (const f of ["app/app/einstellungen/ProfileForm.tsx", "app/app/einstellungen/PrefsForm.tsx"]) {
      const tags = formTags(readFileSync(join(root, f), "utf8"));
      expect(tags.length, f).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, f).toMatch(/action=\{formAction\}/);
        expect(tag, f).toMatch(/onSubmit=\{onSubmit\}/);
      }
    }
  });

  it("Pilot: AcceptForm (Spiel annehmen) hat action={formAction} und onSubmit", () => {
    const tags = formTags(readFileSync(join(root, "app/suche/[id]/AcceptForm.tsx"), "utf8"));
    expect(tags).toHaveLength(1);
    expect(tags[0]).toMatch(/action=\{formAction\}/);
    expect(tags[0]).toMatch(/onSubmit=\{onSubmit\}/);
  });

  it("useFormAction gibt formAction zurück", () => {
    expect(readFileSync(join(root, "components/useFormAction.ts"), "utf8")).toMatch(/return \{ state, pending, onSubmit, formAction \}/);
  });

  it("der Tag-Leser erkennt Verstoß und Behebung (Gegenprobe)", () => {
    expect(formTags('<form onSubmit={(e) => { go(e); }} className="x">')).toHaveLength(1);
    expect(violates('<form onSubmit={(e) => { go(e); }} className="x">')).toBe(true);
    expect(violates('<form action={formAction} onSubmit={onSubmit}>')).toBe(false);
    expect(violates('<form method="post" onSubmit={onSubmit}>')).toBe(true); // nur method=post: die Aktion läuft nicht, Knopf nicht gesperrt
    expect(violates('<form method="post" onSubmit={onSubmit}>', "const ok = useHydrated();")).toBe(false); // Welle 5: Knopf bis zur Hydration gesperrt
    expect(violates('<form data-action="x" onSubmit={onSubmit}>')).toBe(true); // data-action zählt nicht
    expect(violates('<form className="card">')).toBe(false);
  });
});
