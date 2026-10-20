// A RAIZ CONTINUA — Estratégia 1 da meta de 120 mil votos.
// Triplicar os votos nos 15 maiores municípios (base TSE 2022).
// Dados fixos; os cadastros contam ao vivo da tabela liderancas por município.

export function normCidade(s: string | null | undefined) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export type CidadeRaiz = {
  municipio: string;
  mesorregiao: string;
  votos2022: number;
  metaX3: number;
  teste?: boolean;
};

// ── AS CIDADES DA META VÊM DO BANCO DE CADA INSTALAÇÃO ─────────────────────
//
// Estavam escritas aqui: os 15 municípios da Talita, a votação dela de 2022 e
// a meta de 47.964. É ESTRATÉGIA DELA, não régua do sistema — mas, no código
// que as duas instalações compartilham, aparecia igual na plataforma do
// Manassés, com os municípios dela e uma meta que não é dele.
//
// Agora saem de `meta_municipio`, congeladas por candidato em
// `src/dados/<candidato>/meta-2026.json`.
//
// LISTA VAZIA É ESTADO NORMAL de instalação nova, e não defeito: a tela mostra
// que não há meta definida, em vez de mostrar a meta de outra pessoa.
import metaTalita from "@/dados/talita/meta-2026.json";
import metaManasses from "@/dados/manasses/meta-2026.json";

type LinhaMeta = {
  municipio: string;
  mesorregiao: string | null;
  votos_base: number;
  meta: number;
};

const META_POR_CANDIDATO: Record<string, LinhaMeta[]> = {
  talita: metaTalita as LinhaMeta[],
  manasses: metaManasses as LinhaMeta[],
};

const QUAL_META = process.env.NEXT_PUBLIC_CANDIDATO_DADOS?.trim() || "talita";

export const RAIZ_15: CidadeRaiz[] = (
  META_POR_CANDIDATO[QUAL_META] ?? metaTalita
).map((m) => ({
  municipio: m.municipio,
  mesorregiao: m.mesorregiao ?? "",
  votos2022: m.votos_base,
  metaX3: m.meta,
}));

export const VOTOS_2022_15 = RAIZ_15.reduce((s, c) => s + c.votos2022, 0);
export const META_RAIZ = RAIZ_15.reduce((s, c) => s + c.metaX3, 0);

/**
 * As regiões em que a meta é agrupada, e o peso de verba de cada uma.
 *
 * Sai da PRÓPRIA lista de cidades, e não de uma lista fixa: com a lista fixa,
 * a instalação sem meta desenhava quatro regiões vazias, e a que tivesse uma
 * região fora dessas quatro perdia as cidades dela sem avisar.
 *
 * O peso continua vindo da tabela abaixo quando a região é conhecida; região
 * nova entra com peso zero, aparecendo na tela em vez de sumir.
 */
const PESO_CONHECIDO: Record<string, number> = {
  RMS: 40,
  "Centro-Sul": 20,
  Sul: 20,
  "Norte/Oeste": 15,
};

export const MESORREGIOES: { nome: string; verbaPct: number }[] = [
  ...new Set(RAIZ_15.map((c) => c.mesorregiao).filter(Boolean)),
].map((nome) => ({ nome, verbaPct: PESO_CONHECIDO[nome] ?? 0 }));
