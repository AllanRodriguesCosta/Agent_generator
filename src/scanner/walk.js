// Lista os arquivos do projeto que interessam ao raio X, sem entrar em dependências, builds,
// pastas ocultas ou arquivos grandes. Nunca lê .env nem arquivos de chave.
import { readdir, stat } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";

export const IGNORED_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".output", "coverage",
  "vendor", "venv", ".venv", "__pycache__", ".cache", ".turbo", ".vercel", ".idea", ".vscode", "target", "bin", "obj", "agente", "agente-gerador",
]);
export const SECRET_FILE = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|crt)|id_rsa.*|.*secret.*|.*credenciais.*|.*credentials.*)$/i;
export const TEXT_EXT = new Set([".html", ".htm", ".md", ".mdx", ".txt", ".json", ".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx", ".vue", ".svelte", ".astro", ".py", ".php", ".erb", ".ejs", ".hbs", ".njk", ".liquid", ".csv"]);

export async function listFiles(root, { maxFiles = 3000, maxBytes = 1_000_000 } = {}) {
  const files = [];
  const skipped = { grandes: 0, segredos: 0, limite: false };
  async function walk(dir, depth) {
    if (depth > 12 || files.length >= maxFiles) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        skipped.limite = true;
        return;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) await walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SECRET_FILE.test(entry.name)) {
        skipped.segredos++;
        continue;
      }
      const ext = extname(entry.name).toLowerCase();
      if (!TEXT_EXT.has(ext) || /\.(min|bundle)\.js$|-lock\.json$|^package-lock\.json$/.test(basename(entry.name))) continue;
      const info = await stat(full);
      if (info.size > maxBytes) {
        skipped.grandes++;
        continue;
      }
      files.push({ path: full, rel: relative(root, full).split("\\").join("/"), ext, size: info.size });
    }
  }
  await walk(root, 0);
  return { files, skipped };
}
