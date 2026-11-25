// Instalador visual do Agent Generator (versão 0.9). Sem bibliotecas: cada etapa monta o seu
// conteúdo, mostra as instruções do que fazer e conversa com o servidor local (/api/...).
// Versão 0.11: etapa "Inteligência artificial" (OpenRouter em 1 clique, Gemini assistido) e serviço
// do agente na Cloudflare. Versão 0.12: caminho "Meu site já está no ar" (só o endereço).
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
    escolhas: novasEscolhas(),
    fluxo: "instalar",
    ia: null,
    chat: { msgs: [], contexto: {} },
    modo: "treinar",
    sessaoOpcoes: { url: "", permitirNpm: false, minutos: 30 },
    polling: null,
  };
  function novasEscolhas() {
    return { recursos: {}, perfilFonte: "", agente: {}, inserir: true, regerar: false, gemini: false, ia: { usar: false, melhorar: true, publicar: true, site: "" } };
  }
  var CORES = ["#6d28d9", "#2563eb", "#0f766e", "#16a34a", "#ea580c", "#db2777", "#111827"];
  var TONS = { amigavel: "Amigável", formal: "Formal", neutro: "Neutro (só o conteúdo)" };

  function status(texto, erro) {
    var s = $("status");
    s.textContent = texto || "";
    s.className = "status" + (erro ? " erro" : "");
  }
  function falha(e) { status(e.message || String(e), true); }

  // ---------- etapas ----------
  // Versão 0.11: IA opcional, nas duas instalações (pasta e site publicado).
  var ETAPA_IA = {
    id: "ia",
    nome: "Inteligência artificial",
    dica: "opcional: entender melhor",
    titulo: "Inteligência artificial (opcional)",
    sub: "O agente já responde sozinho com a base do site. A IA só entra quando ele não entende uma frase: ela reescreve o pedido e quem responde continua sendo a base.",
    passos: [
      "Escolha Sem IA (grátis, nada sai do site) ou um provedor.",
      "OpenRouter: clique em Entrar com OpenRouter, entre no navegador e clique em Authorize. A chave volta sozinha.",
      "Gemini: abra o Google AI Studio, copie a chave, volte e clique em Colar. O instalador testa na hora.",
      "A chave fica no cofre do seu usuário (fora do projeto) e, publicada, como segredo no seu serviço da Cloudflare. Nada de variável no Render ou Action no GitHub.",
    ],
    montar: telaIa,
    pode: function () {
      var ia = S.escolhas.ia;
      if (!ia.usar) return true;
      var c = S.ia && S.ia.cofre;
      if (!c || !c.ia) return false;
      if (S.fluxo === "site" || ia.publicar === false) return true;
      return Boolean(c.cloudflare);
    },
  };
  var INSTALAR = [
    {
      id: "boas",
      nome: "Boas-vindas",
      dica: "o que vai acontecer",
      titulo: "Bem-vindo ao instalador do Agent Generator",
      sub: "Em poucos minutos o seu site ganha um assistente que tira dúvidas, mostra produtos e leva a pessoa até a página certa — sem mensalidade e sem IA obrigatória.",
      passos: [
        "Escolha como está o seu site: com a pasta do código no computador ou já no ar (só o endereço).",
        "Leia o resumo para saber o que o instalador vai fazer.",
        "Clique em Próximo.",
      ],
      montar: telaBoasVindas,
      pode: function () { return true; },
    },
    {
      id: "pasta",
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
      id: "raiox",
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
      id: "recursos",
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
      id: "aparencia",
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
    ETAPA_IA,
    {
      id: "instalacao",
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
      id: "teste",
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
      id: "etapa2",
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
      id: "des-revisar",
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
      id: "des-executar",
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
  // Versão 0.12: site já publicado (WordPress, Wix, Shopify...): só o endereço, sem novo deploy.
  var SITE = [
    null, // Boas-vindas (a mesma tela do instalador da pasta)
    {
      id: "endereco",
      nome: "Endereço do site",
      dica: "o site que já está no ar",
      titulo: "Qual é o endereço do seu site?",
      sub: "O instalador lê as páginas públicas, como um visitante. Não precisa do código, de senha nem de acesso à hospedagem.",
      passos: [
        "Digite o endereço do site (ex.: https://minhaloja.com.br).",
        "Confirme que o site é seu ou que você tem autorização para lê-lo.",
        "Clique em Ler este site. O instalador nunca entra em login, carrinho ou área do cliente e não envia formulários.",
      ],
      montar: telaEndereco,
      pode: function () { return Boolean(S.estado && S.estado.info && S.estado.info.modo === "url"); },
    },
    {
      id: "raiox",
      nome: "Leitura do site",
      dica: "páginas públicas",
      titulo: "Leitura do site",
      sub: "Páginas, perguntas frequentes, produtos marcados para o Google e formulários. Respeita o robots.txt e faz pausas entre as páginas.",
      passos: [
        "Aguarde a leitura terminar (ela começa sozinha).",
        "Confira os números: páginas, formulários, perguntas e itens de catálogo.",
        "Se o tipo de negócio estiver errado, escolha o certo e clique em Refazer a leitura.",
      ],
      montar: telaRaioX,
      pode: function () { return Boolean(S.estado && S.estado.analise); },
    },
    null, // Funcionalidades
    null, // Aparência
    ETAPA_IA,
    {
      id: "publicar",
      nome: "Publicar",
      dica: "serviço grátis na Cloudflare",
      titulo: "Publicar o agente",
      sub: "O agente vai para um serviço seu, gratuito, na Cloudflare. O seu site não muda até você colar uma linha (próxima etapa).",
      passos: [
        "Conecte a Cloudflare (só na primeira vez): crie a conta grátis, clique em Criar chave de publicação e cole o token aqui.",
        "Clique em Publicar e acompanhe o progresso.",
        "Pronto: o agente fica num endereço seu (…workers.dev). Clique em Próximo para colocar no site.",
      ],
      montar: telaPublicar,
      pode: function () { return Boolean(S.estado && S.estado.instalacao); },
    },
    {
      id: "colocar",
      nome: "Colocar no site",
      dica: "uma linha, sem novo deploy",
      titulo: "Coloque o agente no seu site",
      sub: "Uma linha no rodapé do site (ou o plugin no WordPress). Sem baixar o código e sem novo deploy.",
      passos: [
        "Copie a linha e cole no campo de código do rodapé da sua plataforma (o passo a passo da sua plataforma está abaixo).",
        "No WordPress é ainda mais fácil: baixe o plugin e envie em Plugins > Adicionar novo > Enviar plugin.",
        "Quer ver antes? Clique em Ver prévia no meu site. Depois de colar, clique em Verificar instalação.",
      ],
      montar: telaColocar,
      pode: function () { return true; },
    },
    null, // Teste
  ];
  SITE[0] = INSTALAR[0];
  SITE[3] = INSTALAR[3];
  SITE[4] = INSTALAR[4];
  SITE[SITE.length - 1] = INSTALAR[INSTALAR.length - 2];
  var ETAPAS = INSTALAR;
  function idx(id) {
    for (var i = 0; i < ETAPAS.length; i++) if (ETAPAS[i].id === id) return i;
    return 0;
  }
  function liberar(id) {
    S.max = Math.max(S.max, idx(id));
    desenharLado();
  }
  function usarFluxo(nome) {
    S.fluxo = nome;
    ETAPAS = nome === "site" ? SITE : nome === "desinstalar" ? DESINSTALAR : INSTALAR;
  }

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
    S.max = inicio ? 0 : Math.max(S.max, idx("pasta"));
    if (inicio) S.escolhas = novasEscolhas();
    recarregar().then(function () { ir(inicio ? 0 : idx("pasta")); });
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
        p.servico ? opcaoCheck("des-servico", "Apagar também o serviço do agente na Cloudflare", "Serviço da IA em " + p.servico.url + ". Desmarcado, ele continua no ar (dá para apagar depois no painel da Cloudflare).", S.apagarServico !== false, function (v) { S.apagarServico = v; }) : null,
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
    api("POST", "/api/desinstalar", { apagarTrabalho: Boolean(S.apagarTrabalho), apagarServico: Boolean(S.plano && S.plano.servico) && S.apagarServico !== false })
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
    var url = S.fluxo === "site";
    // Versão 0.12: dois caminhos. Pasta do código (como antes) ou site já no ar (só o endereço).
    var modos = el("div", { class: "modos", role: "radiogroup", "aria-label": "Como está o seu site" });
    [
      ["instalar", "Tenho a pasta do site", "O código do site está neste computador (HTML, React, Vite, Next...). O agente é instalado na pasta e vai para o ar com o site."],
      ["site", "Meu site já está no ar", "Só o endereço: WordPress, Wix, Shopify ou qualquer plataforma. Sem baixar o código e sem novo deploy. No fim, você cola uma linha no site."],
    ].forEach(function (m) {
      var sel = S.fluxo === m[0];
      add(modos, el("button", { type: "button", role: "radio", "aria-checked": sel ? "true" : "false", class: "modo" + (sel ? " sel" : ""), onclick: function () {
        if (ocupado() || S.fluxo === m[0]) return;
        usarFluxo(m[0]);
        S.max = 0;
        ir(0);
      } }, [el("strong", { text: m[1] }), el("span", { text: m[2] })]));
    });
    add(c, el("div", { class: "cartao" }, [el("h3", { text: "Como está o seu site?" }), modos]));
    if (!url && S.estado && S.estado.info && S.estado.info.instalado) add(c, cartaoJaInstalado(S.estado.info));
    add(c,
      el("div", { class: "grade" }, url
        ? [
            destaque("★", "Sem mexer no código", "O instalador lê as páginas públicas do site e monta a base de conhecimento, sem pedir senha nem acesso à hospedagem."),
            destaque("☁", "No ar em minutos", "O agente fica num serviço seu, gratuito, na Cloudflare. O site só ganha uma linha (ou um plugin no WordPress)."),
            destaque("⟲", "Fácil de tirar", "Para remover, apague a linha (ou desative o plugin) e clique em Remover o agente."),
          ]
        : [
            destaque("★", "Sem custo e sem IA obrigatória", "O agente roda no navegador de quem visita o site, com a base de conhecimento criada a partir do próprio projeto."),
            destaque("⟲", "Com cópia de segurança", "Tudo que o instalador alterar fica guardado em agente-gerador/backup. Dá para desfazer."),
            destaque("✎", "Melhora conversando", "Depois de instalar, a etapa 2 abre o site em modo treino: você corrige as respostas na hora."),
          ]),
      el("div", { class: "cartao" }, [
        el("h3", { text: "O que vai acontecer" }),
        el("ol", { class: "linha-tempo" }, url
          ? [
              el("li", { text: "Você informa o endereço do site e o instalador lê as páginas públicas." }),
              el("li", { text: "Você marca as funcionalidades, a aparência e, se quiser, conecta uma IA." }),
              el("li", { text: "O instalador publica o agente num serviço seu, gratuito, na Cloudflare." }),
              el("li", { text: "Você cola uma linha no site (ou envia o plugin no WordPress) e confere com a prévia." }),
            ]
          : [
              el("li", { text: "Você confirma a pasta do site e o instalador faz o raio X (só leitura)." }),
              el("li", { text: "Você marca as funcionalidades, a aparência e, se quiser, conecta uma IA." }),
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
      add(area, el("h3", { text: S.fluxo === "site" ? "Lendo o site… (as páginas aparecem abaixo)" : "Lendo o projeto…" }));
      var ver = progresso(area);
      api("POST", "/api/analisar", setor !== undefined ? { setor: setor } : {})
        .then(function () { atualizarBotoes(); return acompanhar(ver); })
        .then(function () { return recarregar(); })
        .then(function () { area.textContent = ""; mostrar(); liberar("recursos"); })
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
          a.modo === "url"
            ? el("p", {}, ["Site: ", el("strong", { text: a.origem }), el("span", { class: "muted", text: " · base guardada em " + a.destino.dir + "/ (" + a.destino.motivo + ")" })])
            : el("p", {}, ["O agente vai ficar em ", el("strong", { text: a.destino.dir + "/" }), el("span", { class: "muted", text: " (" + a.destino.motivo + ")" })]),
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
        el("div", { class: "linha" }, [sel, el("button", { class: "btn sec", type: "button", text: S.fluxo === "site" ? "Refazer a leitura" : "Refazer o raio X", onclick: function () { rodar(sel.value); } })]),
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
        el("li", { class: e.ia.usar ? "" : "nao", text: e.ia.usar && S.ia && S.ia.cofre && S.ia.cofre.ia ? "IA: " + nomeProvedor(S.ia.cofre.ia.provedor) + (e.ia.publicar !== false ? " · chave como segredo no serviço da Cloudflare" + (e.ia.site ? " · domínio " + e.ia.site : "") : " · só para melhorar a base agora") : "IA: desligada (o agente responde só com a base)" }),
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
          liberar("teste");
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
    if (S.fluxo === "site") {
      add(site,
        el("p", { class: "muted pequeno", text: "Veja o agente no seu site publicado (prévia local, sem mexer no site) ou edite a base e publique de novo." }),
        el("div", { class: "linha" }, [
          el("button", { class: "btn sec", type: "button", text: "Ver prévia no meu site", onclick: function () { api("POST", "/api/previa").then(function (p) { status("Prévia aberta no navegador: " + p.url); }).catch(falha); } }),
          el("button", { class: "btn sec", type: "button", text: "Editar a base", onclick: function () { api("POST", "/api/editor").then(function (x) { status("Editor aberto no navegador. Depois de editar, clique em Publicar de novo."); window.open(x.url, "_blank", "noopener"); }).catch(falha); } }),
          el("button", { class: "btn sec", type: "button", text: "Publicar de novo", onclick: republicar }),
        ]),
      );
    } else if (r.podeAbrirSite) {
      add(site, el("button", { class: "btn sec", type: "button", text: S.estado.site ? "Abrir o site de novo" : "Abrir o site com o agente", onclick: abrirSite }));
      if (S.estado.site) add(site, el("p", { class: "pequeno muted" }, ["Site em ", el("a", { href: S.estado.site.url, target: "_blank", rel: "noopener", text: S.estado.site.url })]));
    } else add(site, el("p", { class: "muted pequeno", text: "Seu projeto não é HTML simples: rode o site do seu jeito (ex.: npm run dev) para ver o agente. Na etapa 2 o instalador abre o site com o agente em modo treino." }));
    function republicar() {
      status("Publicando de novo…");
      api("POST", "/api/publicar").then(function () { atualizarBotoes(); return acompanhar(function () {}); }).then(function (x) { status("Publicado de novo em " + x.url + "."); atualizarBotoes(); }).catch(falha);
    }
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
        if (m.interpretado) add(box, el("span", { class: "meta", text: "IA: entendi como “" + m.interpretado + "”" }));
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

  // ---------- Versão 0.11: inteligência artificial e Cloudflare ----------
  function opcaoCheck(id, titulo, desc, valor, onChange, desabilitado) {
    var cb = el("input", { type: "checkbox", id: id, disabled: desabilitado });
    cb.checked = Boolean(valor);
    var card = el("label", { class: "opcao" + (valor ? " marcada" : "") + (desabilitado ? " indisponivel" : ""), for: id }, [cb, el("span", { class: "t", text: titulo }), el("span", { class: "d", text: desc })]);
    cb.addEventListener("change", function () { card.classList.toggle("marcada", cb.checked); onChange(cb.checked); });
    return card;
  }
  function botaoCopiar(texto, rotulo) {
    return el("button", { class: "btn sec", type: "button", text: rotulo || "Copiar", onclick: function () {
      if (!navigator.clipboard) return status("Selecione o texto e copie com Ctrl+C.");
      navigator.clipboard.writeText(texto).then(function () { status("Copiado."); }, function () { status("Selecione o texto e copie com Ctrl+C."); });
    } });
  }
  function campoSecreto(id, rotulo) {
    return el("input", { type: "password", id: id, autocomplete: "off", spellcheck: "false", "aria-label": rotulo, placeholder: rotulo });
  }
  function colarEm(input, depois) {
    if (!navigator.clipboard || !navigator.clipboard.readText) { input.focus(); return status("Clique no campo e cole com Ctrl+V."); }
    navigator.clipboard.readText().then(function (t) {
      input.value = String(t || "").trim();
      if (input.value) depois();
      else { input.focus(); status("A área de transferência está vazia. Copie a chave e tente de novo."); }
    }, function () { input.focus(); status("Clique no campo e cole com Ctrl+V."); });
  }
  function abrirLink(qual) {
    return api("POST", "/api/ia/abrir", { qual: qual }).then(function (r) { status("Abrimos no navegador: " + r.url); });
  }
  function carregarIa() {
    return api("GET", "/api/ia").then(function (r) {
      S.ia = r;
      if (S.escolhas.ia && !S.escolhas.ia.site && r.siteUrl && S.fluxo !== "site") S.escolhas.ia.site = r.siteUrl;
      atualizarBotoes();
      return r;
    });
  }
  function nomeProvedor(id) {
    var p = ((S.ia && S.ia.provedores) || []).filter(function (x) { return x.id === id; })[0];
    return p ? p.nome : id;
  }

  function telaIa(c) {
    var e = S.escolhas;
    var area = el("div", { class: "conteudo" }, el("p", { class: "muted", text: "Carregando…" }));
    add(c, area);
    carregarIa().then(desenhar).catch(falha);
    function desenhar() {
      area.textContent = "";
      var cofre = S.ia.cofre || {};
      var escolhido = e.ia.usar ? S.iaProvedor || (cofre.ia && cofre.ia.provedor) || "openrouter" : "";
      var grade = el("div", { class: "modos ia-modos", role: "radiogroup", "aria-label": "Inteligência artificial" });
      [{ id: "", nome: "Sem IA", como: "padrão", resumo: "O agente responde só com a base do site. Grátis, e nada sai do site." }].concat(S.ia.provedores).forEach(function (p) {
        var sel = p.id === escolhido;
        add(grade, el("button", { type: "button", role: "radio", "aria-checked": sel ? "true" : "false", class: "modo" + (sel ? " sel" : ""), onclick: function () {
          e.ia.usar = Boolean(p.id);
          S.iaProvedor = p.id;
          S.iaTrocar = false;
          desenhar();
        } }, [el("strong", {}, [p.nome + " ", el("span", { class: "selo " + (p.id ? "info" : "ok"), text: p.como })]), el("span", { text: p.resumo })]));
      });
      add(area, grade);
      if (!e.ia.usar) {
        add(area, el("p", { class: "aviso info", text: "Sem IA o agente continua completo: perguntas frequentes, páginas, catálogo, formulários e fotos. Dá para ligar a IA depois, abrindo o instalador de novo." }));
        return atualizarBotoes();
      }
      var conectado = cofre.ia && cofre.ia.provedor === escolhido && !S.iaTrocar;
      add(area, conectado ? cartaoIaConectada(cofre.ia, desenhar) : painelProvedor(escolhido, desenhar));
      if (conectado) {
        add(area, opcaoCheck("ia-melhorar", "Melhorar a base com a IA na instalação", "A IA sugere exemplos e perguntas a partir do conteúdo do site. Tudo passa pela conferência da base: nada de preço, prazo ou regra inventada.", e.ia.melhorar, function (v) { e.ia.melhorar = v; }));
        if (S.fluxo === "site") add(area, el("p", { class: "aviso info", text: "No site já publicado, a chave vai como segredo para o seu serviço do agente (próxima etapa). O navegador de quem visita o site nunca vê a chave." }));
        else {
          var cf = el("div");
          var site = el("input", { type: "url", id: "ia-site", placeholder: "https://minhaloja.com.br", value: e.ia.site || "" });
          site.addEventListener("input", function () { e.ia.site = site.value.trim(); });
          var destino = el("div", { class: "cartao" }, [
            el("h3", { text: "Onde a chave fica" }),
            el("p", { class: "muted", text: "Num serviço seu, gratuito, na Cloudflare: a chave fica lá como segredo e o agente do site chama o serviço só quando não entende. Sem variável no Render, sem Action no GitHub e sem a chave no código do site." }),
            el("label", { class: "campo", for: "ia-site" }, ["Endereço do site no ar", el("span", { class: "ajuda", text: "Só esse domínio (e o seu computador, para testes) pode usar o serviço. Se o site ainda não está no ar, deixe em branco e rode o instalador de novo depois." }), site]),
            cf,
          ]);
          add(area, opcaoCheck("ia-publicar", "Publicar o serviço da IA na Cloudflare (recomendado)", "Desmarcado, a IA só melhora a base agora; o agente do site fica sem IA.", e.ia.publicar !== false, function (v) { e.ia.publicar = v; destino.classList.toggle("escondido", !v); atualizarBotoes(); }), destino);
          destino.classList.toggle("escondido", e.ia.publicar === false);
          painelCloudflare(cf, desenhar);
        }
      }
      atualizarBotoes();
    }
  }
  function cartaoIaConectada(ia, redesenhar) {
    return el("div", { class: "cartao destaque ja" }, [
      el("div", { class: "ico", "aria-hidden": "true", text: "✓" }),
      el("div", { class: "conteudo" }, [
        el("div", {}, [el("strong", { text: nomeProvedor(ia.provedor) + " conectado" }), el("span", { text: "Modelo: " + (ia.modelo || "-") + " · chave " + ia.chave + (ia.gratis ? " · plano gratuito (com limite diário de pedidos)" : "") })]),
        el("div", { class: "linha" }, [
          el("button", { class: "btn sec", type: "button", text: "Trocar a chave", onclick: function () { S.iaTrocar = true; redesenhar(); } }),
          el("button", { class: "btn perigo", type: "button", text: "Esquecer a chave", onclick: function () {
            if (!confirm("Apagar a chave da IA do cofre deste computador? (Um serviço já publicado continua com a chave até você publicar de novo.)")) return;
            api("POST", "/api/ia/esquecer", { qual: "ia" }).then(function (r) { S.ia.cofre = r.cofre; status("Chave apagada do cofre."); redesenhar(); }).catch(falha);
          } }),
        ]),
      ]),
    ]);
  }
  function painelProvedor(id, redesenhar) {
    var box = el("div", { class: "cartao" });
    var msg = el("p", { class: "pequeno", role: "status" });
    function salvar(dados) {
      msg.className = "pequeno muted";
      msg.textContent = "Testando a chave…";
      api("POST", "/api/ia/chave", dados).then(function (r) {
        S.ia.cofre = r.cofre;
        S.iaTrocar = false;
        status(r.mensagem);
        redesenhar();
      }).catch(function (err) { msg.className = "aviso erro"; msg.textContent = err.message; });
    }
    if (id === "openrouter") {
      var esperando = el("div");
      var entrar = el("button", { class: "btn pri grande", type: "button", text: "Entrar com OpenRouter" });
      entrar.addEventListener("click", function () {
        entrar.disabled = true;
        api("POST", "/api/ia/openrouter").then(function (r) {
          esperando.textContent = "";
          add(esperando, el("p", { class: "aviso info" }, ["Abrimos o OpenRouter no navegador. Entre (pode ser com a conta Google) e clique em Authorize. Se a página não abriu, ", el("a", { href: r.conexao.url, target: "_blank", rel: "noopener", text: "clique aqui" }), "."]));
          (function tick() {
            api("GET", "/api/ia").then(function (x) {
              S.ia = x;
              var cx = x.conexao || {};
              if (cx.status === "esperando") return setTimeout(tick, 1500);
              entrar.disabled = false;
              if (cx.status === "ok") { status(cx.mensagem || "OpenRouter conectado."); S.iaTrocar = false; return redesenhar(); }
              esperando.textContent = "";
              add(esperando, el("p", { class: "aviso erro", text: cx.erro || "Não deu certo. Tente de novo." }));
            }).catch(function () { setTimeout(tick, 3000); });
          })();
        }).catch(function (err) { entrar.disabled = false; falha(err); });
      });
      add(box,
        el("h3", { text: "Conectar o OpenRouter em 1 clique" }),
        el("p", { class: "muted", text: "O instalador abre o login no navegador, como o Git faz com o GitHub. Você entra, clica em Authorize e a chave volta sozinha para cá. Conta nova funciona com modelos gratuitos (limite diário); com crédito, usa o Gemini e outros." }),
        entrar,
        esperando,
      );
    } else if (id === "gemini") {
      var chave = campoSecreto("ia-chave", "Cole a chave aqui");
      var testar = function () { salvar({ provedor: "gemini", chave: chave.value }); };
      chave.addEventListener("keydown", function (ev) { if (ev.key === "Enter") testar(); });
      add(box,
        el("h3", { text: "Conectar o Google Gemini (gratuito)" }),
        el("ol", { class: "passos-ia" }, [
          el("li", {}, [el("span", { text: "Abra o Google AI Studio e entre com a sua conta Google." }), el("button", { class: "btn sec", type: "button", text: "Abrir o Google AI Studio", onclick: function () { abrirLink("gemini").catch(falha); } })]),
          el("li", { text: "Na página das chaves, clique em copiar ao lado da chave (conta nova já ganha uma; senão, clique em Criar chave de API)." }),
          el("li", {}, [el("span", { text: "Volte aqui e cole:" }), el("div", { class: "linha" }, [chave, el("button", { class: "btn sec", type: "button", text: "Colar", onclick: function () { colarEm(chave, testar); } }), el("button", { class: "btn pri", type: "button", text: "Testar e guardar", onclick: testar })])]),
        ]),
        msg,
        el("p", { class: "muted pequeno", text: "A chave fica no cofre do seu usuário neste computador (fora do projeto) e, se você publicar, como segredo no seu serviço da Cloudflare." }),
      );
      return box;
    } else {
      var base = el("input", { type: "url", id: "ia-base", placeholder: "https://api.groq.com/openai/v1 ou http://localhost:11434/v1" });
      var modelo = el("input", { type: "text", id: "ia-modelo", placeholder: "ex.: llama-3.3-70b-versatile, gpt-4o-mini, llama3.2" });
      var chave2 = campoSecreto("ia-chave2", "Chave (vazio para Ollama/LM Studio locais)");
      add(box,
        el("h3", { text: "Conectar uma API compatível com OpenAI" }),
        el("label", { class: "campo", for: "ia-base" }, ["Endereço da API", base]),
        el("label", { class: "campo", for: "ia-modelo" }, ["Modelo", modelo]),
        el("label", { class: "campo", for: "ia-chave2" }, ["Chave", chave2]),
        el("div", { class: "linha" }, [el("button", { class: "btn pri", type: "button", text: "Testar e guardar", onclick: function () { salvar({ provedor: "openai", chave: chave2.value, baseUrl: base.value, modelo: modelo.value }); } })]),
        msg,
        el("p", { class: "muted pequeno", text: "Um modelo local (Ollama) só funciona no seu computador: para o site no ar, use um provedor na internet." }),
      );
    }
    add(box, msg);
    return box;
  }

  function painelCloudflare(alvo, depois) {
    alvo.textContent = "";
    var cf = S.ia && S.ia.cofre && S.ia.cofre.cloudflare;
    if (cf && !S.cfTrocar) {
      add(alvo, el("div", { class: "aviso ok" }, [
        el("strong", { text: "Cloudflare conectada: " }),
        "conta " + (cf.conta || cf.contaId) + (cf.subdominio ? " · endereços *." + cf.subdominio + ".workers.dev" : " · o endereço grátis (workers.dev) é criado na publicação") + ". ",
        el("button", { class: "btn sec", type: "button", text: "Trocar a chave de publicação", onclick: function () { S.cfTrocar = true; painelCloudflare(alvo, depois); } }),
      ]));
      return atualizarBotoes();
    }
    var token = campoSecreto("cf-token", "Cole o token aqui");
    var msg = el("p", { class: "pequeno", role: "status" });
    function conectar() {
      msg.className = "pequeno muted";
      msg.textContent = "Conferindo o token na Cloudflare…";
      api("POST", "/api/cloudflare", { token: token.value }).then(function (r) {
        S.ia.cofre = r.cofre;
        S.cfTrocar = false;
        status("Cloudflare conectada: conta " + r.conta + ".");
        depois ? depois() : painelCloudflare(alvo, depois);
      }).catch(function (err) { msg.className = "aviso erro"; msg.textContent = err.message; });
    }
    token.addEventListener("keydown", function (ev) { if (ev.key === "Enter") conectar(); });
    add(alvo,
      el("h3", { text: "Conectar a Cloudflare (grátis, só na primeira vez)" }),
      el("p", { class: "muted pequeno", text: "Plano gratuito: 100 mil pedidos por dia ao serviço. O widget e a base são arquivos estáticos e não contam. Não pede cartão." }),
      el("ol", { class: "passos-ia" }, [
        el("li", {}, [el("span", { text: "Crie uma conta grátis (e-mail e senha). Já tem? Pule este passo." }), el("button", { class: "btn sec", type: "button", text: "Criar conta na Cloudflare", onclick: function () { abrirLink("cloudflareCadastro").catch(falha); } })]),
        el("li", {}, [el("span", { text: "Clique em Criar chave de publicação: a página abre com as permissões já marcadas. Lá, clique em Continue to summary e depois em Create Token." }), el("button", { class: "btn sec", type: "button", text: "Criar chave de publicação", onclick: function () { abrirLink("cloudflareToken").catch(falha); } })]),
        el("li", {}, [el("span", { text: "Copie o token, volte aqui e cole:" }), el("div", { class: "linha" }, [token, el("button", { class: "btn sec", type: "button", text: "Colar", onclick: function () { colarEm(token, conectar); } }), el("button", { class: "btn pri", type: "button", text: "Conectar", onclick: conectar })])]),
      ]),
      msg,
    );
    atualizarBotoes();
  }

  // ---------- Versão 0.12: site já publicado ----------
  function telaEndereco(c) {
    var info = (S.estado && S.estado.info) || {};
    var input = el("input", { type: "url", id: "site-url", placeholder: "https://minhaloja.com.br", value: info.modo === "url" ? info.site : S.urlSite || "", spellcheck: "false" });
    var cb = el("input", { type: "checkbox", id: "site-autorizado" });
    cb.checked = Boolean(S.autorizado);
    cb.addEventListener("change", function () { S.autorizado = cb.checked; });
    var botao = el("button", { class: "btn pri", type: "button", text: "Ler este site" });
    var res = el("div");
    function ler() {
      S.urlSite = input.value.trim();
      if (!S.urlSite) return status("Digite o endereço do site.", true);
      if (!cb.checked) return status("Confirme que o site é seu ou que você tem autorização para lê-lo.", true);
      botao.disabled = true;
      status("Abrindo o site…");
      api("POST", "/api/url", { url: S.urlSite, autorizado: true }).then(function (r) {
        botao.disabled = false;
        return recarregar().then(function () {
          status("Site encontrado: " + r.info.site + ".");
          liberar("raiox");
          ir(idx("raiox"));
        });
      }).catch(function (err) { botao.disabled = false; falha(err); });
    }
    botao.addEventListener("click", ler);
    input.addEventListener("keydown", function (ev) { if (ev.key === "Enter") ler(); });
    add(c, el("div", { class: "cartao" }, [
      el("label", { class: "campo", for: "site-url" }, ["Endereço do site", el("span", { class: "ajuda", text: "Pode ser o endereço da página inicial. Se o site manda para www (ou o contrário), o instalador segue sozinho." }), input]),
      el("label", { class: "opcao" + (cb.checked ? " marcada" : ""), for: "site-autorizado" }, [cb, el("span", { class: "t", text: "O site é meu ou tenho autorização para lê-lo" }), el("span", { class: "d", text: "O instalador lê só páginas públicas, respeita o robots.txt, se identifica como agent-generator e faz pausas entre as páginas." })]),
      el("div", { class: "linha" }, [botao]),
      res,
    ]));
    if (info.modo === "url") add(c, el("p", { class: "aviso info", text: "Os arquivos deste site ficam em " + info.pasta + (info.jaPublicado ? ". Este site já tem um agente publicado em " + info.servico + ": o instalador atualiza o mesmo serviço." : ".") }));
  }

  function telaPublicar(c) {
    var a = S.estado.analise;
    var e = S.escolhas;
    var ligadas = a.recursos.filter(function (r) { return r.disponivel && e.recursos[r.id]; }).map(function (r) { return r.titulo; });
    var cofre = (S.ia && S.ia.cofre) || {};
    var resumo = el("div", { class: "cartao" }, [
      el("h3", { text: "O que vai ser publicado" }),
      el("ul", { class: "checks" }, [
        el("li", { text: "Agente: " + (e.agente.nome || a.agente.nome) + " · " + (TONS[e.agente.tom || a.agente.tom] || "") }),
        el("li", { text: "Funcionalidades: " + (ligadas.join(", ") || "só as respostas básicas") }),
        el("li", { class: e.ia.usar ? "" : "nao", text: e.ia.usar && cofre.ia ? "IA: " + nomeProvedor(cofre.ia.provedor) + " (" + cofre.ia.modelo + "), com a chave como segredo no serviço" : "IA: desligada (o agente responde só com a base)" }),
        el("li", { text: "Base de conhecimento de " + a.origem + " (" + a.resumo.paginas + " páginas)" }),
      ]),
    ]);
    var cf = el("div", { class: "cartao" });
    var acao = el("div", { class: "cartao" });
    add(c, resumo, cf, acao);
    function desenharAcao() {
      acao.textContent = "";
      if (S.estado.instalacao) return mostrarPublicado(acao, S.estado.instalacao);
      var pronto = Boolean(S.ia && S.ia.cofre && S.ia.cofre.cloudflare);
      var botao = el("button", { class: "btn pri grande", type: "button", text: "Publicar", disabled: !pronto });
      add(acao, el("h3", { text: "Publicar na sua conta da Cloudflare" }), el("p", { class: "muted", text: pronto ? "Leva menos de um minuto. Em conta nova, o endereço pode levar alguns minutos para responder." : "Conecte a Cloudflare acima para liberar o botão." }), botao);
      botao.addEventListener("click", function () {
        botao.disabled = true;
        acao.textContent = "";
        add(acao, el("h3", { text: "Publicando…" }));
        var ver = progresso(acao);
        api("POST", "/api/instalar", e)
          .then(function () { atualizarBotoes(); return acompanhar(ver); })
          .then(function () { return recarregar(); })
          .then(function () { liberar("teste"); mostrarPublicado(acao, S.estado.instalacao); status("Publicado! Clique em Próximo para colocar no site."); return carregarIa().then(function () { painelCloudflare(cf, redesenhar); }); })
          .catch(function (err) { falha(err); add(acao, el("p", { class: "aviso erro", text: err.message })); botao.disabled = false; add(acao, botao); });
      });
    }
    function redesenhar() { painelCloudflare(cf, redesenhar); desenharAcao(); }
    (S.ia ? Promise.resolve(S.ia) : carregarIa()).then(redesenhar).catch(falha);
  }
  function mostrarPublicado(alvo, r) {
    alvo.textContent = "";
    add(alvo,
      el("h3", {}, ["Agente publicado ", el("span", { class: "selo ok", text: "Acerto " + (r.geral == null ? "-" : r.geral + "%") })]),
      el("p", {}, ["Endereço do agente: ", el("a", { href: r.servico, target: "_blank", rel: "noopener", text: r.servico })]),
      el("ul", { class: "checks" }, r.resumo.map(function (x) { return el("li", { text: x }); })),
    );
  }

  function telaColocar(c) {
    var area = el("div", { class: "conteudo" }, el("p", { class: "muted", text: "Preparando…" }));
    add(c, area);
    api("GET", "/api/colocar").then(function (k) {
      area.textContent = "";
      var guias = el("div", { class: "conteudo" });
      k.guias.forEach(function (g) {
        var corpo = [el("ol", {}, g.passos.map(function (p) { return el("li", { text: p }); }))];
        if (g.id === "wordpress") corpo.push(el("div", { class: "linha" }, [el("a", { class: "btn pri", href: "/api/arquivo/agente-wordpress.zip?t=" + encodeURIComponent(TOKEN), download: "agente-wordpress.zip", text: "Baixar plugin para WordPress" })]));
        if (g.id === "gtm") corpo.push(el("pre", { class: "codigo", text: k.loader }), el("div", { class: "linha" }, [botaoCopiar(k.loader, "Copiar o código do GTM")]));
        var principal = g.id === k.plataforma;
        add(guias, principal
          ? el("div", { class: "cartao" }, [el("h3", {}, ["Passo a passo: " + g.nome + " ", el("span", { class: "selo ok", text: "detectado no seu site" })])].concat(corpo))
          : el("details", { class: "cartao" }, [el("summary", { text: g.nome })].concat(corpo)));
      });
      var resultado = el("div");
      function verificar() {
        resultado.textContent = "";
        add(resultado, el("p", { class: "muted", text: "Lendo a página publicada…" }));
        api("POST", "/api/verificar").then(function (v) {
          resultado.textContent = "";
          add(resultado,
            el("ul", { class: "checks" }, [
              el("li", { class: v.pagina ? "" : "nao", text: v.pagina ? "A linha do agente está na página inicial do site." : "A linha do agente ainda não aparece na página inicial." }),
              el("li", { class: v.servico ? "" : "nao", text: v.servico ? "O serviço do agente respondeu (IA: " + ((v.saude && v.saude.ia) || "nenhuma") + ")." : "O serviço do agente não respondeu." }),
            ]),
            v.avisos.length ? el("ul", {}, v.avisos.map(function (x) { return el("li", { class: "pequeno", text: x }); })) : null,
            v.ok ? el("p", { class: "aviso ok", text: "Tudo certo! Abra o site e converse com o agente." }) : null,
          );
        }).catch(falha);
      }
      add(area,
        el("div", { class: "cartao" }, [
          el("h3", { text: "1 linha no seu site" }),
          el("p", { class: "muted", text: "Cole antes de </body> (ou no campo de código do rodapé da sua plataforma). O agente aparece em todas as páginas que tiverem a linha." }),
          el("pre", { class: "codigo", text: k.tags }),
          el("div", { class: "linha" }, [botaoCopiar(k.tags, "Copiar a linha")]),
          el("p", { class: "muted pequeno" }, ["Agente em ", el("a", { href: k.servico, target: "_blank", rel: "noopener", text: k.servico }), ". Se o site usa Content-Security-Policy, a verificação abaixo diz o que liberar."]),
        ]),
        guias,
        el("div", { class: "cartao" }, [
          el("h3", { text: "Conferir" }),
          el("div", { class: "linha" }, [
            el("button", { class: "btn sec", type: "button", text: "Ver prévia no meu site", onclick: function () { api("POST", "/api/previa").then(function (p) { status("Prévia aberta no navegador: " + p.url); }).catch(falha); } }),
            el("button", { class: "btn pri", type: "button", text: "Verificar instalação", onclick: verificar }),
          ]),
          resultado,
        ]),
        el("details", { class: "cartao" }, [
          el("summary", { text: "Remover o agente do site" }),
          el("p", { class: "muted pequeno", text: "Apague a linha do site (ou desative o plugin) e clique abaixo para apagar o serviço na Cloudflare." }),
          el("button", { class: "btn perigo", type: "button", text: "Remover o agente (apagar o serviço)", onclick: function () {
            if (!confirm("Apagar o serviço do agente na Cloudflare? O botão do agente some do site (se a linha ainda estiver lá, ela só deixa de funcionar).")) return;
            api("POST", "/api/servico/remover").then(function () { status("Serviço apagado. Lembre de tirar a linha do site."); return recarregar(); }).catch(falha);
          } }),
        ]),
      );
    }).catch(function (err) { area.textContent = ""; add(area, el("p", { class: "aviso erro", text: err.message })); });
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
    if (e.modo === "url") {
      usarFluxo("site");
      S.max = e.instalacao ? idx("teste") : e.analise ? idx("publicar") : e.info ? idx("raiox") : 0;
      ir(0);
      return;
    }
    if (e.instalacao) S.max = idx("etapa2");
    else if (e.analise) S.max = idx("instalacao");
    else if (e.info) S.max = idx("pasta");
    if (e.sessao && e.sessao.status === "rodando") { S.max = idx("etapa2"); ir(S.max); return; }
    ir(0);
  }).catch(falha);
})();
