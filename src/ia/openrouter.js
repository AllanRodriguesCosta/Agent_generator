// Versão 0.11: "Entrar com OpenRouter" em 1 clique, do jeito que o Git abre o navegador para logar.
// O instalador sobe um endereço de retorno só no próprio computador (127.0.0.1, porta livre), abre
// o login do OpenRouter e espera. A pessoa autoriza, o OpenRouter devolve um código para esse
// endereço e o instalador troca o código pela chave (PKCE: o código sozinho não vale nada).
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { pkcePair, openRouterAuthUrl, exchangeOpenRouterCode } from "./provedores.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const page = (titulo, texto) =>
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(titulo)}</title><body style="font:16px/1.5 system-ui,sans-serif;margin:48px auto;max-width:560px;padding:0 20px;color:#1c1530"><h1 style="color:#6d28d9;font-size:24px">${esc(titulo)}</h1><p>${esc(texto)}</p></body></html>`;

/**
 * Começa a conexão. Devolve { url, chave, cancelar }: url é a página de login (abra no navegador),
 * chave é uma Promise com a chave (sk-or-...) ou erro (cancelado, tempo esgotado, código recusado).
 * abrir(url) é chamado logo (ex.: openBrowser). fetchImpl troca o fetch (testes).
 */
export async function connectOpenRouter({ abrir = () => {}, fetchImpl = fetch, tempoMs = 5 * 60000, label = "Agent Generator" } = {}) {
  const { verifier, challenge } = pkcePair();
  const state = randomBytes(16).toString("hex");
  let resolver;
  let rejeitar;
  const chave = new Promise((ok, fail) => {
    resolver = ok;
    rejeitar = fail;
  });
  chave.catch(() => {}); // quem chamou decide se espera; sem isso, cancelar() viraria erro solto
  let fim = false;
  let timer = null;
  const server = createServer(async (req, res) => {
    const u = new URL(req.url, "http://127.0.0.1");
    const send = (status, titulo, texto) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-frame-options": "DENY" });
      res.end(page(titulo, texto));
    };
    if (u.pathname !== "/openrouter/retorno") return send(404, "Não encontrado", "Este endereço só recebe o retorno do OpenRouter.");
    if (fim) return send(410, "Conexão já concluída", "Pode fechar esta aba e voltar ao instalador.");
    const code = u.searchParams.get("code");
    // Sem código: a pessoa negou o acesso (o OpenRouter não devolve o state nesse caso).
    if (!code) {
      terminar(new Error("A conexão com o OpenRouter foi cancelada. Clique em Entrar com OpenRouter para tentar de novo."));
      return send(400, "Conexão cancelada", "Nada foi alterado. Volte ao instalador para tentar de novo.");
    }
    // Código de outra tentativa (ou de outro site): ignora e continua esperando o certo.
    if (u.searchParams.get("state") !== state) return send(400, "Retorno não reconhecido", "Abra a conexão de novo pelo instalador.");
    try {
      const key = await exchangeOpenRouterCode({ code, verifier, fetchImpl });
      terminar(null, key);
      send(200, "Pronto! OpenRouter conectado", "A chave já está no instalador. Pode fechar esta aba e voltar para a janela do Agent Generator.");
    } catch (error) {
      terminar(error);
      send(502, "Não deu certo", error.message);
    }
  });
  function terminar(error, key) {
    if (fim) return;
    fim = true;
    clearTimeout(timer);
    // Fecha depois de responder a página de retorno.
    setTimeout(() => {
      server.close();
      server.closeAllConnections?.();
    }, 50).unref?.();
    if (error) rejeitar(error);
    else resolver(key);
  }
  const port = await new Promise((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => ok(server.address().port));
  });
  const callback = `http://127.0.0.1:${port}/openrouter/retorno`;
  const url = openRouterAuthUrl({ callback, challenge, state, label });
  timer = setTimeout(() => terminar(new Error("O tempo para entrar no OpenRouter acabou (5 minutos). Clique em Entrar com OpenRouter de novo.")), tempoMs);
  timer.unref?.();
  abrir(url);
  return { url, callback, chave, cancelar: () => terminar(new Error("Conexão cancelada.")) };
}
