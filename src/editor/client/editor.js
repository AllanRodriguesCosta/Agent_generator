// Editor visual da base (Agent Generator 0.4). Só textContent e value: nenhum texto da base vira
// HTML. O código da sessão vem da URL e vai em todo pedido à API local.
(function () {
  "use strict";
  var TOKEN = new URLSearchParams(location.search).get("t") || "";
  var base = null;
  var tab = "faq";
  var contexto = {};
  var dirty = false;
  var $ = function (s) {
    return document.querySelector(s);
  };
  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    });
    if (text != null) n.textContent = text;
    return n;
  }
  function api(path, data) {
    return fetch("/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: { "content-type": "application/json", "x-editor-token": TOKEN },
      body: data === undefined ? undefined : JSON.stringify(data),
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.erro || "Falhou.");
        return j;
      });
    });
  }
  function status(text) {
    $("#status").textContent = text;
  }
  function changed() {
    dirty = true;
    status("Alterações não salvas.");
  }
  var uid = 0;
  // Campo ligado a obj[key]; lista = linhas separadas por quebra (exemplos, gatilhos).
  function field(obj, key, label, opts) {
    opts = opts || {};
    var id = "f" + ++uid;
    var wrap = el("div");
    wrap.append(el("label", { for: id }, label));
    var input = opts.area ? el("textarea", { id: id, rows: opts.rows || 3 }) : el("input", { id: id, type: opts.type || "text" });
    var v = obj[key];
    input.value = opts.lista ? (v || []).join("\n") : v == null ? "" : String(v);
    if (opts.lista) input.setAttribute("aria-describedby", id + "-d");
    input.addEventListener("input", function () {
      obj[key] = opts.lista ? input.value.split("\n").map(function (s) { return s.trim(); }).filter(Boolean) : opts.type === "number" ? Number(input.value) : input.value;
      changed();
    });
    wrap.append(input);
    if (opts.lista) wrap.append(el("small", { id: id + "-d", class: "vazio" }, "Uma por linha."));
    return wrap;
  }
  function card(title, onRemove) {
    var c = el("article", { class: "cartao" });
    var h = el("header");
    h.append(el("strong", {}, title || "(sem título)"));
    if (onRemove) {
      var rm = el("button", { type: "button", class: "perigo" }, "Remover");
      rm.addEventListener("click", function () {
        if (!window.confirm("Remover este item?")) return;
        onRemove();
        changed();
        render();
      });
      h.append(rm);
    }
    c.append(h);
    return c;
  }
  var slug = function (s) {
    return String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  };
  var TABS = {
    faq: {
      nome: "Perguntas frequentes",
      render: function (p) {
        var add = el("button", { type: "button" }, "+ Nova pergunta");
        add.addEventListener("click", function () {
          base.faq.unshift({ id: "nova-" + Date.now(), pergunta: "", resposta: "", termos: "", link: "" });
          changed();
          render();
        });
        p.append(add);
        if (!base.faq.length) p.append(el("p", { class: "vazio" }, "Nenhuma pergunta ainda."));
        base.faq.forEach(function (f, i) {
          var c = card(f.pergunta, function () { base.faq.splice(i, 1); });
          c.append(field(f, "pergunta", "Pergunta"), field(f, "resposta", "Resposta", { area: true }), field(f, "termos", "Outras palavras que levam a esta resposta"), field(f, "link", "Link (opcional)"));
          p.append(c);
        });
      },
    },
    intencoes: {
      nome: "Intenções",
      render: function (p) {
        var add = el("button", { type: "button" }, "+ Nova intenção");
        add.addEventListener("click", function () {
          var nome = window.prompt("Nome da intenção (ex.: horario):");
          var key = slug(nome).replace(/-/g, "_");
          if (!key || base.intencoes[key]) return;
          base.intencoes[key] = { exemplos: [], respostas: [""], acoes: [], sugestoes: [] };
          changed();
          render();
        });
        p.append(add);
        Object.keys(base.intencoes).forEach(function (k) {
          var it = base.intencoes[k];
          var c = card(k, function () { delete base.intencoes[k]; });
          c.append(field(it, "exemplos", "Frases de exemplo", { area: true, lista: true, rows: 4 }), field(it, "respostas", "Respostas (o agente alterna entre elas)", { area: true, lista: true }), field(it, "sugestoes", "Botões de sugestão", { area: true, lista: true, rows: 2 }));
          p.append(c);
        });
      },
    },
    paginas: {
      nome: "Páginas",
      render: function (p) {
        var add = el("button", { type: "button" }, "+ Nova página");
        add.addEventListener("click", function () {
          base.paginas.unshift({ id: "pagina-" + Date.now(), titulo: "", href: "/", descricao: "", termos: "" });
          changed();
          render();
        });
        p.append(add);
        base.paginas.forEach(function (pg, i) {
          var c = card(pg.titulo, function () { base.paginas.splice(i, 1); });
          c.append(field(pg, "titulo", "Título"), field(pg, "href", "Endereço"), field(pg, "descricao", "Descrição", { area: true, rows: 2 }), field(pg, "termos", "Palavras que levam a esta página"));
          p.append(c);
        });
      },
    },
    fluxos: {
      nome: "Conversas em etapas",
      render: function (p) {
        var add = el("button", { type: "button" }, "+ Nova conversa");
        add.addEventListener("click", function () {
          base.fluxos.unshift({ id: "fluxo-" + Date.now(), gatilhos: [], pergunta: "", opcoes: [{ rotulo: "", resposta: "" }, { rotulo: "", resposta: "" }] });
          changed();
          render();
        });
        p.append(add);
        base.fluxos.forEach(function (f, i) {
          var c = card(f.pergunta, function () { base.fluxos.splice(i, 1); });
          c.append(field(f, "gatilhos", "Frases que abrem a conversa (pelo menos 2)", { area: true, lista: true }), field(f, "pergunta", "Pergunta do agente"));
          f.opcoes.forEach(function (o, j) {
            var row = el("div", { class: "linha" });
            row.append(field(o, "rotulo", "Opção " + (j + 1)), field(o, "resposta", "Resposta"));
            var rm = el("button", { type: "button", class: "perigo", "aria-label": "Remover opção " + (j + 1) }, "×");
            rm.addEventListener("click", function () {
              f.opcoes.splice(j, 1);
              changed();
              render();
            });
            row.append(rm);
            c.append(row);
          });
          var more = el("button", { type: "button", style: "margin-top:6px" }, "+ Opção");
          more.addEventListener("click", function () {
            f.opcoes.push({ rotulo: "", resposta: "" });
            changed();
            render();
          });
          c.append(more);
          p.append(c);
        });
      },
    },
    agente: {
      nome: "Agente",
      render: function (p) {
        var c = card(base.agente.nome);
        c.append(field(base.agente, "nome", "Nome"), field(base.agente, "site", "Nome do site"), field(base.agente, "saudacao", "Saudação", { area: true, rows: 2 }), field(base.agente, "naoEntendi", "Quando não entende", { area: true, rows: 2 }), field(base.agente, "sugestoes", "Sugestões iniciais", { area: true, lista: true, rows: 3 }), field(base.agente, "cor", "Cor (#rrggbb)"), field(base.agente, "registro", "Registro das frases não entendidas (ex.: /api/agente)"));
        p.append(c);
      },
    },
  };
  function render() {
    var nav = $("#abas");
    nav.replaceChildren();
    Object.keys(TABS).forEach(function (k) {
      var b = el("button", { type: "button", role: "tab", id: "tab-" + k, "aria-selected": String(k === tab), "aria-controls": "painel" }, TABS[k].nome);
      b.addEventListener("click", function () {
        tab = k;
        render();
      });
      nav.append(b);
    });
    var p = $("#painel");
    p.setAttribute("aria-labelledby", "tab-" + tab);
    p.replaceChildren();
    TABS[tab].render(p);
  }
  function showEval(a) {
    $("#acerto").textContent = a.geral == null ? "-" : a.geral + "%";
    var box = $("#erros");
    box.replaceChildren();
    if ((a.erros || []).length) box.append(el("p", {}, "Frases para revisar (o agente errou no teste automático):"));
    (a.erros || []).forEach(function (e) {
      box.append(el("p", { class: "vazio" }, "“" + e.frase + "”: esperava " + e.esperado + ", veio " + e.obtido));
    });
    (a.problemas || []).slice(0, 5).forEach(function (pr) {
      box.append(el("p", { class: "vazio" }, "Aviso: " + pr));
    });
  }
  function say(who, text, extra) {
    var m = el("p", { class: "msg " + who }, text);
    if (extra) m.append(el("small", {}, extra));
    $("#conversa").append(m);
    $("#conversa").scrollTop = 1e9;
  }
  $("#perguntar").addEventListener("submit", function (e) {
    e.preventDefault();
    var frase = $("#frase").value.trim();
    if (!frase) return;
    say("voce", frase);
    $("#frase").value = "";
    api("testar", { base: base, mensagem: frase, contexto: contexto })
      .then(function (r) {
        contexto = r.contexto || {};
        var itens = (r.itens || []).map(function (i) { return "• " + i.nome + (i.precoTexto ? " — " + i.precoTexto : ""); }).join("\n");
        say("bot", r.texto + (itens ? "\n" + itens : ""), "intenção: " + r.intencao + (r.fonte ? " (" + r.fonte + ")" : "") + " · confiança " + r.confianca);
      })
      .catch(function (err) {
        say("bot", "Erro: " + err.message);
      });
  });
  $("#avaliar").addEventListener("click", function () {
    status("Avaliando…");
    api("avaliar", { base: base }).then(function (a) {
      showEval(a);
      status(dirty ? "Avaliado (rascunho não salvo)." : "Avaliado.");
    }).catch(function (err) { status(err.message); });
  });
  // Itens novos ganham um id legível a partir do texto (ex.: "voces-abrem-no-feriado").
  function fixIds() {
    [["faq", "pergunta", /^nova-\d+$/], ["paginas", "titulo", /^pagina-\d+$/], ["fluxos", "pergunta", /^fluxo-\d+$/]].forEach(function (spec) {
      var list = base[spec[0]];
      list.forEach(function (item) {
        if (!spec[2].test(item.id) || !slug(item[spec[1]])) return;
        var id = slug(item[spec[1]]);
        for (var n = 2; list.some(function (o) { return o !== item && o.id === id; }); n++) id = slug(item[spec[1]]) + "-" + n;
        item.id = id;
      });
    });
  }
  $("#salvar").addEventListener("click", function () {
    fixIds();
    status("Salvando…");
    api("salvar", { base: base }).then(function (r) {
      dirty = false;
      showEval({ geral: r.avaliacao.geral, erros: r.avaliacao.erros, problemas: r.problemas });
      status("Salvo" + (r.backup ? " (a versão anterior ficou no backup)." : "."));
    }).catch(function (err) { status(err.message); });
  });
  addEventListener("beforeunload", function (e) {
    if (dirty) e.preventDefault();
  });
  api("base").then(function (r) {
    base = r.base;
    showEval(r.avaliacao);
    render();
    status("Base carregada.");
  }).catch(function (err) {
    status(err.message);
  });
})();
