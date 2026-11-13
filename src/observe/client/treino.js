// Modo treino (Agent Generator 0.3). Injetado pelo comando treinar: embaixo de cada resposta do
// agente aparecem "Certo" e "Corrigir". A correção é salva na base pelo próprio terminal e o
// widget recarrega a base na hora. Não roda no site publicado. Só textContent (sem innerHTML).
(function () {
  "use strict";
  window.AGENTE_TREINO = true;
  var BASE = "/__agente-gerador/treino/";
  var base = null;
  var post = function (name, body) {
    return fetch(BASE + name, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.erro || "Não foi possível salvar.");
        return data;
      });
    });
  };
  var loadBase = function () {
    return fetch(BASE + "base", { cache: "no-store" })
      .then(function (r) {
        return r.json();
      })
      .then(function (b) {
        base = b;
        return b;
      });
  };
  function el(tag, text, css) {
    var n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (css) n.style.cssText = css;
    return n;
  }
  var BTN = "border:1px solid #6d28d9;background:#fff;color:#6d28d9;border-radius:8px;padding:3px 9px;font:12px system-ui,sans-serif;cursor:pointer;margin-right:6px";
  var BOX = "margin:6px 0 10px;padding:8px;border:1px dashed #6d28d9;border-radius:10px;background:#faf5ff;font:13px/1.35 system-ui,sans-serif;color:#1f2937";
  var FIELD = "display:block;width:100%;box-sizing:border-box;margin:4px 0 8px;padding:6px;border:1px solid #c4b5fd;border-radius:8px;font:13px system-ui,sans-serif";

  function option(form, value, label, checked) {
    var row = el("label", null, "display:block;margin:3px 0;cursor:pointer");
    var input = el("input");
    input.type = "radio";
    input.name = "tipo";
    input.value = value;
    input.checked = Boolean(checked);
    row.append(input, document.createTextNode(" " + label));
    form.append(row);
    return input;
  }
  function correctionForm(box, detail) {
    var form = el("form", null, BOX);
    form.append(el("strong", "O que o agente deveria ter feito?"));
    var section = el("div");
    var kinds = [
      ["existente", "Usar uma resposta que já existe na base", true],
      ["nova", "Responder com um texto novo (vira pergunta na FAQ)"],
      ["fluxo", "Fazer uma pergunta antes de responder (conversa em etapas)"],
    ];
    if (detail.intencao === "faq" && detail.fonte) kinds.splice(1, 0, ["editar", "Corrigir o texto desta resposta"]);
    var radios = kinds.map(function (k) {
      return option(form, k[0], k[1], k[2]);
    });
    form.append(section);
    function render() {
      section.replaceChildren();
      var kind = radios.find(function (r) {
        return r.checked;
      }).value;
      if (kind === "existente") {
        var select = el("select", null, FIELD);
        select.name = "alvo";
        (base.faq || []).forEach(function (f) {
          var o = el("option", "Pergunta: " + f.pergunta);
          o.value = "faq:" + f.id;
          select.append(o);
        });
        (base.intencoes || []).forEach(function (i) {
          var o = el("option", "Intenção " + i.id + " (ex.: " + i.exemplo + ")");
          o.value = "intencao:" + i.id;
          select.append(o);
        });
        (base.fluxos || []).forEach(function (f) {
          var o = el("option", "Conversa: " + f.pergunta);
          o.value = "fluxo-gatilho:" + f.id;
          select.append(o);
        });
        section.append(select);
      } else if (kind === "nova" || kind === "editar") {
        var area = el("textarea", null, FIELD);
        area.name = "resposta";
        area.rows = 3;
        area.placeholder = "Resposta certa";
        if (kind === "editar") area.value = detail.resposta || "";
        section.append(area);
        if (kind === "nova") {
          var link = el("input", null, FIELD);
          link.name = "link";
          link.placeholder = "Link de uma página do site (opcional), ex.: /contato";
          section.append(link);
        }
      } else {
        var etapa = el("input", null, FIELD);
        etapa.name = "etapa";
        etapa.placeholder = "Pergunta do agente, ex.: Você quer entrega ou retirada?";
        section.append(etapa);
        for (var i = 1; i <= 3; i++) {
          var row = el("div", null, "display:grid;grid-template-columns:1fr 2fr;gap:6px");
          var rot = el("input", null, FIELD);
          rot.name = "rotulo" + i;
          rot.placeholder = "Opção " + i + (i === 3 ? " (opcional)" : "");
          var resp = el("input", null, FIELD);
          resp.name = "resposta" + i;
          resp.placeholder = "Resposta para a opção " + i;
          row.append(rot, resp);
          section.append(row);
        }
      }
    }
    radios.forEach(function (r) {
      r.addEventListener("change", render);
    });
    render();
    var save = el("button", "Salvar e ensinar", BTN + ";background:#6d28d9;color:#fff");
    save.type = "submit";
    var status = el("p", "", "margin:6px 0 0");
    status.setAttribute("role", "status");
    form.append(save, status);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = new FormData(form);
      var kind = data.get("tipo");
      var body = { pergunta: detail.pergunta };
      if (kind === "existente") {
        var parts = String(data.get("alvo") || "").split(":");
        body.tipo = parts[0];
        body.alvo = parts.slice(1).join(":");
      } else if (kind === "fluxo") {
        body.tipo = "fluxo";
        body.etapa = data.get("etapa");
        body.opcoes = [1, 2, 3].map(function (i) {
          return { rotulo: data.get("rotulo" + i), resposta: data.get("resposta" + i) };
        });
      } else {
        body.tipo = kind;
        body.resposta = data.get("resposta");
        body.link = data.get("link") || "";
        if (kind === "editar") body.alvo = detail.faqId || "";
      }
      save.disabled = true;
      status.textContent = "Salvando...";
      post("corrigir", body)
        .then(function (r) {
          // Formulário some; fica só o recado do que foi aprendido.
          var done = el("p", "Aprendido! " + r.mudanca + (r.geral != null ? " Acerto da base: " + r.geral + "%." : "") + " Pergunte de novo para testar.", "margin:6px 0 10px;color:#15803d;font:13px/1.35 system-ui,sans-serif");
          done.setAttribute("role", "status");
          form.replaceWith(done);
          document.dispatchEvent(new CustomEvent("agente:recarregar"));
          return loadBase();
        })
        .catch(function (err) {
          status.textContent = err.message;
          save.disabled = false;
        });
    });
    box.replaceWith(form);
  }

  // Versão 0.4: frases que o agente não entendeu no uso real vêm primeiro. Tocar numa delas
  // pergunta ao agente; depois é só marcar "Corrigir" e ensinar a resposta certa.
  function missesPanel() {
    fetch(BASE + "faltas", { cache: "no-store" })
      .then(function (r) {
        return r.ok ? r.json() : [];
      })
      .then(function (groups) {
        if (!Array.isArray(groups) || !groups.length || document.querySelector(".agt-faltas")) return;
        var panel = el("aside", null, "position:fixed;left:16px;bottom:16px;z-index:2147483646;max-width:300px;padding:10px;border:1px solid #6d28d9;border-radius:12px;background:#fff;box-shadow:0 8px 24px rgba(0,0,0,.15);font:13px/1.35 system-ui,sans-serif;color:#1f2937");
        panel.className = "agt-faltas";
        panel.setAttribute("aria-label", "Frases que o agente não entendeu");
        var head = el("strong", "Não entendidas no site (" + groups.length + ")", "display:block;margin-bottom:6px");
        var hide = el("button", "×", BTN + ";float:right;margin:0");
        hide.type = "button";
        hide.setAttribute("aria-label", "Esconder lista");
        hide.addEventListener("click", function () {
          panel.remove();
        });
        panel.append(hide, head, el("small", "Toque para perguntar ao agente e depois use Corrigir.", "display:block;margin-bottom:6px;color:#6b7280"));
        groups.slice(0, 8).forEach(function (g) {
          var b = el("button", "“" + g.frase + "” · " + g.vezes + "x", BTN + ";display:block;width:100%;text-align:left;margin:0 0 4px");
          b.type = "button";
          b.addEventListener("click", function () {
            if (!window.agente) return;
            window.agente.open();
            window.agente.ask(g.frase);
            b.style.opacity = "0.5";
          });
          panel.append(b);
        });
        document.body.append(panel);
      })
      .catch(function () {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(missesPanel, 800); });
  else setTimeout(missesPanel, 800);

  document.addEventListener("agente:resposta", function (e) {
    var detail = e.detail || {};
    var bots = document.querySelectorAll(".agw-msg.agw-bot");
    var msg = bots[bots.length - 1];
    if (!msg || msg.querySelector(".agt-root")) return;
    var box = el("div", null, "margin-top:6px");
    box.className = "agt-root";
    var ok = el("button", "Certo", BTN);
    ok.type = "button";
    var fix = el("button", "Corrigir", BTN);
    fix.type = "button";
    box.append(ok, fix);
    ok.addEventListener("click", function () {
      post("ok", { pergunta: detail.pergunta, intencao: detail.intencao }).catch(function () {});
      box.replaceChildren(el("small", "Anotado como certo.", "color:#15803d"));
    });
    fix.addEventListener("click", function () {
      (base ? Promise.resolve(base) : loadBase()).then(function () {
        if (detail.intencao === "faq" && detail.fonte) detail.faqId = detail.fonte;
        correctionForm(box, detail);
      });
    });
    msg.append(box);
  });
})();
