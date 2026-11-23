import { readFileSync } from "node:fs";
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
    expect(src).toMatch(/useSyncExternalStore\(noop, \(\) => true, \(\) => false\)/); // (subscribe, Client-Snapshot, Server-Snapshot)
  });
});
