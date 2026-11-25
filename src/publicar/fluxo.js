// Versão 0.11/0.12: o que o instalador (janela) e o CLI fazem com a chave da IA e com o serviço do
// agente: conectar, guardar no cofre, publicar, atualizar, verificar e remover. Sem interface aqui.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { readVault, updateVault, vaultView, forget, cofreFile } from "../ia/cofre.js";
import { testKey, iaEnv, PROVEDORES } from "../ia/provedores.js";
import { connectOpenRouter } from "../ia/openrouter.js";
import { connectCloudflare, publishService, removeService, readServiceMisses, tokenTemplateUrl, SIGNUP_URL, agentAssets } from "./cloudflare.js";
import { embedTags, loaderScript, platformGuides, wordpressPlugin, detectPlatform } from "./site.js";
import { iaConfig, interpret } from "../agent/ia.js";

export const LINKS = {
  gemini: PROVEDORES.gemini.paginaChave,
  openrouter: PROVEDORES.openrouter.paginaChave,
  cloudflareToken: tokenTemplateUrl(),
  cloudflareCadastro: SIGNUP_URL,
};

/** Testa a chave e guarda no cofre. Erro com a mensagem amigável se a chave não servir. */
export async function saveIaKey(cfg, { fetchImpl, file = cofreFile() } = {}) {
  const r = await testKey(cfg, { fetchImpl });
  if (!r.ok) throw new Error(r.mensagem);
  const v = await updateVault((c) => {
    c.ia = { provedor: r.provedor, chave: r.chave, baseUrl: r.baseUrl || "", modelo: r.modelo, gratis: Boolean(r.gratis), conectadoEm: new Date().toISOString() };
  }, file);
  return { mensagem: r.mensagem, cofre: vaultView(v) };
}

/**
 * OpenRouter em 1 clique: abre o login e, quando a pessoa autorizar, testa e guarda a chave.
 * Devolve { url, pronto } (pronto: Promise com { mensagem, cofre }).
 */
export async function startOpenRouter({ abrir, fetchImpl, file = cofreFile(), tempoMs } = {}) {
  const c = await connectOpenRouter({ abrir, fetchImpl, tempoMs });
  const pronto = c.chave.then((chave) => saveIaKey({ provedor: "openrouter", chave }, { fetchImpl, file }));
  pronto.catch(() => {});
  return { url: c.url, pronto, cancelar: c.cancelar };
}

export async function saveCloudflare(token, { fetchImpl, file = cofreFile() } = {}) {
  const c = await connectCloudflare(token, { fetchImpl });
  const v = await updateVault((x) => {
    x.cloudflare = { token: c.token, contaId: c.contaId, conta: c.conta, subdominio: c.subdominio };
  }, file);
  return { conta: c.conta, subdominio: c.subdominio, contas: c.contas, cofre: vaultView(v) };
}

export const forgetVault = (qual, file = cofreFile()) => forget(qual, file).then((v) => vaultView(v));
export const vaultState = async (file = cofreFile()) => vaultView(await readVault(file));

/** Configuração do núcleo (iaConfig) com a chave do cofre: conversa de teste, prévia e melhoria da base. */
export async function localIa(file = cofreFile()) {
  const v = await readVault(file);
  return v.ia?.provedor ? { ia: v.ia, config: iaConfig(iaEnv(v.ia)) } : { ia: null, config: null };
}

/** Responde como o serviço responderia (/api/ia), mas aqui no computador. */
export function iaResponder(config, knowledge, { fetchImpl } = {}) {
  if (!config) return null;
  return (mensagem) => interpret(mensagem, knowledge, config, { fetchImpl });
}

const origemDe = (u) => {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).origin;
  } catch {
    return "";
  }
};
// O mesmo site com e sem "www." (muitos sites respondem pelos dois).
const variantes = (u) => {
  const o = origemDe(u);
  if (!o) return [];
  const url = new URL(o);
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname) || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) return [o];
  const outro = url.hostname.startsWith("www.") ? url.hostname.slice(4) : `www.${url.hostname}`;
  return [o, `${url.protocol}//${outro}${url.port ? `:${url.port}` : ""}`];
};

/**
 * Publica o serviço do agente para um site.
 * modo "ia": só a IA (o agente continua no site). modo "completo": widget + base no serviço.
 * siteKey: pasta do projeto ou origem do site (identifica o serviço no cofre).
 */
export async function publishFor({ siteKey, site, origens = [], locais = false, semIa = false, knowledge, agentDir, modo = "ia", versao = "", nome, log = () => {}, fetchImpl, file = cofreFile(), healthTries, healthWaitMs }) {
  const v = await readVault(file);
  if (!v.cloudflare?.token) throw new Error("Conecte a Cloudflare antes de publicar (botão Criar chave de publicação).");
  const anterior = v.servicos?.[siteKey];
  const assets = modo === "completo" ? await agentAssets(agentDir) : null;
  // semIa: a pessoa escolheu "Sem IA" (o serviço não recebe a chave, mesmo que o cofre tenha uma).
  const ia = !semIa && v.ia?.provedor ? { provedor: v.ia.provedor, modelo: v.ia.modelo, baseUrl: v.ia.baseUrl } : null;
  const r = await publishService(
    {
      token: v.cloudflare.token,
      contaId: v.cloudflare.contaId,
      conta: v.cloudflare.conta,
      subdominio: v.cloudflare.subdominio,
      nome: nome || anterior?.nome,
      site: origemDe(site) || site || "",
      origens: [...new Set(origens.flatMap(variantes).filter(Boolean))],
      locais,
      knowledge,
      assets,
      ia,
      chave: ia ? v.ia.chave : "",
      versao,
    },
    { fetchImpl, log, healthTries, healthWaitMs },
  );
  await updateVault((x) => {
    x.cloudflare = { ...x.cloudflare, subdominio: r.subdominio };
    x.servicos = { ...(x.servicos || {}), [siteKey]: { nome: r.nome, url: r.url, contaId: v.cloudflare.contaId, kvId: r.kvId, modo: r.modo, site: origemDe(site) || "", publicadoEm: new Date().toISOString(), ia: ia?.provedor || "nenhuma" } };
  }, file);
  return { ...r, contaId: v.cloudflare.contaId };
}

/** servico: o que ficou salvo na publicação ({ nome, contaId, kvId }); sem ele, procura no cofre. */
export async function removeFor(siteKey, { servico, fetchImpl, file = cofreFile() } = {}) {
  const v = await readVault(file);
  const s = servico?.nome ? servico : v.servicos?.[siteKey];
  if (!s) return false;
  if (!v.cloudflare?.token) throw new Error("A chave de publicação da Cloudflare não está mais no cofre. Apague o serviço no painel da Cloudflare (Workers & Pages).");
  await removeService({ token: v.cloudflare.token, contaId: s.contaId || v.cloudflare.contaId, nome: s.nome, kvId: s.kvId }, { fetchImpl });
  await updateVault((x) => {
    delete x.servicos?.[siteKey];
  }, file);
  return true;
}

export async function serviceFor(siteKey, file = cofreFile()) {
  return (await readVault(file)).servicos?.[siteKey] || null;
}

/** Frases que o serviço guardou (o agente do navegador não entendeu). */
export async function missesFor(siteKey, { servico, fetchImpl, file = cofreFile() } = {}) {
  const v = await readVault(file);
  const s = servico?.kvId ? servico : v.servicos?.[siteKey];
  if (!s?.kvId || !v.cloudflare?.token) return [];
  return readServiceMisses({ token: v.cloudflare.token, contaId: s.contaId || v.cloudflare.contaId, kvId: s.kvId }, { fetchImpl });
}

/**
 * Tudo o que a pessoa precisa para colocar o agente no site publicado: as linhas, o carregador (GTM),
 * o guia por plataforma (a detectada primeiro) e o plugin WordPress gravado em work/.
 */
export async function placementKit({ serviceUrl, site, nome, work, homeHtml = "" }) {
  const base = `${serviceUrl.replace(/\/+$/, "")}/agente/`;
  const plataforma = detectPlatform(homeHtml);
  const guias = platformGuides();
  const ordem = [plataforma.principal, ...(plataforma.temGtm ? ["gtm"] : [])];
  guias.sort((a, b) => (ordem.includes(b.id) ? 1 : 0) - (ordem.includes(a.id) ? 1 : 0));
  await mkdir(work, { recursive: true });
  const zip = join(work, "agente-wordpress.zip");
  await writeFile(zip, wordpressPlugin({ base, site, nome }));
  const tags = embedTags(base);
  const loader = loaderScript(base);
  await writeFile(
    join(work, "COMO-COLOCAR-NO-SITE.txt"),
    [
      `Agente de ${site || "seu site"} — serviço em ${serviceUrl}`,
      "",
      "Cole antes de </body> (ou no campo de código do rodapé da sua plataforma):",
      tags,
      "",
      "Google Tag Manager (HTML personalizado) ou construtor que só aceita script comum:",
      loader,
      "",
      ...guias.flatMap((g) => [`${g.nome}:`, ...g.passos.map((p) => `  - ${p}`), ""]),
      "WordPress: o plugin pronto está em agente-wordpress.zip (Plugins > Adicionar novo > Enviar plugin).",
      "",
    ].join("\n"),
  );
  return { base, tags, loader, guias, plataforma: plataforma.principal, temGtm: plataforma.temGtm, wordpressZip: zip };
}

export async function readHome(dir) {
  return readFile(join(dir, "index.html"), "utf8").catch(() => "");
}
