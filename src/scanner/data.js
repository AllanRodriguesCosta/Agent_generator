// Dados que parecem catálogo (produtos, serviços, cursos, cardápio...): listas JSON (ou CSV) de
// objetos com um campo de nome. O mapeamento dos campos fica em src/agent/catalog-map.js.
import { mapItems } from "../agent/catalog-map.js";

function arraysIn(value, path = "$", out = [], depth = 0) {
  if (depth > 3 || value == null) return out;
  if (Array.isArray(value)) {
    if (value.length >= 2 && value.filter((v) => v && typeof v === "object" && !Array.isArray(v)).length >= value.length * 0.8) out.push({ path, items: value });
    return out;
  }
  if (typeof value === "object") for (const [k, v] of Object.entries(value)) arraysIn(v, `${path}.${k}`, out, depth + 1);
  return out;
}

export function catalogFromJson(content, rel) {
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    return [];
  }
  return arraysIn(parsed)
    .map(({ path, items }) => mapItems(items, `${rel}${path === "$" ? "" : ` (${path.slice(2)})`}`))
    .filter(Boolean);
}

export function catalogFromCsv(content, rel) {
  const lines = String(content).replace(/\r/g, "").split("\n").filter(Boolean);
  if (lines.length < 3) return [];
  const sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const head = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const items = lines.slice(1, 2001).map((l) => Object.fromEntries(l.split(sep).map((v, i) => [head[i] || `c${i}`, v.trim().replace(/^"|"$/g, "")])));
  const result = mapItems(items, rel);
  return result ? [result] : [];
}

