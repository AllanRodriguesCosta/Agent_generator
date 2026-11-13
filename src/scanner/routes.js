// Rotas do projeto: servidores (Express, Fastify, Koa, Flask, FastAPI, Django, PHP/Laravel),
// roteadores de front-end (React Router, Vue Router, Angular) e rotas por arquivo (Next.js,
// Nuxt, SvelteKit, Astro). Rotas de API viram "ações" possíveis; as de página, destinos.

const SERVER = [
  /\b(?:app|router|server|api|fastify|r)\.(get|post|put|patch|delete|all)\(\s*["'`](\/[^"'`]*)["'`]/g,
  /@(?:app|router|bp|blueprint)\.(get|post|put|patch|delete|route)\(\s*["'](\/[^"']*)["']/g,
  /\bRoute::(get|post|put|patch|delete|any)\(\s*["'](\/?[^"']*)["']/g,
  /\b(?:re_)?path\(\s*r?["'](\^?[\w/<>:.-]*)["']/g,
];
const CLIENT = [/<Route\b[^>]*\bpath\s*=\s*["'{`]+([^"'}`]+)["'}`]/g, /\bpath\s*:\s*["'`](\/?[\w/:.*-]*)["'`]/g];

export function routesFromSource(content, rel) {
  const found = [];
  for (const re of SERVER)
    for (const m of content.matchAll(re)) {
      const [method, path] = m.length > 2 ? [m[1], m[2]] : ["get", m[1]];
      const clean = `/${String(path).replace(/^\^|\$$/g, "").replace(/^\/+/, "")}`;
      found.push({ metodo: method.toUpperCase() === "ROUTE" || method === "any" ? "ANY" : method.toUpperCase(), caminho: clean, arquivo: rel, tipo: /\/api\b|^\/api/.test(clean) ? "api" : "servidor" });
    }
  if (/\.(jsx|tsx|js|ts|vue)$/.test(rel) && /(react-router|vue-router|@angular\/router|createBrowserRouter|<Route\b|Routes\b)/.test(content))
    for (const re of CLIENT)
      for (const m of content.matchAll(re)) found.push({ metodo: "GET", caminho: m[1].startsWith("/") ? m[1] : `/${m[1]}`, arquivo: rel, tipo: "pagina" });
  return found;
}

// Next.js (pages/ e app/), Nuxt (pages/), SvelteKit (src/routes/+page.svelte), Astro (src/pages).
export function routeFromFile(rel) {
  let m = rel.match(/^(?:src\/)?app\/(.*?)\/?page\.(jsx?|tsx?|mdx?)$/);
  if (m) return pathFrom(m[1].replace(/\([^)]*\)\/?/g, ""));
  m = rel.match(/^(?:src\/)?pages\/(.*)\.(jsx?|tsx?|vue|astro|mdx?)$/);
  if (m && !/^(_app|_document|_error|api\/)/.test(m[1])) return pathFrom(m[1].replace(/(^|\/)index$/, ""));
  m = rel.match(/^src\/routes\/(.*?)\/?\+page\.svelte$/);
  if (m) return pathFrom(m[1]);
  return null;
}
const pathFrom = (p) => `/${p.replace(/\[\.\.\.(\w+)\]/g, "*").replace(/\[(\w+)\]/g, ":$1").replace(/\/+$/, "")}`.replace(/\/+/g, "/");
