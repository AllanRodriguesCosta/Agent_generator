// Versão 0.4: frases que o agente não entendeu, guardadas sem dado pessoal. Mesmo cuidado do
// assistente da Violet Voltage: e-mail, telefone, CPF/CNPJ, códigos e números longos viram
// marcadores antes de sair do navegador ou de ir para o arquivo do servidor.
export function anonymize(text) {
  return String(text ?? "")
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[e-mail]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[documento]")
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, "[documento]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, "[código]")
    .replace(/#?\b(?=[0-9a-z]*\d)[0-9a-z]{6,12}\b/gi, (m) => (/[a-z]/i.test(m) && /\d/.test(m) ? "[código]" : m))
    .replace(/\(?\d[\d\s().-]{7,}\d/g, "[número]")
    .replace(/\b\d{6,}\b/g, "[número]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}
// Respostas que contam como "não entendi" (inclui o palpite fraco "talvez isto ajude").
export const isMiss = (r) => r && (r.intencao === "nao_entendi" || /-provavel$/.test(r.intencao || "") || r.intencao === "mais_sem_contexto");
