// Regel (013 M2-1, Verdichtung K03): Schrift unter 12 px ist verboten.
// Geprüft werden Tailwind-Klassen mit freiem Wert (text-[11px], text-[0.7rem]) in Zeichenketten
// und Schriftgrößen in Stilobjekten (fontSize: 10, fontSize: "10px", fontSize: "0.7rem").
const MIN_PX = 12;
const CLASS_RE = /(?:^|[\s:"'`])text-\[(\d*\.?\d+)(px|rem|em)\]/g;

function toPx(value, unit) {
  return unit === "px" ? value : value * 16;
}

function tooSmallClass(text) {
  for (const m of text.matchAll(CLASS_RE)) {
    if (toPx(parseFloat(m[1]), m[2]) < MIN_PX) return m[0].trim();
  }
  return null;
}

function tooSmallStyle(node) {
  if (node.type === "Literal") {
    if (typeof node.value === "number") return node.value > 0 && node.value < MIN_PX ? `${node.value}` : null;
    if (typeof node.value === "string") {
      const m = /^\s*(\d*\.?\d+)(px|rem|em)\s*$/.exec(node.value);
      if (m && toPx(parseFloat(m[1]), m[2]) < MIN_PX) return node.value;
    }
  }
  return null;
}

const rule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      cls: "Schrift unter 12 px ist nicht erlaubt ({{found}}). Kleinste Stufe: text-xs (12 px).",
      style: "Schriftgröße unter 12 px ist nicht erlaubt ({{found}}). Kleinste Stufe: 12 px.",
    },
  },
  create(context) {
    const checkText = (node, text) => {
      const found = tooSmallClass(text);
      if (found) context.report({ node, messageId: "cls", data: { found } });
    };
    return {
      Literal(node) {
        if (typeof node.value === "string") checkText(node, node.value);
      },
      TemplateElement(node) {
        checkText(node, node.value.cooked ?? node.value.raw);
      },
      Property(node) {
        const key = node.key.type === "Identifier" ? node.key.name : node.key.type === "Literal" ? String(node.key.value) : "";
        if (key !== "fontSize") return;
        const found = tooSmallStyle(node.value);
        if (found) context.report({ node: node.value, messageId: "style", data: { found } });
      },
    };
  },
};

const plugin = { rules: { "min-font-size": rule } };
export default plugin;
