import { CANDIDATO } from "./candidato";
import { VOTOS_TALITA } from "./votos-talita";
import { VOTOS_BAIRRO } from "./votos-bairros";
import { VOTOS_ZONA, zonasDe, totalDaZona } from "./votos-zonas";

// A eleição de 2022 num lugar só.
//
// Os dados chegam em três níveis e em ritmos diferentes: o município inteiro já
// existe para toda a Bahia; bairro e zona entram um a um, conforme saem do TSE.
// Este arquivo existe para que a tela nunca precise adivinhar o que tem e o que
// não tem — ela pergunta, e recebe ou o número ou a ausência declarada.
//
// Regra da casa, e ela vale também para a análise por IA: nada aqui estima. Se
// o bairro não foi importado, a resposta é "não temos", não uma proporção
// calculada em cima do município. Número inventado num painel de campanha vira
// dinheiro gasto no lugar errado.

export type BairroVoto = { nome: string; votos: number };

export const TOTAL_VOTOS = Object.values(VOTOS_TALITA).reduce((s, v) => s + v, 0);
export const MUNICIPIOS_COM_VOTO = Object.keys(VOTOS_TALITA).length;

export function chave(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const POR_CHAVE = new Map(Object.entries(VOTOS_TALITA).map(([n, v]) => [chave(n), v]));

/** Votos do município em 2022. Zero quando não houve voto registrado. */
export function votosDe(municipio: string) {
  return POR_CHAVE.get(chave(municipio)) ?? 0;
}

/** Bairros já importados, do maior para o menor. Lista vazia = não importado. */
export function bairrosDe(municipio: string): BairroVoto[] {
  const mapa = VOTOS_BAIRRO[municipio];
  if (!mapa) return [];
  return Object.entries(mapa)
    .map(([nome, votos]) => ({ nome, votos }))
    .sort((a, b) => b.votos - a.votos || a.nome.localeCompare(b.nome, "pt-BR"));
}

export { zonasDe, totalDaZona, VOTOS_ZONA };

/** Municípios com detalhe de bairro já importado. */
export const DETALHADOS = Object.keys(VOTOS_BAIRRO);

/**
 * Quanto da votação já está detalhada por bairro.
 *
 * É o número que diz até onde a aba pode ser levada a sério hoje. Fica visível
 * na tela de propósito: uma análise sobre 17% da votação apresentada como se
 * fosse sobre o todo é pior do que análise nenhuma.
 */
export function cobertura() {
  const detalhados = DETALHADOS.map((m) => ({ municipio: m, votos: votosDe(m) }));
  const votosDetalhados = detalhados.reduce((s, d) => s + d.votos, 0);
  const comZona = Object.keys(VOTOS_ZONA);
  return {
    municipios: detalhados.length,
    votosDetalhados,
    pct: TOTAL_VOTOS > 0 ? (votosDetalhados / TOTAL_VOTOS) * 100 : 0,
    municipiosComZona: comZona.length,
    lista: detalhados.sort((a, b) => b.votos - a.votos),
  };
}

/**
 * Confere a soma dos bairros contra o total do município.
 *
 * Foi o que provou que Salvador estava completa: 146 bairros somando 5.720, o
 * mesmo que já constava por município. Quando não bater, a tela precisa dizer —
 * senão o mapa fica bonito em cima de dado furado.
 */
export function conferirBairros(municipio: string) {
  const bairros = bairrosDe(municipio);
  const soma = bairros.reduce((s, b) => s + b.votos, 0);
  const total = votosDe(municipio);
  return { soma, total, bate: soma === total, diferenca: total - soma, quantos: bairros.length };
}

/** Os municípios com mais voto, para a lista ao lado do mapa. */
export function topMunicipios(n = 15) {
  return Object.entries(VOTOS_TALITA)
    .map(([municipio, votos]) => ({ municipio, votos }))
    .sort((a, b) => b.votos - a.votos)
    .slice(0, n);
}

// ── FOTO DE URNA ────────────────────────────────────────────────────────────
//
// Um lugar só decide qual foto o candidato mostra: a OFICIAL do TSE daquela
// eleição, para todos — inclusive a candidata da casa. Ela já teve exceção
// aqui, com uma arte de campanha no lugar da foto de urna; a foto muda de uma
// eleição para outra, e o painel compara eleições.

type CandidatoComFoto = {
  ano: number;
  uf: string;
  numero: number;
  sq_candidato?: string | null;
  foto_url: string | null;
};

/** É a candidatura da casa: mesmo estado e mesmo número de urna. */
export function ehDaCasa(c: { uf: string; numero: number }) {
  return c.uf === CANDIDATO.uf && String(c.numero) === CANDIDATO.numeroUrna;
}

export function fotoDoCandidato(c: CandidatoComFoto): string | null {
  // A API já devolve o endereço certo: o Storage (Bahia) ou a foto direto do
  // TSE (src/lib/eleicao-arquivos.ts). Esta função mandava tudo que não fosse
  // Storage para /api/eleicao/foto — que roda no servidor, e o TSE bloqueia
  // servidor sempre. Por isso o card principal mostrava o boneco cinza enquanto
  // a lista, que usava o endereço direto, mostrava a foto.
  return c.foto_url ?? null;
}

const CARGOS_MUNICIPAIS = new Set(["PREFEITO", "VICE-PREFEITO", "VEREADOR"]);

/** Onde a candidatura foi disputada: a cidade no cargo municipal, a UF no resto. */
export function ondeDisputa(c: { cargo: string; uf: string; nm_ue?: string | null }) {
  return CARGOS_MUNICIPAIS.has(c.cargo) && c.nm_ue ? `${c.nm_ue} · ${c.uf}` : c.uf;
}

export type TomResultado = "eleito" | "segundo" | "suplente" | "nao" | "anulado" | "outro";

/**
 * O resultado da candidatura, como o TSE totalizou (DS_SIT_TOT_TURNO).
 *
 * O selo do painel mostrava a situação com um ponto verde piscando para
 * qualquer valor — "NÃO ELEITO" e "#NULO" (candidatura sem voto válido, em
 * geral indeferida) pareciam tão bem quanto "ELEITO".
 */
export function resultadoDe(situacao: string | null | undefined): { rotulo: string; tom: TomResultado } {
  const s = (situacao ?? "").toUpperCase().trim();
  if (s === "ELEITO POR QP") return { rotulo: "Eleito por quociente", tom: "eleito" };
  if (s === "ELEITO POR MÉDIA") return { rotulo: "Eleito por média", tom: "eleito" };
  if (s === "ELEITO") return { rotulo: "Eleito", tom: "eleito" };
  if (s === "2º TURNO") return { rotulo: "Foi ao 2º turno", tom: "segundo" };
  if (s === "SUPLENTE") return { rotulo: "Suplente", tom: "suplente" };
  if (s === "NÃO ELEITO") return { rotulo: "Não eleito", tom: "nao" };
  if (!s || s === "#NULO" || s === "#NE") return { rotulo: "Sem resultado (candidatura sem voto válido)", tom: "anulado" };
  return { rotulo: s.charAt(0) + s.slice(1).toLowerCase(), tom: "outro" };
}

export const CLASSE_RESULTADO: Record<TomResultado, string> = {
  eleito: "border-emerald-200/60 bg-emerald-50 text-emerald-700",
  segundo: "border-blue-200/60 bg-blue-50 text-blue-700",
  suplente: "border-amber-200/60 bg-amber-50 text-amber-700",
  nao: "border-tinta-200 bg-tinta-100 text-tinta-600",
  anulado: "border-rose-200/60 bg-rose-50 text-rose-700",
  outro: "border-tinta-200 bg-tinta-100 text-tinta-600",
};

/** Cargo eleito pelo sistema proporcional (quociente eleitoral). */
export const CARGOS_PROPORCIONAIS = new Set(["DEPUTADO FEDERAL", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL", "VEREADOR"]);
