import { MUNICIPIOS_BA } from "./municipios-ba";

// Confere o que está escrito na base contra os 417 municípios oficiais.
//
// Fazer isso aqui, e não no banco, tira o SQL do caminho: a plataforma já tem
// os nomes agrupados e a lista oficial, então ela mesma aponta o que está
// errado e sugere a grafia certa.

export type Divergencia = {
  valor: string;
  pessoas: number;
  sugestao: string | null;
  /** 0 a 1. Perto de 1 é quase certeza; perto de 0.7 pede olho humano. */
  confianca: number;
};

export function chave(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const OFICIAIS = new Map(MUNICIPIOS_BA.map((n) => [chave(n), n]));

// Abreviações que aparecem em base de cadastro feita à mão.
const ABREVIACOES: [RegExp, string][] = [
  [/\bsto\b/g, "santo"],
  [/\bsta\b/g, "santa"],
  [/\bs\b/g, "sao"],
  [/\bant[o]?\b/g, "antonio"],
  [/\bn ?sra?\b/g, "nossa senhora"],
  [/\bdr\b/g, "doutor"],
  [/\bpres\b/g, "presidente"],
  [/\bgov\b/g, "governador"],
];

/** Distância de edição, para achar a grafia oficial mais próxima. */
function distancia(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let linha = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const nova = [i];
    for (let j = 1; j <= n; j++) {
      nova[j] = Math.min(
        linha[j] + 1,
        nova[j - 1] + 1,
        linha[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    linha = nova;
  }
  return linha[n];
}

function maisParecido(k: string) {
  let melhor: { nome: string; conf: number } | null = null;
  for (const [ko, nome] of OFICIAIS) {
    // Diferença grande de tamanho não vira erro de digitação: pula cedo.
    if (Math.abs(ko.length - k.length) > 4) continue;
    const d = distancia(k, ko);
    const conf = 1 - d / Math.max(k.length, ko.length);
    if (!melhor || conf > melhor.conf) melhor = { nome, conf };
  }
  return melhor;
}

/** Recebe os nomes como estão na base, devolve o que não é município da Bahia. */
export function conferir(nomes: { municipio: string; qtd: number }[]): Divergencia[] {
  const fora: Divergencia[] = [];

  for (const { municipio, qtd } of nomes) {
    const bruto = (municipio ?? "").trim();
    if (!bruto) continue;

    const k = chave(bruto);
    const oficial = OFICIAIS.get(k);

    // Bate com a lista: só a caixa ou o acento estavam diferentes.
    if (oficial) {
      if (oficial !== bruto) {
        fora.push({ valor: bruto, pessoas: qtd, sugestao: oficial, confianca: 1 });
      }
      continue;
    }

    let expandido = k;
    for (const [de, para] of ABREVIACOES) expandido = expandido.replace(de, para);
    expandido = expandido.replace(/\s+/g, " ").trim();

    const porAbreviacao = OFICIAIS.get(expandido);
    if (porAbreviacao) {
      fora.push({ valor: bruto, pessoas: qtd, sugestao: porAbreviacao, confianca: 0.95 });
      continue;
    }

    const perto = maisParecido(expandido);
    fora.push({
      valor: bruto,
      pessoas: qtd,
      sugestao: perto && perto.conf >= 0.78 ? perto.nome : null,
      confianca: perto?.conf ?? 0,
    });
  }

  // Primeiro o que afeta mais gente.
  return fora.sort((a, b) => b.pessoas - a.pessoas);
}
