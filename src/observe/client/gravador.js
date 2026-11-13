// Gravador da observação (Agent Generator 0.3). Injetado pelo proxy local só durante o comando
// observar/treinar: registra páginas vistas, cliques e formulários enviados (rótulos dos campos,
// nunca o que foi digitado) e manda para o próprio proxy. Não roda no site publicado.
(function () {
  "use strict";
  if (window.__agenteGravador) return;
  window.__agenteGravador = true;
  var BASE = "/__agente-gerador/";
  var PERSONAL = /([\w.+-]+@[\w-]+\.[\w.]+|\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b|\(?\d{2}\)?\s?9?\d{4}-?\d{4}|\b(?:\d[ -]?){13,19}\b)/g;
  var clean = function (t, max) {
    return String(t || "").replace(/\s+/g, " ").replace(PERSONAL, "[oculto]").trim().slice(0, max || 160);
  };
  var send = function (evento) {
    evento.em = new Date().toISOString();
    try {
      fetch(BASE + "evento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(evento), keepalive: true });
    } catch {
      /* a gravação é opcional */
    }
  };
  var path = function () {
    return location.pathname + location.search;
  };
  var labelOf = function (field) {
    if (field.labels && field.labels[0]) return clean(field.labels[0].textContent, 60);
    return clean(field.getAttribute("aria-label") || field.getAttribute("placeholder") || field.name || field.type, 60);
  };
  var titleNear = function (el) {
    var box = el.closest("section, article, form, dialog, main") || document.body;
    var h = box.querySelector("h1, h2, h3, legend, [aria-label]");
    return clean((h && (h.textContent || h.getAttribute("aria-label"))) || document.title, 80);
  };

  // Versão 0.5: sites que guardam o login no navegador (JWT no localStorage). Manda só o NOME da
  // chave e do campo que parecem guardar um token, nunca o valor.
  var JWT = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;
  function tokenKeys() {
    var found = [];
    ["localStorage", "sessionStorage"].forEach(function (onde) {
      var store;
      try {
        store = window[onde];
      } catch {
        return;
      }
      for (var i = 0; store && i < store.length && i < 200; i++) {
        var chave = store.key(i);
        var v = String(store.getItem(chave) || "").replace(/^"|"$/g, "");
        if (JWT.test(v)) found.push({ onde: onde, chave: chave, campo: "" });
        else if (/^\{/.test(v)) {
          try {
            var obj = JSON.parse(v);
            ["token", "accessToken", "access_token", "jwt", "idToken"].forEach(function (campo) {
              if (obj && typeof obj[campo] === "string" && JWT.test(obj[campo])) found.push({ onde: onde, chave: chave, campo: campo });
            });
          } catch {
            /* não é JSON */
          }
        }
      }
    });
    if (found.length) send({ tipo: "armazenamento", chaves: found.slice(0, 5) });
  }

  function pageView() {
    tokenKeys();
    var main = document.querySelector("main") || document.body;
    var heads = Array.prototype.slice.call(document.querySelectorAll("h1, h2, h3"), 0, 14).map(function (h) {
      return clean(h.textContent, 80);
    });
    var meta = document.querySelector('meta[name="description"]');
    send({
      tipo: "pagina",
      url: path(),
      titulo: clean(document.title, 120),
      h1: clean((document.querySelector("h1") || {}).textContent, 120),
      descricao: clean(meta && meta.content, 300),
      cabecalhos: heads.filter(Boolean),
      texto: clean(main.innerText, 1500),
    });
  }
  var last = "";
  function maybeView() {
    if (path() === last) return;
    last = path();
    setTimeout(pageView, 500);
  }
  // Sites de página única (React, Vue...): a navegação passa pelo history.
  ["pushState", "replaceState"].forEach(function (name) {
    var original = history[name];
    history[name] = function () {
      var r = original.apply(this, arguments);
      maybeView();
      return r;
    };
  });
  addEventListener("popstate", maybeView);

  document.addEventListener(
    "click",
    function (e) {
      var el = e.target.closest && e.target.closest("a, button, [role=button], input[type=submit]");
      if (!el || el.closest("#agente-gravador, .agw-root, .agt-root")) return;
      var href = el.getAttribute && el.getAttribute("href");
      var same = href && !/^(https?:|mailto:|tel:|javascript:)/i.test(href) ? href : "";
      send({ tipo: "clique", pagina: path(), texto: clean(el.textContent || el.value || el.getAttribute("aria-label"), 60), href: same, area: titleNear(el) });
    },
    true,
  );
  document.addEventListener(
    "submit",
    function (e) {
      var form = e.target;
      if (!form || form.closest(".agw-root, .agt-root")) return;
      var fields = Array.prototype.slice.call(form.elements || [], 0, 30).filter(function (f) {
        return f.name && !/^(hidden|submit|button|reset)$/.test(f.type);
      });
      var seen = {};
      var campos = [];
      fields.forEach(function (f) {
        var key = f.type === "radio" || f.type === "checkbox" ? f.name : f.name + "|" + f.type;
        if (seen[key]) {
          if (f.type === "radio") seen[key].opcoes.push(labelOf(f));
          return;
        }
        var item = { rotulo: f.type === "radio" ? titleNear(f) : labelOf(f), nome: f.name, tipo: f.type || f.tagName.toLowerCase(), obrigatorio: Boolean(f.required) };
        if (f.tagName === "SELECT") item.opcoes = Array.prototype.slice.call(f.options, 0, 12).map(function (o) { return clean(o.textContent, 40); });
        if (f.type === "radio") item.opcoes = [labelOf(f)];
        seen[key] = item;
        campos.push(item);
      });
      var submitter = e.submitter || form.querySelector("[type=submit], button:not([type])");
      send({
        tipo: "formulario",
        pagina: path(),
        titulo: titleNear(form),
        botao: clean(submitter && (submitter.textContent || submitter.value), 60),
        metodo: (form.getAttribute("method") || "get").toLowerCase(),
        acao: (form.getAttribute("action") || "").replace(/^https?:\/\/[^/]+/, ""),
        campos: campos,
      });
    },
    true,
  );

  function badge() {
    if (document.getElementById("agente-gravador")) return;
    var box = document.createElement("div");
    box.id = "agente-gravador";
    box.setAttribute("role", "status");
    box.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483646;background:#111827;color:#fff;font:14px/1.3 system-ui,sans-serif;padding:8px 10px;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,.3);display:flex;gap:10px;align-items:center";
    var dot = document.createElement("span");
    dot.style.cssText = "width:10px;height:10px;border-radius:50%;background:#ef4444;display:inline-block";
    var text = document.createElement("span");
    text.textContent = window.AGENTE_TREINO ? "Agent Generator: modo treino" : "Agent Generator: observando o site";
    var done = document.createElement("button");
    done.type = "button";
    done.textContent = "Concluir";
    done.style.cssText = "background:#fff;color:#111827;border:0;border-radius:8px;padding:4px 10px;font:inherit;cursor:pointer";
    done.addEventListener("click", function () {
      fetch(BASE + "fim", { method: "POST" }).finally(function () {
        dot.style.background = "#22c55e";
        text.textContent = "Concluído. Pode fechar esta aba e voltar ao terminal.";
        done.remove();
      });
    });
    box.append(dot, text, done);
    document.body.appendChild(box);
  }
  function start() {
    badge();
    maybeView();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
