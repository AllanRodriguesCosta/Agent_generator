// Versão 0.9: instalador visual. Um servidor local (só 127.0.0.1) mostra as etapas da instalação
// numa janela (Edge/Chrome em modo aplicativo ou o navegador padrão), no lugar das perguntas no
// terminal. Depois de instalar, ele continua aberto para a etapa 2 (treino assistido, observação
// e editor da base).
// Proteção igual à do editor: código aleatório da sessão na URL e no cabeçalho, só o próprio
// endereço como Host e como origem de POST. Nenhum site aberto no navegador consegue usar a API.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const CLIENT = new URL("./client/", import.meta.url);
const ASSETS = { "/app.js": ["app.js", "text/javascript; charset=utf-8"], "/app.css": ["app.css", "text/css; charset=utf-8"] };
const MAX_BODY = 200_000;

async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw Object.assign(new Error("Pedido grande demais."), { status: 413 });
  }
  return JSON.parse(raw || "{}");
}
const send = (res, status, data, type = "application/json; charset=utf-8") => {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'",
  });
  res.end(typeof data === "string" ? data : JSON.stringify(data));
};
const busy = () => Object.assign(new Error("Espere a tarefa atual terminar."), { status: 409 });
const publicSite = (s) => s && { url: s.url, origem: s.origem };

/**
 * ops (do CLI): abrir(pasta) -> { ctx, info }; analisar(ctx, log, { setor }); instalar(ctx, escolhas, log);
 * testar(ctx, mensagem, contexto); abrirSite(ctx) -> { url, stop }; sessao(ctx, modo, opcoes, io) -> resultado;
 * editor(ctx) -> { url, stop }; acerto(ctx) -> número; planoDesinstalar(ctx); desinstalar(ctx, { apagarTrabalho }, log).
 * Opções: pasta (inicial), port, listen(server, port), vivoMs (sem sinal da janela por esse tempo
 * e sem treino aberto -> encerra), onFim(motivo), versao.
 */
export async function startInstaller({ ops, pasta = "", port = 4730, listen, vivoMs = 0, onFim = () => {}, versao = "" }) {
  const token = randomBytes(16).toString("hex");
  let bound = port;
  const allowedHost = () => [`127.0.0.1:${bound}`, `localhost:${bound}`];
  const state = { ctx: null, info: null, analise: null, instalacao: null, job: null, sessao: null, editor: null, site: null, ultimoSinal: Date.now() };
  const running = () => state.job?.status === "rodando" || state.sessao?.status === "rodando";

  // Tarefa longa (analisar, instalar): a janela acompanha pelo /api/tarefa.
  function startJob(tipo, fn) {
    if (running()) throw busy();
    const job = { id: randomBytes(6).toString("hex"), tipo, status: "rodando", passos: [], pct: 0, resultado: null, erro: null };
    const log = (texto, pct) => {
      job.passos.push({ texto: String(texto).slice(0, 300), em: Date.now() });
      if (Number.isFinite(pct)) job.pct = Math.max(job.pct, Math.min(100, pct));
    };
    state.job = job;
    job.feito = Promise.resolve()
      .then(() => fn(log))
      .then(
        (r) => Object.assign(job, { status: "ok", pct: 100, resultado: r }),
        (e) => Object.assign(job, { status: "erro", erro: e.message }),
      );
    return job;
  }
  const jobView = (j) => j && { id: j.id, tipo: j.tipo, status: j.status, passos: j.passos.slice(-40), pct: j.pct, resultado: j.status === "ok" ? j.resultado : null, erro: j.erro };

  // Etapa 2: treino ou observação. Termina pelo botão da janela, pelo "Concluir" no site ou pelo tempo.
  function startSessao(modo, opcoes) {
    if (running()) throw busy();
    let stop;
    const stopped = new Promise((ok) => (stop = ok));
    const s = { modo, status: "rodando", log: [], url: null, resultado: null, erro: null, inicio: Date.now(), stop };
    const io = {
      print(texto) {
        const t = String(texto).trim();
        if (!t) return;
        s.log.push(t.slice(0, 300));
        const m = t.match(/Abra (http:\/\/\S+?)\s/);
        if (m && !s.url) s.url = m[1];
      },
      // Sem terminal: decide pelo que foi marcado na janela.
      ask: async (pergunta) => (/npm run/.test(pergunta) ? Boolean(opcoes.permitirNpm) : /rodando em/.test(pergunta)),
      question: null,
      waitEnter: (signal) =>
        new Promise((ok, fail) => {
          stopped.then(ok);
          signal?.addEventListener("abort", () => fail(new Error("fim")));
        }),
      pause: async () => {},
    };
    state.sessao = s;
    s.feito = Promise.resolve()
      .then(() => ops.sessao(state.ctx, modo, opcoes, io))
      .then(
        (r) => Object.assign(s, { status: "ok", resultado: r }),
        (e) => Object.assign(s, { status: "erro", erro: e.message }),
      );
    return s;
  }
  const sessaoView = (s) => s && { modo: s.modo, status: s.status, url: s.url, log: s.log.slice(-60), resultado: s.status === "ok" ? s.resultado : null, erro: s.erro, inicio: s.inicio };

  const needCtx = () => {
    if (!state.ctx) throw Object.assign(new Error("Escolha a pasta do projeto primeiro."), { status: 400 });
    return state.ctx;
  };

  const routes = {
    "GET /api/estado": async () => ({
      versao,
      pasta: state.info?.pasta || pasta,
      info: state.info,
      analise: state.analise,
      instalacao: state.instalacao,
      tarefa: jobView(state.job),
      sessao: sessaoView(state.sessao),
      editor: state.editor ? { url: state.editor.url } : null,
      site: publicSite(state.site),
      acerto: state.ctx && state.instalacao ? await Promise.resolve(ops.acerto(state.ctx)).catch(() => null) : null,
    }),
    "POST /api/vivo": async () => ({ ok: true }),
    "POST /api/pasta": async (d) => {
      if (running()) throw busy();
      const { ctx, info } = await ops.abrir(String(d.pasta || "").trim());
      state.site?.stop?.();
      Object.assign(state, { ctx, info, analise: null, instalacao: null, job: null, sessao: null, site: null });
      return { info };
    },
    "POST /api/analisar": async (d) => {
      const ctx = needCtx();
      const setor = typeof d.setor === "string" ? d.setor : undefined;
      return { tarefa: jobView(startJob("analisar", async (log) => (state.analise = await ops.analisar(ctx, log, { setor })))) };
    },
    "POST /api/instalar": async (d) => {
      const ctx = needCtx();
      if (!state.analise) throw Object.assign(new Error("Faça o raio X antes de instalar."), { status: 400 });
      return { tarefa: jobView(startJob("instalar", async (log) => (state.instalacao = await ops.instalar(ctx, d || {}, log)))) };
    },
    // Versão 0.9: desinstalar o agente encontrado na pasta.
    "GET /api/desinstalar": async () => ops.planoDesinstalar(needCtx()),
    "POST /api/desinstalar": async (d) => {
      const ctx = needCtx();
      if (running()) throw busy();
      state.site?.stop?.();
      state.site = null;
      await Promise.resolve(state.editor?.stop?.()).catch(() => {});
      state.editor = null;
      const job = startJob("desinstalar", async (log) => {
        const r = await ops.desinstalar(ctx, { apagarTrabalho: d.apagarTrabalho === true }, log);
        // A pasta volta a ser "sem agente": recarrega o contexto e esquece o raio X/instalação.
        const again = await ops.abrir(ctx.project || state.info?.pasta);
        Object.assign(state, { ctx: again.ctx, info: again.info, analise: null, instalacao: null });
        return r;
      });
      return { tarefa: jobView(job) };
    },
    "GET /api/tarefa": async () => ({ tarefa: jobView(state.job) }),
    "POST /api/testar": async (d) => ops.testar(needCtx(), String(d.mensagem || "").slice(0, 500), d.contexto && typeof d.contexto === "object" ? d.contexto : {}),
    "POST /api/site": async () => {
      state.site = state.site || (await ops.abrirSite(needCtx()));
      return publicSite(state.site);
    },
    "POST /api/sessao/iniciar": async (d) => {
      needCtx();
      const modo = d.modo === "observar" ? "observar" : "treinar";
      const opcoes = {
        url: typeof d.url === "string" ? d.url.trim().slice(0, 200) : "",
        permitirNpm: d.permitirNpm === true,
        minutos: Math.min(120, Math.max(1, Number(d.minutos) || (modo === "treinar" ? 30 : 5))),
      };
      return { sessao: sessaoView(startSessao(modo, opcoes)) };
    },
    "POST /api/sessao/parar": async () => {
      state.sessao?.stop();
      return { ok: true };
    },
    "GET /api/sessao": async () => ({ sessao: sessaoView(state.sessao) }),
    "POST /api/editor": async () => {
      state.editor = state.editor || (await ops.editor(needCtx()));
      return { url: state.editor.url };
    },
    "POST /api/sair": async () => {
      setTimeout(() => fechar("botão Fechar"), 150);
      return { ok: true };
    },
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${bound}`);
      if (!allowedHost().includes(req.headers.host || "")) return send(res, 421, { erro: "Endereço não permitido." });
      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
        if (url.searchParams.get("t") !== token) return send(res, 403, "Abra o instalador pelo executável (o endereço tem o código da sessão).", "text/plain; charset=utf-8");
        return send(res, 200, await readFile(new URL("index.html", CLIENT), "utf8"), "text/html; charset=utf-8");
      }
      if (req.method === "GET" && ASSETS[url.pathname]) {
        const [file, type] = ASSETS[url.pathname];
        return send(res, 200, await readFile(new URL(file, CLIENT), "utf8"), type);
      }
      if (!url.pathname.startsWith("/api/")) return send(res, 404, { erro: "Não encontrado." });
      if (req.headers["x-instalador"] !== token) return send(res, 403, { erro: "Sessão inválida. Abra o instalador de novo." });
      const origin = req.headers.origin;
      if (req.method === "POST" && origin && !allowedHost().map((h) => `http://${h}`).includes(origin)) return send(res, 403, { erro: "Origem não permitida." });
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) return send(res, 404, { erro: "Não encontrado." });
      state.ultimoSinal = Date.now();
      return send(res, 200, await route(req.method === "POST" ? await body(req) : {}));
    } catch (error) {
      return send(res, error.status || 400, { erro: error instanceof SyntaxError ? "JSON inválido." : error.message });
    }
  });

  bound = listen ? await listen(server, port) : await new Promise((ok) => server.listen(port, "127.0.0.1", () => ok(server.address().port)));

  // Janela fechada: sem sinal por vivoMs e sem treino aberto -> encerra sozinho.
  const timer = vivoMs
    ? setInterval(() => {
        if (state.sessao?.status === "rodando" || state.job?.status === "rodando") return;
        if (Date.now() - state.ultimoSinal > vivoMs) fechar("janela fechada");
      }, Math.min(10_000, vivoMs))
    : null;

  let closed = false;
  async function fechar(motivo) {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    if (state.sessao?.status === "rodando") {
      state.sessao.stop();
      await state.sessao.feito;
    }
    await Promise.resolve(state.editor?.stop?.()).catch(() => {});
    state.site?.stop?.();
    await new Promise((ok) => {
      server.close(() => ok());
      server.closeAllConnections?.();
    });
    onFim(motivo);
  }

  if (pasta) {
    try {
      Object.assign(state, await ops.abrir(pasta));
    } catch {
      /* a pessoa escolhe a pasta na primeira etapa */
    }
  }
  return { url: `http://127.0.0.1:${bound}/?t=${token}`, token, port: bound, stop: () => fechar("stop"), state };
}
