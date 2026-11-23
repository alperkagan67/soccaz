import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Formulare vor der Hydration (Backlog 223/224, Kandidat 28): Ein <form> mit onSubmit, aber ohne `action`, wird vor der Hydration vom Browser nativ als GET gesendet (alle Felder in der Adresse, die Aktion läuft
// nicht). Jedes <form> mit onSubmit braucht darum `action=` (Server-Aktion: läuft auch vor der Hydration) oder, nur für Client-Handler-Formulare (Welle 5), `method="post"` PLUS einen bis zur Hydration gesperrten
// Knopf (`useHydrated`): `method="post"` allein schützt nur vor dem GET-Leck, die Aktion läuft dann NICHT. Bestehende Formulare stehen in der Ausnahmeliste (je Datei begründet), bis ihre Welle umgesetzt ist; die Liste
// darf nur kleiner werden (ein Eintrag ohne Verstoß lässt den Test rot werden: dann streichen).
const root = join(__dirname, "..", "..", "src");

/** Datei -> Grund. Nur noch Client-Handler-Formulare mit eigener Sperre (Welle 5: LobbyClient und MatchClient sperren ihren Knopf per useHydrated und haben method=post; Assistent und CardForm bleiben bewusst nicht erzwungen). Die Liste darf nur kleiner werden. */
export const EXCEPTIONS: Record<string, string> = {
  "components/ActionForm.tsx": "Welle 4 (Bausteine, 29 Verwendungen)",
  "components/ui/Form.tsx": "Welle 4 (Bausteine)",
  "components/ui/Assistent.tsx": "bewusst nicht erzwungen: eigene Sperre (`bereit`: fieldset disabled und Knopf disabled bis der Baustein im Browser aktiv ist, #272); Client-Handler ohne Server-Aktion",
  "app/lobby/[id]/CardForm.tsx": "bewusst nicht erzwungen: Zahlung (Stripe Elements) wird nicht angefasst; der Knopf ist serverseitig gesperrt (`disabled={!stripe || busy}`), bis Stripe im Browser geladen ist, Enter löst bei gesperrtem Standardknopf keine Absendung aus",
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

  it("Welle 2: kein Formular mit personenbezogenen Feldern (Geburtsdatum, E-Mail, Telefon, IBAN, Spitzname, Bio, Lieblingsverein, Rückennummer) ohne action; OnboardingForm ist mit dem Spieler-Onboarding PR 2 (#272) entfallen", () => {
    const pii = /name="[^"]*(mail|phone|iban|birth|street|address|postal|zip|bio|nick|club|shirt)[^"]*"/i; // Teilstrings: Name/Stadt/Position sind kein Personenbezug im engeren Sinn (werden im selben Absenden mit abgedeckt)
    const leaky = all.filter((f) => bad.includes(f.rel) && pii.test(f.src)).map((f) => f.rel);
    expect(leaky).toEqual([]);
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

// Inline-Closure statt Server-Aktions-Referenz: `useFormAction(() => ...)` rendert trotz `action={formAction}` `javascript:throw ...` ins action-Attribut (vor der Hydration passiert beim Absenden nichts Brauchbares).
// Erlaubt sind nur Referenzen (`useFormAction(meineAktion)` oder `meineAktion.bind(null, id)`).
export const INLINE_CLOSURE = /useFormAction\(\s*(async\s*)?(\(|function\b)/;

describe("useFormAction bekommt nie eine Inline-Closure", () => {
  const alle = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? alle(p) : /\.tsx?$/.test(p) ? [p] : [];
    });

  it("kein Aufruf in src mit Pfeilfunktion oder function", () => {
    const treffer = alle(root).filter((f) => INLINE_CLOSURE.test(readFileSync(f, "utf8"))).map((f) => relative(root, f).split("\\").join("/"));
    expect(treffer).toEqual([]);
  });

  it("Gegenprobe: erkennt Closures, lässt Referenzen und bind zu", () => {
    expect(INLINE_CLOSURE.test("useFormAction(() => joinTeamAction(token))")).toBe(true);
    expect(INLINE_CLOSURE.test("useFormAction( async (p, f) => x(p, f))")).toBe(true);
    expect(INLINE_CLOSURE.test("useFormAction(function (p, f) { return x(p, f); })")).toBe(true);
    expect(INLINE_CLOSURE.test("useFormAction(createTeamAction)")).toBe(false);
    expect(INLINE_CLOSURE.test("useFormAction(joinTeamAction.bind(null, token))")).toBe(false);
    expect(INLINE_CLOSURE.test("export function useFormAction(action: (prev: ActionState) => void)")).toBe(false);
  });
});
