import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Server-Aktionen und Stripe-Hilfen werden nicht gebraucht: nur die Beschriftung des Knopfes wird geprüft
vi.mock("@/server/payments/card-actions", () => ({ createCardSetupAction: vi.fn(), applyStoredCardForLobby: vi.fn() }));
vi.mock("@/server/payments/fake-card-actions", () => ({ fakeCardReadyAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("CardForm: Beschriftung 'Karte ändern' im Fehlerzustand (Wortwahl begriffe.md)", () => {
  it("mit change heißt der Knopf 'Testkarte ändern' (Testmodus), ohne change 'Testkarte hinterlegen'", async () => {
    const { CardForm } = await import("../../src/app/lobby/[id]/CardForm");
    const changed = renderToStaticMarkup(createElement(CardForm, { matchId: "m", mandateText: "Mandat", fake: true, stored: null, change: true }));
    const first = renderToStaticMarkup(createElement(CardForm, { matchId: "m", mandateText: "Mandat", fake: true, stored: null }));
    expect(changed).toContain("Testkarte ändern");
    expect(changed).not.toContain("hinterlegen");
    expect(first).toContain("Testkarte hinterlegen");
    expect(first).not.toContain("ändern");
  }, 60_000); // der erste Import der Komponente dauert auf einem ausgelasteten Rechner länger als 5 s
});
