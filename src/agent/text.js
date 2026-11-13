// Pré-processamento em português: normalização, tokens, palavras vazias e radicalização leve.
// Sem bibliotecas: o agente funciona sem internet e sem custo, no navegador ou no Node.
// Origem: assistente da Violet Voltage (github.com/AllanRodriguesCosta/violet-voltage-ecommerce).

export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[“”"'´`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// Vogal final alongada ("oii", "obrigadooo") vira uma só.
export const tokens = (value) =>
  normalize(value)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((t) => t.replace(/([aeiou])\1+$/, "$1"));

// Palavras sem valor para a intenção. "nao", "mais" e "quero" ficam: mudam o sentido.
export const STOPWORDS = new Set(
  "a o as os um uma uns umas de da do das dos em no na nos nas num numa para pra pro pros pras por pelo pela pelos pelas com e ou que se como me eu voce vc te tu ele ela eles elas isso esse essa este esta aqui ai la ja sou estou ta to entao tipo ne lhe meu minha meus minhas seu sua seus suas".split(" "),
);

// Radicalizador leve inspirado no RSLP: plural, sufixos comuns, terminações verbais e vogal final.
const PLURAL = [["coes", "cao"], ["soes", "sao"], ["oes", "ao"], ["aes", "ao"], ["ais", "al"], ["eis", "el"], ["ois", "ol"], ["res", "r"], ["ns", "m"], ["s", ""]];
const SUFFIX = ["mente", "inhos", "inhas", "inho", "inha", "issimo", "issima", "ando", "endo", "indo", "aria", "eria", "iria", "ia", "amos", "emos", "imos", "aram", "eram", "iram", "am", "em", "ar", "er", "ir", "ei", "ou"];
export function stem(word) {
  let w = word;
  if (w.length <= 3 || /\d/.test(w)) return w;
  for (const [end, repl] of PLURAL)
    if (w.endsWith(end) && !w.endsWith("ss") && w.length - end.length >= 3) {
      w = w.slice(0, -end.length) + repl;
      break;
    }
  for (const end of SUFFIX)
    if (w.endsWith(end) && w.length - end.length >= 3) {
      w = w.slice(0, -end.length);
      break;
    }
  if (w.length >= 4 && /[aeio]$/.test(w)) w = w.slice(0, -1);
  return w;
}

// Atributos usados pelo classificador: radicais sem palavras vazias e pares vizinhos.
export function features(value) {
  const stems = tokens(value)
    .filter((t) => !STOPWORDS.has(t))
    .map(stem);
  const pairs = stems.slice(1).map((s, i) => `${stems[i]}_${s}`);
  return [...stems, ...pairs];
}
