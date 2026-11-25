// Versão 0.12: colocar o agente num site que JÁ ESTÁ NO AR, sem clonar o projeto e sem novo deploy.
// - A linha para colar (e a versão "carregador" para Google Tag Manager e construtores que só
//   aceitam script comum).
// - Guia por plataforma (WordPress, Wix, Shopify, Webflow, Squarespace, GTM, Blogger, HTML) e
//   detecção da plataforma pelo HTML da página inicial.
// - Plugin WordPress pronto (zip): Plugins > Adicionar novo > Enviar plugin.
// - Verificação: lê a página publicada e confere a linha, a CSP e o serviço.
// - Prévia: um endereço local que mostra o site publicado com o agente, antes de colar a linha.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, normalize, sep, extname } from "node:path";
import { deflateRawSync } from "node:zlib";
import { cspAdvice, USER_AGENT } from "../crawler/index.js";

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** As duas linhas (CSS e widget) para o fim do <body>. base = https://serviço/agente/ */
export function embedTags(base) {
  const b = base.endsWith("/") ? base : `${base}/`;
  return `<link rel="stylesheet" href="${esc(`${b}widget.css`)}">\n<script type="module" src="${esc(`${b}widget.js`)}"></script>`;
}

/** Para quem só aceita script comum (Google Tag Manager, alguns construtores): cria as duas tags. */
export function loaderScript(base) {
  const b = base.endsWith("/") ? base : `${base}/`;
  const u = JSON.stringify(b);
  return `<script>(function(){var b=${u};if(document.querySelector('script[src="'+b+'widget.js"]'))return;var l=document.createElement('link');l.rel='stylesheet';l.href=b+'widget.css';document.head.appendChild(l);var s=document.createElement('script');s.type='module';s.src=b+'widget.js';document.body.appendChild(s);})();</script>`;
}

// Sinais de cada plataforma no HTML da página inicial.
const SINAIS = [
  ["wordpress", /wp-content\/|wp-includes\/|<meta[^>]+generator[^>]+wordpress/i],
  ["shopify", /cdn\.shopify\.com|Shopify\.theme|myshopify\.com/i],
  ["wix", /static\.wixstatic\.com|wix-bolt|_wixCIDX|<meta[^>]+generator[^>]+wix/i],
  ["squarespace", /static1\.squarespace\.com|squarespace-cdn|Static\.SQUARESPACE_CONTEXT/i],
  ["webflow", /data-wf-site|webflow\.js|assets\.website-files\.com|cdn\.prod\.website-files\.com/i],
  ["blogger", /blogger\.com\/static|\.blogspot\.com|<meta[^>]+generator[^>]+blogger/i],
  ["gtm", /googletagmanager\.com\/gtm\.js/i],
];
export function detectPlatform(html = "") {
  const achadas = SINAIS.filter(([, re]) => re.test(html)).map(([id]) => id);
  const principal = achadas.find((p) => p !== "gtm") || (achadas.includes("gtm") ? "gtm" : "html");
  return { principal, temGtm: achadas.includes("gtm"), achadas };
}

/** Passo a passo por plataforma, em linguagem simples. */
export function platformGuides({ temWordpressZip = true } = {}) {
  return [
    {
      id: "wordpress",
      nome: "WordPress",
      passos: [
        ...(temWordpressZip ? ["Mais fácil: no painel do WordPress, vá em Plugins > Adicionar novo > Enviar plugin, escolha o arquivo agente-wordpress.zip (botão Baixar plugin) e clique em Instalar agora e depois em Ativar."] : []),
        "Ou, com o plugin WPCode: Code Snippets > Header & Footer, cole as linhas no campo Footer e salve.",
        "Para tirar o agente depois: desative o plugin (ou apague as linhas).",
      ],
    },
    { id: "wix", nome: "Wix", passos: ["No painel: Configurações > Avançado > Código personalizado > + Adicionar código.", "Cole as linhas, escolha Todas as páginas e Corpo - fim. Clique em Aplicar.", "O Wix só libera código personalizado em planos com domínio conectado."] },
    { id: "shopify", nome: "Shopify", passos: ["Loja virtual > Temas > ... (no tema ativo) > Editar código.", "Abra layout/theme.liquid, cole as linhas logo antes de </body> e clique em Salvar."] },
    { id: "webflow", nome: "Webflow", passos: ["Configurações do site > Código personalizado > Código do rodapé (Footer code).", "Cole as linhas, salve e publique o site de novo (botão Publish)."] },
    { id: "squarespace", nome: "Squarespace", passos: ["Configurações > Avançado (ou Desenvolvedor) > Injeção de código > Rodapé.", "Cole as linhas e salve. Disponível nos planos Business e Commerce."] },
    { id: "gtm", nome: "Google Tag Manager", passos: ["Tags > Nova > Configuração da tag > HTML personalizado.", "Cole o código do carregador (abaixo, versão para GTM). Acionamento: All Pages (Todas as páginas).", "Salve e clique em Enviar > Publicar."] },
    { id: "blogger", nome: "Blogger", passos: ["Layout > Adicionar um gadget > HTML/JavaScript.", "Cole as linhas e salve. O agente aparece em todas as páginas do blog."] },
    { id: "html", nome: "Site em HTML ou outro construtor", passos: ["Cole as linhas antes de </body> em cada página (ou no modelo comum a todas).", "Em outros construtores, procure por Código personalizado, Scripts, Injeção de código ou Rodapé nas configurações, cole e publique."] },
  ];
}

// ---------- plugin WordPress (zip sem dependências) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** files: { "pasta/arquivo.php": conteúdo }. Devolve o .zip (Buffer). */
export function zipFiles(files) {
  const partes = [];
  const central = [];
  let offset = 0;
  const nomes = Object.keys(files);
  for (const name of nomes) {
    const data = Buffer.from(files[name]);
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data);
    const comprime = deflated.length < data.length;
    const body = comprime ? deflated : data;
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // nomes em UTF-8
    local.writeUInt16LE(comprime ? 8 : 0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12); // 01/01/1980
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nameBuf, body);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(comprime ? 8 : 0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x21, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(nomes.length, 8);
  end.writeUInt16LE(nomes.length, 10);
  end.writeUInt32LE(cenBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, cenBuf, end]);
}

const php = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");

/** Plugin WordPress que coloca as duas linhas no rodapé de todas as páginas. */
export function wordpressPlugin({ base, site = "", nome = "Agente do site" }) {
  const b = base.endsWith("/") ? base : `${base}/`;
  const main = `<?php
/**
 * Plugin Name: ${nome.replace(/[\r\n*]/g, " ")} (Agent Generator)
 * Description: Mostra o assistente criado pelo Agent Generator em todas as páginas${site ? ` de ${site.replace(/[\r\n*]/g, "")}` : ""}. Para tirar, desative ou exclua este plugin.
 * Version: 1.0.0
 * Requires at least: 5.0
 * Author: Agent Generator
 * License: MIT
 */
if (!defined('ABSPATH')) {
    exit;
}

function agente_gerador_widget() {
    $base = '${php(b)}';
    echo '<link rel="stylesheet" href="' . esc_url($base . 'widget.css') . '">' . "\\n";
    echo '<script type="module" src="' . esc_url($base . 'widget.js') . '"></script>' . "\\n";
}
add_action('wp_footer', 'agente_gerador_widget');
`;
  const leia = `=== ${nome} (Agent Generator) ===\nStable tag: 1.0.0\nLicense: MIT\n\nMostra o assistente criado pelo Agent Generator em todas as páginas.\nO agente fica em ${b} (serviço do próprio dono do site na Cloudflare).\nPara remover: desative e exclua o plugin.\n`;
  return zipFiles({ "agente-gerador-widget/agente-gerador-widget.php": main, "agente-gerador-widget/readme.txt": leia });
}

// ---------- verificação ----------
/** Lê a página publicada e confere se o agente está lá, se a CSP deixa e se o serviço responde. */
export async function verifyInstall(siteUrl, serviceUrl, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  const host = new URL(serviceUrl).host;
  const out = { pagina: false, servico: false, saude: null, plataforma: "html", avisos: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let html = "";
    let csp = "";
    try {
      const res = await fetchImpl(siteUrl, { headers: { "user-agent": USER_AGENT, accept: "text/html", "cache-control": "no-cache" }, signal: controller.signal });
      html = res.ok ? await res.text() : "";
      csp = res.headers?.get?.("content-security-policy") || "";
      if (!res.ok) out.avisos.push(`A página respondeu ${res.status}.`);
    } catch {
      out.avisos.push("Não consegui abrir a página do site agora.");
    }
    if (!csp) csp = html.match(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    const p = detectPlatform(html);
    out.plataforma = p.principal;
    out.pagina = html.includes(`${host}/agente/widget.js`) || html.includes(`${host}\\/agente\\/`);
    if (!out.pagina && p.temGtm) out.avisos.push("O site usa Google Tag Manager: se você colou pelo GTM, a linha não aparece no HTML. Abra o site e veja se o botão do agente aparece.");
    else if (!out.pagina) out.avisos.push("A linha do agente ainda não aparece na página inicial. Se você acabou de colar, publique o site (ou espere o cache) e confira de novo.");
    const advice = cspAdvice(csp, `https://${host}`);
    if (advice) out.avisos.push(advice);
    try {
      const s = await fetchImpl(`${serviceUrl}/saude`, { headers: { accept: "application/json" }, signal: controller.signal });
      out.servico = s.ok;
      out.saude = s.ok ? await s.json().catch(() => null) : null;
    } catch {
      out.servico = false;
    }
    if (!out.servico) out.avisos.push("O serviço do agente não respondeu. Em conta nova da Cloudflare, o endereço pode levar alguns minutos para ativar.");
  } finally {
    clearTimeout(timer);
  }
  out.ok = out.pagina && out.servico && !out.avisos.some((a) => /Content-Security-Policy/.test(a));
  return out;
}

// ---------- prévia local ----------
const TYPES = { ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8" };
const HOP = /^(connection|keep-alive|transfer-encoding|content-encoding|content-length|content-security-policy(-report-only)?|x-frame-options|strict-transport-security|set-cookie|alt-svc|report-to|nel)$/i;

/**
 * Mostra o site publicado com o agente, num endereço local (só GET; formulários não são enviados).
 * agentDir: pasta do agente (widget.js, nucleo/, conhecimento/). ia(mensagem): opcional, responde
 * /api/ia com a chave do cofre (prévia com IA antes de publicar).
 */
export async function startPreview({ siteUrl, agentDir, ia, fetchImpl = fetch, port = 0 }) {
  const origin = new URL(siteUrl).origin;
  const root = normalize(agentDir);
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (url.pathname.startsWith("/__agente/")) {
        const file = normalize(join(root, decodeURIComponent(url.pathname.slice("/__agente/".length))));
        if (!file.startsWith(root + sep) || /servidor\.js$|faltas/.test(file)) {
          res.writeHead(404);
          return res.end();
        }
        const body = await readFile(file).catch(() => null);
        if (!body) {
          res.writeHead(404);
          return res.end();
        }
        res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
        return res.end(body);
      }
      if (url.pathname === "/api/ia" && req.method === "POST") {
        let raw = "";
        for await (const c of req) {
          raw += c;
          if (raw.length > 4000) break;
        }
        let r = {};
        try {
          const m = JSON.parse(raw || "{}").mensagem;
          r = (typeof m === "string" && ia ? await ia(m.slice(0, 500)) : null) || {};
        } catch {
          r = {};
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify(r));
      }
      if (req.method !== "GET" && req.method !== "HEAD") {
        res.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Na prévia, formulários não são enviados.");
      }
      // Só o próprio site: monta o endereço por texto e confere a origem (nada de "//outro-site").
      const destino = new URL(`${origin}/${url.pathname.replace(/^\/+/, "")}${url.search}`);
      if (destino.origin !== origin) {
        res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Endereço fora do site.");
      }
      const up = await fetchImpl(destino, { headers: { "user-agent": USER_AGENT, accept: req.headers.accept || "*/*" }, redirect: "follow" });
      const headers = {};
      up.headers.forEach((v, k) => {
        if (!HOP.test(k)) headers[k] = v;
      });
      const type = up.headers.get("content-type") || "";
      if (/text\/html/i.test(type)) {
        let html = await up.text();
        html = html.replace(/<meta[^>]+http-equiv=["']content-security-policy["'][^>]*>/gi, "");
        const tags = `<link rel="stylesheet" href="/__agente/widget.css"><script type="module" src="/__agente/widget.js"></script>`;
        html = /<\/body>(?![\s\S]*<\/body>)/i.test(html) ? html.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${tags}</body>`) : html + tags;
        res.writeHead(up.status, { ...headers, "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        return res.end(req.method === "HEAD" ? undefined : html);
      }
      res.writeHead(up.status, headers);
      return res.end(req.method === "HEAD" ? undefined : Buffer.from(await up.arrayBuffer()));
    } catch {
      res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
      res.end("Não consegui abrir esta página do site.");
    }
  });
  const bound = await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(port, "127.0.0.1", () => ok(server.address().port));
  });
  return {
    url: `http://127.0.0.1:${bound}/`,
    stop: () =>
      new Promise((ok) => {
        server.close(() => ok());
        server.closeAllConnections?.();
      }),
  };
}
