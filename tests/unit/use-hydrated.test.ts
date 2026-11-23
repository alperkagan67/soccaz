import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useHydrated } from "@/components/useHydrated";

// Welle 5: useHydrated ist auf dem Server (und beim ersten Zeichnen im Browser) false, im Browser danach true. Vor der Hydration bleiben Knöpfe gesperrt, die sonst ein natives GET auslösen würden.
describe("useHydrated", () => {
  it("serverseitig false (Server-HTML: Knopf gesperrt)", () => {
    const Probe = () => createElement("span", { "data-hydrated": String(useHydrated()) });
    expect(renderToString(createElement(Probe))).toContain('data-hydrated="false"');
  });

  it("im Browser true: Client-Snapshot ist true (kein DOM in dieser Testumgebung; die Hydration belegt das E2E: der Knopf wird bedienbar)", () => {
    const src = readFileSync("src/components/useHydrated.ts", "utf8");
    const aufruf = /useSyncExternalStore\((.*)\);/.exec(src)?.[1] ?? "";
    const [subscribe, clientSnapshot, serverSnapshot] = aufruf.split(",").map((x) => x.trim()); // (subscribe, getSnapshot, getServerSnapshot)
    expect(subscribe, "subscribe").toBe("noop");
    expect(clientSnapshot, "Client-Snapshot (Mutation () => false muss rot werden)").toBe("() => true");
    expect(serverSnapshot, "Server-Snapshot").toBe("() => false");
  });

  it("alle Absende-Knöpfe der Client-Handler-Formulare sind bis zur Hydration gesperrt (venue-save, result-submit, decide-submit)", () => {
    const dateien: [string, string][] = [
      ["src/app/lobby/[id]/LobbyClient.tsx", "venue-save"],
      ["src/app/spiele/[id]/MatchClient.tsx", "result-submit"],
      ["src/app/spiele/[id]/MatchClient.tsx", "decide-submit"],
    ];
    for (const [datei, testid] of dateien) {
      const src = readFileSync(join(process.cwd(), datei), "utf8");
      const knopf = new RegExp(`<button[^>]*data-testid="${testid}"[^>]*>`).exec(src)?.[0] ?? "";
      expect(knopf, `${datei}: ${testid}`).toMatch(/disabled=\{[^}]*!hydrated[^}]*\}/);
      expect(src, datei).toMatch(/aria-busy=\{!hydrated \|\| undefined\}/);
    }
  });
});
