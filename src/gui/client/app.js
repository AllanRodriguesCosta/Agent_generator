// Instalador visual do Agent Generator (versão 0.9). Sem bibliotecas: cada etapa monta o seu
// conteúdo, mostra as instruções do que fazer e conversa com o servidor local (/api/...).
(function () {
  "use strict";
  var TOKEN = new URLSearchParams(location.search).get("t") || "";
  var $ = function (id) { return document.getElementById(id); };

  // append que ignora null/false (partes opcionais das telas).
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) {
      var k = arguments[i];
      if (k != null && k !== false) parent.append(k);
    }
    return parent;
  }

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (v === true) n.setAttribute(k, "");
      else n.setAttribute(k, v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null || c === false) return;
      add(n, c.nodeType ? c : document.createTextNode(String(c)));
    });
    return n;
  }

  function api(method, path, data) {
    return fetch(path, {
      method: method,
      headers: { "content-type": "application/json", "x-instalador": TOKEN },
      body: method === "POST" ? JSON.stringify(data || {}) : undefined,
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (j) {
        if (!res.ok) throw new Error(j.erro || "Falha (" + res.status + ")");
        return j;
      });
    });
  }

  // ---------- estado ----------
  var S = {
    etapa: 0,
    max: 0,
    estado: null,
    escolhas: { recursos: {}, perfilFonte: "", agente: {}, inserir: true, regerar: false, gemini: false },
    chat: { msgs: [], contexto: {} },
    modo: "treinar",
    sessaoOpcoes: { url: "", permitirNpm: false, minutos: 30 },
    polling: null,
  };
  var CORES = ["#6d28d9", "#2563eb", "#0f766e", "#16a34a", "#ea580c", "#db2777", "#111827"];
  var TONS = { amigavel: "Amigável", formal: "Formal", neutro: "Neutro (só o conteúdo)" };

  function status(texto, erro) {
    var s = $("status");
    s.textContent = texto || "";
    s.className = "status" + (erro ? " erro" : "");
  }
  function falha(e) { status(e.message || String(e), true); }

  // ---------- etapas ----------
  var INSTALAR = [
    {
      nome: "Boas-vindas",
      dica: "o que vai acontecer",
      titulo: "Bem-vindo ao instalador do Agent Generator",
      sub: "Em poucos minutos o seu site ganha um assistente que tira dúvidas, mostra produtos e leva a pessoa até a página certa — sem IA paga e sem mandar o projeto para fora.",
      passos: [
        "Leia o resumo abaixo para saber o que o instalador vai fazer.",
        "Se estiver editando o site agora, salve o que estiver aberto: o instalador pode inserir uma linha nas páginas (com cópia de segurança).",
        "Clique em Próximo para escolher a pasta do projeto.",
      ],
      montar: telaBoasVindas,
      pode: function () { return true; },
    },
    {
      nome: "Pasta do projeto",
      dica: "onde está o site",
      titulo: "Qual é a pasta do seu site?",
      sub: "É a pasta raiz do projeto: a que tem o index.html ou o package.json.",
      passos: [
        "Confira se o caminho abaixo é a pasta raiz do seu site.",
        "Se não for, copie o caminho certo (no Explorador de Arquivos, clique na barra de endereço e copie), cole no campo e clique em Usar esta pasta.",
        "Os itens com ✓ mostram o que foi encontrado. Com tudo certo, clique em Próximo.",
      ],
      montar: telaPasta,
      pode: function () { return Boolean(S.estado && S.estado.info); },
    },
    {
      nome: "Raio X",
      dica: "o instalador lê o projeto",
      titulo: "Raio X do projeto",
      sub: "O instalador só lê os arquivos nesta etapa. Nada é alterado.",
      passos: [
        "Aguarde o raio X terminar (ele começa sozinho).",
        "Confira os números: páginas, formulários, perguntas frequentes e itens de catálogo.",
        "Se o tipo de negócio (setor) estiver errado, escolha o certo na lista e clique em Refazer o raio X.",
      ],
      montar: telaRaioX,
      pode: function () { return Boolean(S.estado && S.estado.analise); },
    },
    {
      nome: "Funcionalidades",
      dica: "o que o agente pode fazer",
      titulo: "O que o agente pode fazer?",
      sub: "As respostas básicas (perguntas frequentes, páginas, contato e horários) estão sempre ligadas. Aqui ficam só as funcionalidades que merecem uma decisão sua.",
      passos: [
        "Marque o que o agente pode fazer no seu site.",
        "Os itens com o selo Sensível lidam com dados de quem está logado: ligue só se o site tiver login e você quiser esse atendimento.",
        "Itens em cinza não foram encontrados no projeto. Eles ficam disponíveis quando o site tiver isso (é só rodar o instalador de novo).",
        "Pode mudar depois: rode o instalador outra vez e desmarque. Desligar não apaga nada da base.",
      ],
      montar: telaRecursos,
      pode: function () { return true; },
    },
    {
      nome: "Aparência",
      dica: "nome, cor e tom",
      titulo: "Como o agente se apresenta",
      sub: "Nome, cor do botão, tom das respostas e o lado da tela. A prévia mostra como vai ficar.",
      passos: [
        "Dê um nome ao assistente (ex.: Assistente da Loja Aurora).",
        "Escolha a cor do botão — de preferência a cor principal do seu site.",
        "Escolha o tom das respostas e o lado da tela. Confira na prévia e clique em Próximo.",
      ],
      montar: telaAparencia,
      pode: function () { return true; },
    },
    {
      nome: "Instalação",
      dica: "copiar e ligar o widget",
      titulo: "Pronto para instalar",
      sub: "Revise o que vai ser feito no projeto. Tudo que for alterado ganha uma cópia de segurança em agente-gerador/backup.",
      passos: [
        "Revise o resumo: onde o agente fica e quais páginas recebem o widget.",
        "Deixe marcado Inserir o widget nas páginas para o agente aparecer sozinho no site.",
        "Clique em Instalar e acompanhe o progresso. Quando terminar, clique em Próximo.",
      ],
      montar: telaInstalar,
      pode: function () { return Boolean(S.estado && S.estado.instalacao); },
    },
    {
      nome: "Teste",
      dica: "converse com o agente",
      titulo: "Teste o seu agente",
      sub: "Converse com ele aqui mesmo, como um cliente faria. Se o site é HTML simples, dá para abrir o site com o agente funcionando.",
      passos: [
        "Escreva perguntas na caixa de conversa (ou toque nas sugestões).",
        "Clique em Abrir o site para ver o botão do agente nas páginas (sites HTML simples).",
        "Anote o que ele errar: na próxima etapa você corrige conversando, sem editar arquivos.",
      ],
      montar: telaTeste,
      pode: function () { return true; },
    },
    {
      nome: "Etapa 2",
      dica: "interação assistida",
      titulo: "Etapa 2 — Interação assistida",
      sub: "O instalador continua aberto para você desenvolver a base de conhecimento usando o próprio site.",
      passos: [
        "Escolha Treinar (você conversa com o agente e corrige cada resposta) ou Observar (você usa o site como cliente e o agente aprende páginas, buscas e consultas).",
        "Se o site não for HTML simples, deixe-o rodando (ex.: npm run dev) e informe o endereço — ou permita que o instalador inicie o projeto.",
        "Clique em Iniciar. O site abre no navegador com o agente em modo treino. Em cada resposta, toque em Certo ou Corrigir.",
        "Quando terminar, clique em Encerrar e aprender. Pode repetir quantas vezes quiser; cada sessão faz backup da base.",
      ],
      montar: telaEtapa2,
      pode: function () { return true; },
    },
  ];

  // Versão 0.9: desinstalar o agente encontrado na pasta (fluxo próprio, com 2 etapas).
  var DESINSTALAR = [
    {
      nome: "Revisar",
      dica: "o que vai sair",
      titulo: "Desinstalar o agente",
      sub: "Confira o que vai sair do projeto. A base de conhecimento é guardada antes, porque pode ter sido treinada por você.",
      passos: [
        "Confira a lista do que será removido do projeto.",
        "Marque Apagar também a pasta agente-gerador/ só se não quiser guardar relatórios e backups (nesse caso a base vai para um arquivo na raiz do projeto).",
        "Clique em Desinstalar e confirme. Para desistir, clique em Voltar ao instalador.",
      ],
      montar: telaDesRevisar,
      botao: "Desinstalar",
      perigo: true,
      acao: desinstalar,
      pode: function () { return Boolean(S.plano && S.plano.instalado); },
    },
    {
      nome: "Desinstalação",
      dica: "remoção e resumo",
      titulo: "Desinstalação",
      sub: "O instalador remove o widget das páginas e a pasta do agente.",
      passos: [
        "Aguarde a remoção terminar.",
        "Se aparecer a lista \"Linha colada à mão\", abra cada arquivo e apague a linha do widget (o instalador não mexe em código que ele não escreveu).",
        "Pronto. Para instalar de novo, clique em Instalar de novo ou feche o instalador.",
      ],
      montar: telaDesExecutar,
      pode: function () { return true; },
    },
  ];
  var ETAPAS = INSTALAR;

  function entrarDesinstalar() {
    if (ocupado()) return;
    ETAPAS = DESINSTALAR;
    S.fluxo = "desinstalar";
    S.plano = null;
    S.desinstalacao = null;
    S.max = 0;
    ir(0);
  }
  function voltarInstalar(inicio) {
    ETAPAS = INSTALAR;
    S.fluxo = "instalar";
    S.max = inicio ? 0 : Math.max(S.max, 1);
    if (inicio) S.escolhas = { recursos: {}, perfilFonte: "", agente: {}, inserir: true, regerar: false, gemini: false };
    recarregar().then(function () { ir(inicio ? 0 : 1); });
  }
  function cartaoJaInstalado(info) {
    return el("div", { class: "cartao destaque ja" }, [
      el("div", { class: "ico", "aria-hidden": "true", text: "✓" }),
      el("div", { class: "conteudo" }, [
        el("div", {}, [el("strong", { text: "Já existe um agente criado pelo Agent Generator neste projeto" }), el("span", { text: info.pastaAgente ? "Pasta do agente: " + info.pastaAgente + "/. " : "" }), el("span", { text: "Você pode atualizar/reconfigurar (siga com Próximo; o que você editou é mantido) ou desinstalar." })]),
        el("div", { class: "linha" }, [el("button", { class: "btn perigo", type: "button", text: "Desinstalar o agente", onclick: entrarDesinstalar })]),
      ]),
    ]);
  }

  function telaDesRevisar(c) {
    var area = el("div", { class: "conteudo" }, el("p", { class: "muted", text: "Mapeando o agente no projeto…" }));
    add(c, area);
    api("GET", "/api/desinstalar").then(function (p) {
      S.plano = p;
      area.textContent = "";
      if (!p.instalado) {
        add(area, el("p", { class: "aviso info", text: "Não há agente criado pelo Agent Generator nesta pasta. Nada para desinstalar." }), el("button", { class: "btn sec", type: "button", text: "Voltar ao instalador", onclick: function () { voltarInstalar(false); } }));
        atualizarBotoes();
        return;
      }
      var itens = [];
      if (p.pasta) itens.push(el("li", {}, ["Apagar a pasta ", el("strong", { text: p.pasta.rel + "/" }), " (" + p.pasta.arquivos + " arquivos: núcleo, widget e base de conhecimento)"]));
      if (p.paginas.length) itens.push(el("li", { text: "Tirar a linha do widget de " + p.paginas.length + " página(s): " + p.paginas.join(", ") }));
      itens.push(el("li", { text: "Guardar a base de conhecimento antes (dá para reinstalar com ela)" }));
      var marcado = Boolean(S.apagarTrabalho);
      var cb = el("input", { type: "checkbox", id: "des-tudo" });
      cb.checked = marcado;
      var card = el("label", { class: "opcao" + (marcado ? " marcada" : ""), for: "des-tudo" }, [cb, el("span", { class: "t", text: "Apagar também a pasta " + p.trabalho.rel + "/" }), el("span", { class: "d", text: "Relatórios, avaliações e backups do Agent Generator. Desmarcado, ela fica com um registro da desinstalação e cópias das páginas." })]);
      cb.addEventListener("change", function () { S.apagarTrabalho = cb.checked; card.classList.toggle("marcada", cb.checked); });
      add(area,
        el("div", { class: "cartao" }, [el("h3", { text: "O que a desinstalação vai fazer" }), el("ul", { class: "checks" }, itens)]),
        p.trabalho.existe ? card : null,
        p.referencias.length ? el("div", { class: "aviso alerta" }, [el("strong", { text: "Linha colada à mão: " }), "estes arquivos citam o widget e não foram alterados pelo instalador, então ele não mexe neles. Depois, apague a linha você mesmo: " + p.referencias.join(", ")]) : null,
        el("div", { class: "linha" }, [el("button", { class: "btn sec", type: "button", text: "Voltar ao instalador", onclick: function () { voltarInstalar(false); } })]),
      );
      atualizarBotoes();
    }).catch(falha);
  }
  function desinstalar() {
    if (!confirm("Desinstalar o agente deste projeto? O widget sai das páginas e a pasta do agente é apagada (a base é guardada antes).")) return;
    S.max = 1;
    ir(1);
  }
  function telaDesExecutar(c) {
    var area = el("div", { class: "cartao" });
    add(c, area);
    if (S.desinstalacao) return mostrarDes(area, S.desinstalacao);
    add(area, el("h3", { text: "Desinstalando…" }));
    var ver = progresso(area);
    api("POST", "/api/desinstalar", { apagarTrabalho: Boolean(S.apagarTrabalho) })
      .then(function () { atualizarBotoes(); return acompanhar(ver); })
      .then(function (r) { S.desinstalacao = r; return recarregar().then(function () { mostrarDes(area, r); status("Agente desinstalado."); }); })
      .catch(function (e) { falha(e); add(area, el("p", { class: "aviso erro", text: e.message })); });
  }
  function mostrarDes(area, r) {
    area.textContent = "";
    add(area, el("h3", {}, ["Agente desinstalado ", el("span", { class: "selo ok", text: "Concluído" })]), el("ul", { class: "checks" }, r.resumo.map(function (x) { return el("li", { text: x }); })));
    if (r.pendentes && r.pendentes.length) add(area, el("p", { class: "aviso alerta", text: "Falta você apagar a linha do widget em: " + r.pendentes.join(", ") }));
    add(area, el("div", { class: "linha" }, [el("button", { class: "btn sec", type: "button", text: "Instalar de novo", onclick: function () { S.desinstalacao = null; voltarInstalar(true); } })]));
  }

  // ---------- navegação ----------
  function desenharLado() {
    var ol = $("etapas");
    ol.textContent = "";
    ETAPAS.forEach(function (e, i) {
      var cls = i === S.etapa ? "atual" : i < S.max || (i < S.etapa) ? "feita" : "";
      add(ol,
        el("li", { class: cls }, [
          el("button", { type: "button", disabled: i > S.max, "aria-current": i === S.etapa ? "step" : null, onclick: function () { ir(i); } }, [
            el("span", { class: "bolinha" }, el("span", { text: String(i + 1) })),
            el("span", {}, [e.nome, el("small", { text: e.dica })]),
          ]),
        ]),
      );
    });
  }
  function desenharInstrucoes(e) {
    var box = $("instrucoes");
    box.textContent = "";
    add(box, el("div", { class: "ico", "aria-hidden": "true", text: "i" }), el("h2", { text: "O que fazer nesta etapa" }), el("ol", {}, e.passos.map(function (p) { return el("li", { text: p }); })));
  }
  function atualizarBotoes() {
    var e = ETAPAS[S.etapa];
    var ultimo = S.etapa === ETAPAS.length - 1;
    $("voltar").disabled = S.etapa === 0 || ocupado() || (S.fluxo === "desinstalar" && Boolean(S.desinstalacao));
    var prox = $("proximo");
    prox.textContent = ultimo ? "Fechar instalador" : e.botao || "Próximo";
    prox.disabled = ocupado() || (!ultimo && !e.pode());
    prox.className = ultimo ? "btn sec" : e.perigo ? "btn pri vermelho" : "btn pri";
  }
  function ocupado() {
    var t = S.estado && S.estado.tarefa;
    var s = S.estado && S.estado.sessao;
    return Boolean((t && t.status === "rodando") || (s && s.status === "rodando"));
  }
  function ir(i) {
    if (i < 0 || i >= ETAPAS.length || i > S.max) return;
    S.etapa = i;
    var e = ETAPAS[i];
    $("etapaNum").textContent = "Etapa " + (i + 1) + " de " + ETAPAS.length;
    $("titulo").textContent = e.titulo;
    $("subtitulo").textContent = e.sub;
    desenharInstrucoes(e);
    desenharLado();
    var c = $("conteudo");
    c.textContent = "";
    status("");
    e.montar(c);
    atualizarBotoes();
    document.querySelector(".corpo").scrollTop = 0;
  }
  $("voltar").addEventListener("click", function () { ir(S.etapa - 1); });
  $("proximo").addEventListener("click", function () {
    if (S.etapa === ETAPAS.length - 1) return fechar();
    if (!ETAPAS[S.etapa].pode()) return;
    if (ETAPAS[S.etapa].acao) return ETAPAS[S.etapa].acao();
    S.max = Math.max(S.max, S.etapa + 1);
    ir(S.etapa + 1);
  });

  function recarregar() {
    return api("GET", "/api/estado").then(function (e) {
      S.estado = e;
      if (e.versao) $("versao").textContent = "Instalador · versão " + e.versao;
      atualizarBotoes();
      return e;
    });
  }

  // Acompanha uma tarefa longa (raio X, instalação) até terminar.
  function acompanhar(onPasso) {
    return new Promise(function (ok, fail) {
      (function tick() {
        api("GET", "/api/tarefa").then(function (r) {
          var t = r.tarefa;
          if (S.estado) S.estado.tarefa = t;
          onPasso(t);
          atualizarBotoes();
          if (!t || t.status === "rodando") return setTimeout(tick, 500);
          if (t.status === "erro") return fail(new Error(t.erro));
          ok(t.resultado);
        }, fail);
      })();
    });
  }
  function progresso(alvo) {
    var barra = el("div", { class: "barra indeterminada" }, el("i"));
    var lista = el("ul", { class: "registro" });
    add(alvo, barra, lista);
    return function (t) {
      if (!t) return;
      if (t.pct > 0) {
        barra.classList.remove("indeterminada");
        barra.firstChild.style.width = t.pct + "%";
      }
      lista.textContent = "";
      t.passos.forEach(function (p) { add(lista, el("li", { text: p.texto })); });
    };
  }

  // ---------- telas ----------
  function telaBoasVindas(c) {
    if (S.estado && S.estado.info && S.estado.info.instalado) add(c, cartaoJaInstalado(S.estado.info));
    add(c,
      el("div", { class: "grade" }, [
        destaque("★", "Sem custo e sem IA obrigatória", "O agente roda no navegador de quem visita o site, com a base de conhecimento criada a partir do próprio projeto."),
        destaque("⟲", "Com cópia de segurança", "Tudo que o instalador alterar fica guardado em agente-gerador/backup. Dá para desfazer."),
        destaque("✎", "Melhora conversando", "Depois de instalar, a etapa 2 abre o site em modo treino: você corrige as respostas na hora."),
      ]),
      el("div", { class: "cartao" }, [
        el("h3", { text: "O que vai acontecer" }),
        el("ol", { class: "linha-tempo" }, [
          el("li", { text: "Você confirma a pasta do site e o instalador faz o raio X (só leitura)." }),
          el("li", { text: "Você marca as funcionalidades e a aparência do agente." }),
          el("li", { text: "O instalador cria a pasta do agente, liga o widget nas páginas e testa a base." }),
          el("li", { text: "Você conversa com o agente e, na etapa 2, ensina o que faltar." }),
        ]),
      ]),
    );
  }
  function destaque(ico, t, d) {
    return el("div", { class: "cartao destaque" }, [el("div", { class: "ico", "aria-hidden": "true", text: ico }), el("div", {}, [el("strong", { text: t }), el("span", { text: d })])]);
  }

  function telaPasta(c) {
    var e = S.estado || {};
    var input = el("input", { type: "text", id: "pasta", value: (e.info && e.info.pasta) || e.pasta || "", "aria-label": "Pasta do projeto", spellcheck: "false" });
    var botao = el("button", { class: "btn sec", type: "button", text: "Usar esta pasta" });
    var checks = el("div");
    function mostrar(info) {
      checks.textContent = "";
      if (!info) return;
      var ok = info.temIndex || info.temPackage;
      add(checks,
        el("ul", { class: "checks" }, [
          el("li", { class: info.temIndex ? "" : "nao", text: info.temIndex ? "index.html encontrado (site HTML)" : "Sem index.html na raiz" }),
          el("li", { class: info.temPackage ? "" : "nao", text: info.temPackage ? "package.json encontrado (projeto Node/React/Vite...)" : "Sem package.json" }),
          el("li", { class: info.temBase ? "" : "nao", text: info.temBase ? "Já existe um agente instalado aqui: a base atual será mantida (a não ser que você peça para regerar)" : "Nenhum agente instalado ainda" }),
        ]),
        ok ? null : el("p", { class: "aviso alerta", text: "Não parece a pasta raiz de um site. Dá para continuar, mas confira o caminho." }),
        info.instalado ? cartaoJaInstalado(info) : null,
      );
    }
    function usar() {
      status("Abrindo a pasta…");
      api("POST", "/api/pasta", { pasta: input.value }).then(function (r) {
        status("");
        return recarregar().then(function () { mostrar(r.info); });
      }).catch(falha);
    }
    botao.addEventListener("click", usar);
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") usar(); });
    add(c, el("div", { class: "cartao" }, [el("label", { class: "campo", for: "pasta" }, ["Pasta do projeto", el("span", { class: "ajuda", text: "Caminho completo, ex.: C:\\Users\\voce\\Documents\\meu-site" })]), el("div", { class: "linha" }, [input, botao]), el("div", { style: null }, checks)]));
    mostrar(e.info);
    if (!e.info && input.value) usar();
  }

  function telaRaioX(c) {
    var area = el("div", { class: "cartao" });
    var res = el("div", { class: "conteudo" });
    add(c, area, res);
    function rodar(setor) {
      if (!area.isConnected) c.prepend(area);
      area.textContent = "";
      res.textContent = "";
      add(area, el("h3", { text: "Lendo o projeto…" }));
      var ver = progresso(area);
      api("POST", "/api/analisar", setor !== undefined ? { setor: setor } : {})
        .then(function () { atualizarBotoes(); return acompanhar(ver); })
        .then(function () { return recarregar(); })
        .then(function () { area.textContent = ""; mostrar(); S.max = Math.max(S.max, 3); desenharLado(); })
        .catch(function (e) { falha(e); add(area, el("p", { class: "aviso erro", text: e.message })); });
    }
    function mostrar() {
      var a = S.estado.analise;
      var r = a.resumo;
      area.remove();
      add(res,
        el("div", { class: "numeros" }, [num(r.paginas, "páginas"), num(r.rotas, "rotas"), num(r.formularios, "formulários"), num(r.faq, "perguntas frequentes"), num(r.itensCatalogo, "itens de catálogo")]),
        el("div", { class: "cartao" }, [
          el("h3", { text: a.site || "Seu site" }),
          el("p", {}, ["Tipo de projeto: ", el("strong", { text: a.stack.join(", ") || "site estático (HTML)" })]),
          el("p", {}, ["O agente vai ficar em ", el("strong", { text: a.destino.dir + "/" }), el("span", { class: "muted", text: " (" + a.destino.motivo + ")" })]),
          a.temBase ? el("p", { class: "aviso info", text: "Já existe uma base de conhecimento ali (talvez editada à mão). Ela será mantida, a não ser que você peça para regerar na etapa de instalação." }) : null,
        ]),
        cartaoSetor(a),
        a.avisos.length ? el("details", { class: "cartao" }, [el("summary", { text: "Avisos do raio X (" + a.avisos.length + ")" }), el("ul", {}, a.avisos.slice(0, 12).map(function (x) { return el("li", { class: "pequeno", text: x }); }))]) : null,
      );
      status("Raio X concluído. Confira e clique em Próximo.");
    }
    function cartaoSetor(a) {
      var sel = el("select", { id: "setor", "aria-label": "Setor do negócio" });
      add(sel, el("option", { value: "", text: "Detectar sozinho (" + a.setor.detectado + ")" }));
      a.setores.forEach(function (id) { add(sel, el("option", { value: id, text: id, selected: a.setor.escolhido === id })); });
      var top = a.setor.ranking[0];
      return el("div", { class: "cartao" }, [
        el("h3", { text: "Tipo de negócio (setor)" }),
        el("p", {}, ["Setor usado: ", el("strong", { text: a.setor.nome }), top && top.evidencias.length ? el("span", { class: "muted pequeno", text: " — sinais: " + top.evidencias.join(", ") }) : null]),
        el("p", { class: "muted pequeno", text: "O setor traz um glossário com os termos comuns do ramo (português e inglês) para o agente entender sinônimos." }),
        el("div", { class: "linha" }, [sel, el("button", { class: "btn sec", type: "button", text: "Refazer o raio X", onclick: function () { rodar(sel.value); } })]),
      ]);
    }
    function num(n, t) { return el("div", { class: "numero" }, [el("b", { text: String(n) }), el("span", { text: t })]); }
    if (S.estado && S.estado.analise) mostrar();
    else rodar();
  }

  function telaRecursos(c) {
    var a = S.estado.analise;
    var lista = el("div", { class: "opcoes" });
    a.recursos.forEach(function (r) {
      if (!(r.id in S.escolhas.recursos)) S.escolhas.recursos[r.id] = r.padrao;
      var cb = el("input", { type: "checkbox", id: "rec-" + r.id, disabled: !r.disponivel });
      cb.checked = r.disponivel && S.escolhas.recursos[r.id];
      var extra = null;
      if (r.id === "perfil") {
        var fonte = el("input", { type: "text", placeholder: "/api/minha-conta", value: S.escolhas.perfilFonte || a.perfilFonte || "", "aria-label": "Endereço dos dados de quem está logado" });
        fonte.addEventListener("input", function () { S.escolhas.perfilFonte = fonte.value; });
        extra = el("label", { class: "campo extra" + (cb.checked ? "" : " escondido") }, [el("span", { class: "ajuda", text: "Opcional: caminho da API do seu site que devolve os dados de quem está logado (o agente lê com a sessão da pessoa e guarda só na aba por 15 min). Sem isso, o site entrega os dados com agente.identificar({...})." }), fonte]);
      }
      var card = el("label", { class: "opcao" + (cb.checked ? " marcada" : "") + (r.disponivel ? "" : " indisponivel"), for: "rec-" + r.id }, [
        cb,
        el("span", { class: "t" }, [r.titulo + " ", r.sensivel ? el("span", { class: "selo sensivel", text: "Sensível" }) : null, r.disponivel ? null : el("span", { class: "selo off", text: "Não encontrado" })]),
        el("span", { class: "d", text: r.descricao }),
        el("span", { class: "det", text: r.disponivel ? "Encontrado: " + r.detalhe : r.detalhe }),
        extra,
      ]);
      cb.addEventListener("change", function () {
        S.escolhas.recursos[r.id] = cb.checked;
        card.classList.toggle("marcada", cb.checked);
        if (extra) extra.classList.toggle("escondido", !cb.checked);
      });
      add(lista, card);
    });
    add(c, lista);
    var cr = a.criticas;
    var cats = Object.keys(cr.porCategoria).map(function (k) { return k + ": " + cr.porCategoria[k]; }).join(" · ");
    add(c,
      el("div", { class: "cartao" }, [
        el("h3", {}, ["Ações críticas do site ", el("span", { class: "selo ok", text: "Sempre bloqueadas" })]),
        el("p", { text: cr.total ? "O raio X encontrou " + cr.total + " ação(ões) sensível(is) no site (" + cats + "). O agente nunca envia formulários, faz pagamentos, troca senhas ou altera dados: ele só explica e mostra o caminho." : "Nenhuma ação sensível (pagamento, login, exclusão) foi encontrada. Mesmo assim, o agente nunca envia formulários nem altera dados." }),
        cr.exemplos.length ? el("details", {}, [el("summary", { class: "pequeno", text: "Ver exemplos" }), el("ul", {}, cr.exemplos.map(function (x) { return el("li", { class: "pequeno", text: x.metodo + " " + x.caminho + " — " + x.categoria + " (risco " + x.risco + ")" }); }))]) : null,
      ]),
    );
  }

  function telaAparencia(c) {
    var a = S.estado.analise.agente;
    var g = S.escolhas.agente;
    ["nome", "cor", "tom", "posicao", "saudacao"].forEach(function (k) { if (g[k] == null) g[k] = a[k]; });
    var previa = el("div", { class: "previa" });
    function desenharPrevia() {
      previa.textContent = "";
      previa.className = "previa" + (g.posicao === "esquerda" ? " esquerda" : "");
      var bot = el("div", { class: "botao", "aria-hidden": "true" }, el("span", { text: "💬" }));
      bot.style.background = g.cor;
      add(previa, el("div", { class: "bolha" }, [el("b", { text: g.nome }), g.saudacao]), bot);
    }
    var nome = el("input", { type: "text", id: "ag-nome", value: g.nome, maxlength: "80" });
    nome.addEventListener("input", function () { g.nome = nome.value; desenharPrevia(); });
    var cores = el("div", { class: "cores", role: "group", "aria-label": "Cor do botão" });
    function desenharCores() {
      cores.textContent = "";
      CORES.forEach(function (cor) {
        var b = el("button", { type: "button", class: g.cor === cor ? "sel" : "", "aria-label": "Cor " + cor, title: cor, onclick: function () { g.cor = cor; desenharCores(); desenharPrevia(); } });
        b.style.background = cor;
        add(cores, b);
      });
      var livre = el("input", { type: "color", value: g.cor, "aria-label": "Outra cor" });
      livre.addEventListener("input", function () { g.cor = livre.value; desenharPrevia(); });
      add(cores, livre);
    }
    var tom = el("select", { id: "ag-tom" });
    Object.keys(TONS).forEach(function (k) { add(tom, el("option", { value: k, text: TONS[k], selected: g.tom === k })); });
    tom.addEventListener("change", function () { g.tom = tom.value; });
    var lado = el("select", { id: "ag-lado" }, [el("option", { value: "direita", text: "Direita", selected: g.posicao !== "esquerda" }), el("option", { value: "esquerda", text: "Esquerda", selected: g.posicao === "esquerda" })]);
    lado.addEventListener("change", function () { g.posicao = lado.value; desenharPrevia(); });
    var saud = el("textarea", { id: "ag-saud", maxlength: "600" });
    saud.value = g.saudacao;
    saud.addEventListener("input", function () { g.saudacao = saud.value; desenharPrevia(); });
    desenharCores();
    desenharPrevia();
    add(c,
      el("div", { class: "grade-2" }, [
        el("div", { class: "cartao conteudo" }, [
          el("label", { class: "campo", for: "ag-nome" }, ["Nome do assistente", nome]),
          el("div", { class: "campo" }, [el("span", { text: "Cor do botão" }), cores]),
          el("div", { class: "grade" }, [el("label", { class: "campo", for: "ag-tom" }, ["Tom das respostas", tom]), el("label", { class: "campo", for: "ag-lado" }, ["Lado da tela", lado])]),
          el("label", { class: "campo", for: "ag-saud" }, ["Primeira mensagem", saud]),
        ]),
        el("div", { class: "cartao" }, [el("h3", { text: "Prévia" }), previa]),
      ]),
    );
  }

  function telaInstalar(c) {
    var a = S.estado.analise;
    var e = S.escolhas;
    var ligadas = a.recursos.filter(function (r) { return r.disponivel && e.recursos[r.id]; }).map(function (r) { return r.titulo; });
    var opcoes = el("div", { class: "opcoes" });
    function opcao(id, titulo, desc, valor, onChange, desabilitado) {
      var cb = el("input", { type: "checkbox", id: id, disabled: desabilitado });
      cb.checked = valor;
      var card = el("label", { class: "opcao" + (valor ? " marcada" : "") + (desabilitado ? " indisponivel" : ""), for: id }, [cb, el("span", { class: "t", text: titulo }), el("span", { class: "d", text: desc })]);
      cb.addEventListener("change", function () { card.classList.toggle("marcada", cb.checked); onChange(cb.checked); });
      return card;
    }
    if (a.manual) e.inserir = false;
    add(opcoes,
      opcao("op-inserir", "Inserir o widget nas páginas", a.manual ? "Seu projeto usa " + (a.framework || "um formato sem index.html na raiz") + ": no fim, o instalador mostra a linha para colar." : "Insere uma linha antes de </body> em " + a.paginasEntrada.length + " página(s): " + a.paginasEntrada.slice(0, 4).join(", ") + (a.paginasEntrada.length > 4 ? "…" : "") + ". Cópia de cada uma em agente-gerador/backup/html.", e.inserir, function (v) { e.inserir = v; }, a.manual),
    );
    if (a.temBase) add(opcoes, opcao("op-regerar", "Regerar a base do zero", "A base atual vai para agente-gerador/backup e uma nova é criada a partir do raio X. Deixe desmarcado para manter o que você já editou.", e.regerar, function (v) { e.regerar = v; }));
    if (a.gemini) add(opcoes, opcao("op-gemini", "Melhorar a base com o Gemini (gratuito)", "Encontrei a GEMINI_API_KEY. O Gemini sugere exemplos e perguntas novas; tudo passa pela conferência da base.", e.gemini, function (v) { e.gemini = v; }));
    var resumo = el("div", { class: "cartao" }, [
      el("h3", { text: "Resumo" }),
      el("ul", { class: "checks" }, [
        el("li", {}, ["Agente em ", el("strong", { text: a.destino.dir + "/" }), " (núcleo, widget e base de conhecimento)"]),
        el("li", { text: "Funcionalidades: " + (ligadas.join(", ") || "só as respostas básicas") }),
        el("li", { text: "Aparência: " + (e.agente.nome || a.agente.nome) + " · " + (TONS[e.agente.tom || a.agente.tom] || "") + " · lado " + (e.agente.posicao || a.agente.posicao) }),
      ]),
    ]);
    var acao = el("div", { class: "cartao" });
    add(c, resumo, opcoes, acao);
    if (S.estado.instalacao) return mostrarFeito(acao, S.estado.instalacao);
    var botao = el("button", { class: "btn pri grande", type: "button", text: "Instalar" });
    add(acao, el("h3", { text: "Instalar no projeto" }), el("p", { class: "muted", text: "Leva poucos segundos." }), botao);
    botao.addEventListener("click", function () {
      botao.disabled = true;
      acao.textContent = "";
      add(acao, el("h3", { text: "Instalando…" }));
      var ver = progresso(acao);
      api("POST", "/api/instalar", e)
        .then(function () { atualizarBotoes(); return acompanhar(ver); })
        .then(function () { return recarregar(); })
        .then(function () {
          S.max = Math.max(S.max, 6);
          desenharLado();
          mostrarFeito(acao, S.estado.instalacao);
          status("Instalado! Clique em Próximo para testar.");
        })
        .catch(function (err) { falha(err); add(acao, el("p", { class: "aviso erro", text: err.message })); botao.disabled = false; add(acao, botao); });
    });
  }
  function mostrarFeito(alvo, r) {
    alvo.textContent = "";
    add(alvo, el("h3", {}, ["Instalação concluída ", el("span", { class: "selo ok", text: "Acerto " + (r.geral == null ? "-" : r.geral + "%") })]), el("ul", { class: "checks" }, r.resumo.map(function (x) { return el("li", { text: x }); })));
    if (r.snippet) {
      var copiar = el("button", { class: "btn sec", type: "button", text: "Copiar", onclick: function () { navigator.clipboard && navigator.clipboard.writeText(r.snippet).then(function () { status("Copiado."); }); } });
      add(alvo, el("p", { class: "aviso alerta", text: "Falta um passo manual: cole a linha abaixo no seu projeto (também está em agente-gerador/COMO-LIGAR.txt)." }), el("pre", { class: "codigo", text: r.snippet }), copiar);
    }
  }

  function telaTeste(c) {
    var r = S.estado.instalacao || {};
    var geral = S.estado.acerto != null ? S.estado.acerto : r.geral;
    var anel = el("div", { class: "anel" }, el("b", { text: geral == null ? "-" : geral + "%" }));
    anel.style.setProperty("--p", geral || 0);
    var barras = el("div", { class: "barrinhas" });
    var nomes = { treino: "Exemplos", intencoes: "Generalização", faq: "Perguntas", paginas: "Páginas", dominio: "Setor e conteúdo", frases: "Suas frases", variacoes: "Variações" };
    Object.keys(r.porcentagens || {}).forEach(function (k) {
      var v = r.porcentagens[k];
      if (v == null) return;
      var b = el("div", { class: "barra" }, el("i"));
      b.firstChild.style.width = v + "%";
      add(barras, el("div", {}, [el("span", { text: nomes[k] || k }), b, el("span", { text: v + "%" })]));
    });
    var site = el("div");
    if (r.podeAbrirSite) {
      add(site, el("button", { class: "btn sec", type: "button", text: S.estado.site ? "Abrir o site de novo" : "Abrir o site com o agente", onclick: abrirSite }));
      if (S.estado.site) add(site, el("p", { class: "pequeno muted" }, ["Site em ", el("a", { href: S.estado.site.url, target: "_blank", rel: "noopener", text: S.estado.site.url })]));
    } else add(site, el("p", { class: "muted pequeno", text: "Seu projeto não é HTML simples: rode o site do seu jeito (ex.: npm run dev) para ver o agente. Na etapa 2 o instalador abre o site com o agente em modo treino." }));
    function abrirSite() {
      api("POST", "/api/site").then(function (s) { return recarregar().then(function () { status("Site aberto em " + s.url); site.textContent = ""; add(site, el("p", { class: "pequeno" }, ["Site em ", el("a", { href: s.url, target: "_blank", rel: "noopener", text: s.url })])); }); }).catch(falha);
    }
    add(c, el("div", { class: "grade-2" }, [chat(), el("div", { class: "conteudo" }, [el("div", { class: "cartao" }, [el("h3", { text: "Acerto da base" }), el("div", { class: "medidor" }, [anel, barras]), el("p", { class: "muted pequeno", text: "O instalador testa a base com as próprias perguntas e variações. Acima de 80% já é um bom começo; a etapa 2 ajuda a subir." })]), el("div", { class: "cartao" }, [el("h3", { text: "Ver no site" }), site])])]));
  }
  function chat() {
    var lista = el("div", { class: "mensagens", "aria-live": "polite" });
    var input = el("input", { type: "text", placeholder: "Escreva como um cliente…", "aria-label": "Mensagem para o agente", maxlength: "500" });
    var form = el("form", {}, [input, el("button", { class: "btn pri", type: "submit", text: "Enviar" })]);
    function desenhar() {
      lista.textContent = "";
      S.chat.msgs.forEach(function (m) {
        if (m.eu) return add(lista, el("div", { class: "msg eu", text: m.texto }));
        var box = el("div", { class: "msg ag" }, [m.texto]);
        (m.itens || []).forEach(function (i) { add(box, el("div", { class: "pequeno", text: "• " + i.nome + (i.precoTexto ? " — " + i.precoTexto : "") })); });
        (m.acoes || []).forEach(function (x) { add(box, el("div", { class: "pequeno", text: "→ " + x.rotulo + " (" + x.href + ")" })); });
        if (m.intencao) add(box, el("span", { class: "meta", text: "entendeu: " + m.intencao + (m.confianca != null ? " · confiança " + m.confianca : "") }));
        if (m.sugestoes && m.sugestoes.length) add(box, el("div", { class: "chips" }, m.sugestoes.map(function (s) { return el("button", { type: "button", text: s, onclick: function () { enviar(s); } }); })));
        add(lista, box);
      });
      lista.scrollTop = lista.scrollHeight;
    }
    function enviar(texto) {
      if (texto) S.chat.msgs.push({ eu: true, texto: texto });
      desenhar();
      api("POST", "/api/testar", { mensagem: texto || "", contexto: S.chat.contexto }).then(function (r) {
        S.chat.contexto = r.contexto || {};
        S.chat.msgs.push(r);
        desenhar();
      }).catch(falha);
    }
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = input.value.trim();
      if (!t) return;
      input.value = "";
      enviar(t);
    });
    if (!S.chat.msgs.length) enviar("");
    else desenhar();
    return el("div", { class: "cartao" }, [el("h3", { text: "Conversa de teste" }), el("div", { class: "chat" }, [lista, form])]);
  }

  function telaEtapa2(c) {
    var o = S.sessaoOpcoes;
    var modos = el("div", { class: "modos", role: "radiogroup", "aria-label": "Tipo de sessão" });
    function desenharModos() {
      modos.textContent = "";
      [
        ["treinar", "Treinar conversando", "Você conversa com o agente no site e marca Certo ou Corrigir em cada resposta. Dá para criar conversas em etapas."],
        ["observar", "Observar o uso do site", "Você usa o site como cliente por alguns minutos (navega, busca, entra na conta). O agente aprende páginas, buscas e consultas."],
      ].forEach(function (m) {
        add(modos, el("button", { type: "button", role: "radio", "aria-checked": S.modo === m[0] ? "true" : "false", class: "modo" + (S.modo === m[0] ? " sel" : ""), onclick: function () { S.modo = m[0]; o.minutos = m[0] === "treinar" ? 30 : 5; minutos.value = o.minutos; desenharModos(); } }, [el("strong", { text: m[1] }), el("span", { text: m[2] })]));
      });
    }
    var url = el("input", { type: "text", placeholder: "Opcional: http://localhost:3000", value: o.url });
    url.addEventListener("input", function () { o.url = url.value; });
    var npm = el("input", { type: "checkbox", id: "op-npm" });
    npm.checked = o.permitirNpm;
    npm.addEventListener("change", function () { o.permitirNpm = npm.checked; });
    var minutos = el("input", { type: "number", min: "1", max: "120", value: String(o.minutos) });
    minutos.addEventListener("input", function () { o.minutos = Number(minutos.value) || 30; });
    desenharModos();
    var painel = el("div", { class: "cartao" });
    var editor = el("div", { class: "cartao" }, [
      el("h3", { text: "Editor da base" }),
      el("p", { class: "muted pequeno", text: "Prefere editar? O editor mostra perguntas, intenções, páginas e conversas em formulários, com teste e acerto na hora." }),
      el("button", { class: "btn sec", type: "button", text: "Abrir o editor da base", onclick: function () { api("POST", "/api/editor").then(function (r) { status("Editor aberto no navegador."); window.open(r.url, "_blank", "noopener"); }).catch(falha); } }),
    ]);
    add(c,
      modos,
      el("details", { class: "cartao" }, [
        el("summary", { text: "Onde o site está rodando? (só para sites que não são HTML simples)" }),
        el("div", { class: "conteudo" }, [
          el("label", { class: "campo" }, ["Endereço do site rodando", el("span", { class: "ajuda", text: "Deixe vazio para o instalador descobrir (site HTML simples, endereço salvo ou porta comum)." }), url]),
          el("label", { class: "opcao", for: "op-npm" }, [npm, el("span", { class: "t", text: "Pode iniciar o projeto com npm run dev" }), el("span", { class: "d", text: "Se o site não estiver rodando, o instalador roda o script do package.json e para no fim da sessão." })]),
          el("label", { class: "campo" }, ["Tempo máximo da sessão (minutos)", minutos]),
        ]),
      ]),
      painel,
      editor,
    );
    desenharPainel(painel);
    if (S.estado.sessao && S.estado.sessao.status === "rodando") acompanharSessao(painel);
  }
  function desenharPainel(p) {
    var s = S.estado && S.estado.sessao;
    p.textContent = "";
    if (s && s.status === "rodando") {
      add(p,
        el("h3", {}, [el("span", { class: "ao-vivo", text: s.modo === "treinar" ? "Treino em andamento" : "Observação em andamento" })]),
        s.url ? el("p", {}, ["O site abriu no navegador em ", el("a", { href: s.url, target: "_blank", rel: "noopener", text: s.url }), ". Se não abriu, clique no link."]) : el("p", { class: "muted", text: "Preparando o site…" }),
        el("ul", { class: "registro" }, s.log.slice(-12).map(function (l) { return el("li", { text: l }); })),
        el("div", { class: "linha" }, [el("button", { class: "btn pri", type: "button", text: "Encerrar e aprender", onclick: function () { api("POST", "/api/sessao/parar").then(function () { status("Encerrando e aprendendo com a sessão…"); }).catch(falha); } })]),
      );
      return;
    }
    if (s && s.status === "ok" && s.resultado) {
      var r = s.resultado;
      add(p, el("p", { class: "aviso ok", text: "Sessão concluída. Acerto da base: " + r.antes + "% → " + r.depois + "%" + (r.correcoes != null ? " · " + r.correcoes + " correção(ões), " + r.certas + " resposta(s) marcada(s) como certa(s)" : "") + "." }));
      add(p, el("details", {}, [el("summary", { class: "pequeno", text: "Ver o relatório" }), el("pre", { class: "codigo", text: r.texto })]));
    }
    if (s && s.status === "erro") add(p, el("p", { class: "aviso erro", text: s.erro }));
    add(p, el("h3", { text: s ? "Nova sessão" : "Pronto para começar" }), el("button", { class: "btn pri grande", type: "button", text: S.modo === "treinar" ? "Iniciar treino" : "Iniciar observação", onclick: iniciar }));
    function iniciar() {
      api("POST", "/api/sessao/iniciar", { modo: S.modo, url: S.sessaoOpcoes.url, permitirNpm: S.sessaoOpcoes.permitirNpm, minutos: S.sessaoOpcoes.minutos })
        .then(function (r) { S.estado.sessao = r.sessao; atualizarBotoes(); desenharPainel(p); p.scrollIntoView({ behavior: "smooth", block: "start" }); acompanharSessao(p); })
        .catch(falha);
    }
  }
  function acompanharSessao(p) {
    clearTimeout(S.polling);
    (function tick() {
      api("GET", "/api/sessao").then(function (r) {
        var antes = S.estado.sessao;
        S.estado.sessao = r.sessao;
        atualizarBotoes();
        if (S.etapa === ETAPAS.length - 1 && p.isConnected) {
          // Só redesenha quando muda o estado ou o endereço; senão atualiza só o registro
          // (redesenhar tudo a cada segundo faria o clique em "Encerrar" se perder).
          var chave = r.sessao ? r.sessao.status + "|" + r.sessao.url : "";
          var ul = p.querySelector(".registro");
          if (p.dataset.chave === chave && ul) {
            ul.textContent = "";
            r.sessao.log.slice(-12).forEach(function (l) { add(ul, el("li", { text: l })); });
          } else {
            p.dataset.chave = chave;
            desenharPainel(p);
          }
        }
        if (r.sessao && r.sessao.status === "rodando") S.polling = setTimeout(tick, 1500);
        else if (antes && antes.status === "rodando") { status("Sessão encerrada."); recarregar(); }
      }).catch(function () { S.polling = setTimeout(tick, 3000); });
    })();
  }

  function fechar() {
    if (!confirm("Fechar o instalador? O agente continua instalado no site. Para a etapa 2 depois, abra o executável de novo.")) return;
    api("POST", "/api/sair").then(function () {
      document.body.textContent = "";
      add(document.body, el("div", { class: "cartao", style: null }, [el("h3", { text: "Instalador fechado." }), el("p", { text: "Pode fechar esta janela." })]));
      setTimeout(function () { window.close(); }, 400);
    }).catch(falha);
  }

  // Sinal de vida: o instalador sem terminal encerra sozinho alguns minutos depois que a janela fecha.
  setInterval(function () { api("POST", "/api/vivo").catch(function () {}); }, 20000);

  recarregar().then(function (e) {
    // Retoma onde parou (ex.: a janela foi recarregada).
    if (e.instalacao) S.max = 7;
    else if (e.analise) S.max = 5;
    else if (e.info) S.max = 1;
    if (e.sessao && e.sessao.status === "rodando") { S.max = 7; ir(7); return; }
    ir(0);
  }).catch(falha);
})();
