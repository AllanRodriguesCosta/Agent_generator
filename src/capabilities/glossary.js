// Glossário de interações do site. Ele não executa nada: apenas classifica rotas e formulários
// encontrados pelo raio X/observação como capacidades candidatas que começam bloqueadas.
import { normalize } from "../agent/text.js";

const PAYMENT = /\b(pagamento|payment|checkout|carrinho|cart|pix|cartao|card|cobranca|billing|assinatura|subscription)\b/;
const ACCOUNT = /\b(conta|accounts?|perfil|profiles?|pedidos?|orders?|compras?|agendamentos?|appointments?|reservas?|bookings?|usuarios?|users?)\b/;
const AUTH = /\b(login|logout|auth|senha|password|token|sessao|session|cadastro|register)\b/;
const PERSONAL = /\b(e[\s_-]?mail|telefone|phone|celular|endereco|address|cpf|cnpj|documento|birth|nascimento|cep|zip)\b/;
const DESTRUCTIVE = /\b(delete|excluir|remover|cancelar|cancel|refund|estornar)\b/;

const safePath = (value) => {
  const v = String(value || "").trim();
  return /^\/(?!\/)[^\s"'<>]*$/.test(v) ? v.slice(0, 300) : "";
};
const safeMethod = (value) => ["GET", "POST", "PUT", "PATCH", "DELETE"].includes(String(value || "").toUpperCase()) ? String(value).toUpperCase() : "";
const safeFields = (fields) =>
  [...new Set((Array.isArray(fields) ? fields : []).map((field) => String(field || "").replace(/\s+/g, " ").trim().slice(0, 60)).filter(Boolean))].slice(0, 20);

export function classifyInteraction({ metodo, caminho, campos = [] } = {}) {
  const method = safeMethod(metodo);
  const path = safePath(caminho);
  const text = normalize([path, ...safeFields(campos)].join(" "));
  if (!method || !path) return null;
  if (PAYMENT.test(text)) return { categoria: "pagamento", risco: "critico", motivo: "Pode envolver cobrança, preço, checkout ou meio de pagamento." };
  if (DESTRUCTIVE.test(text)) return { categoria: "alteracao", risco: "critico", motivo: "Pode cancelar, excluir ou alterar um registro." };
  if (AUTH.test(text)) return { categoria: "autenticacao", risco: "alto", motivo: "Pode envolver login, sessão, senha ou credencial." };
  if (ACCOUNT.test(text)) return { categoria: "dados_da_conta", risco: "alto", motivo: "Pode acessar informações de uma conta ou registro individual." };
  if (PERSONAL.test(text)) return { categoria: "dados_pessoais", risco: "alto", motivo: "Pode coletar ou tratar dados pessoais." };
  if (method !== "GET") return { categoria: "escrita", risco: "alto", motivo: "Usa método que pode criar ou alterar dados." };
  return { categoria: "consulta", risco: "medio", motivo: "Consulta encontrada; confirme se o conteúdo é público antes de liberar." };
}

export function candidateInteraction({ id, origem = "raio_x", metodo, caminho, campos = [] } = {}) {
  const method = safeMethod(metodo);
  const path = safePath(caminho);
  const rule = classifyInteraction({ metodo: method, caminho: path, campos });
  if (!rule) return null;
  const key = String(id || `${method}-${path}`).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
  return { id: key || "interacao", origem: origem === "observacao" ? "observacao" : "raio_x", metodo: method, caminho: path, campos: safeFields(campos), ...rule, estado: "bloqueada" };
}

export function candidatesFromReport(report = {}) {
  const found = [];
  for (const route of Array.isArray(report.rotas) ? report.rotas : []) {
    const candidate = candidateInteraction({ id: `rota-${route.metodo}-${route.caminho}`, metodo: route.metodo, caminho: route.caminho, origem: "raio_x" });
    if (candidate) found.push(candidate);
  }
  for (const form of Array.isArray(report.formularios) ? report.formularios : []) {
    const candidate = candidateInteraction({ id: `form-${form.method}-${form.action}`, metodo: form.method, caminho: form.action, campos: form.campos, origem: "raio_x" });
    if (candidate) found.push(candidate);
  }
  const score = { medio: 1, alto: 2, critico: 3 };
  const unique = new Map();
  for (const candidate of found) {
    const key = `${candidate.metodo} ${candidate.caminho}`;
    const previous = unique.get(key);
    // Formulários trazem nomes de campos e podem revelar que uma rota aparentemente comum trata
    // dados pessoais; por isso vence a classificação de maior risco.
    if (!previous || score[candidate.risco] > score[previous.risco] || (score[candidate.risco] === score[previous.risco] && candidate.campos.length > previous.campos.length)) unique.set(key, candidate);
  }
  return [...unique.values()];
}
