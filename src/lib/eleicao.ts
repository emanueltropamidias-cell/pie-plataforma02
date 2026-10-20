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
// Um lugar só decide qual foto o candidato mostra. Antes a regra estava
// escrita duas vezes no painel (card e lista de busca) como
// `numero === 1022 || nome contém "talita"` — o que dava o rosto da Talita a
// toda Talita do país e a qualquer 1022 de outro estado.

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
  if (ehDaCasa(c) && CANDIDATO.fotoUrna) return CANDIDATO.fotoUrna;
  // Já no Storage (scripts/subir-fotos-urna.mjs): endereço direto.
  if (c.foto_url?.includes(".supabase.co/storage/")) return c.foto_url;
  // Fora dele, o proxy tenta o TSE — que recusa acesso direto do navegador.
  if (c.sq_candidato) {
    const q = new URLSearchParams({ ano: String(c.ano), sq: c.sq_candidato, uf: c.uf });
    return `/api/eleicao/foto?${q}`;
  }
  return null;
}

const CARGOS_MUNICIPAIS = new Set(["PREFEITO", "VICE-PREFEITO", "VEREADOR"]);

/** Onde a candidatura foi disputada: a cidade no cargo municipal, a UF no resto. */
export function ondeDisputa(c: { cargo: string; uf: string; nm_ue?: string | null }) {
  return CARGOS_MUNICIPAIS.has(c.cargo) && c.nm_ue ? `${c.nm_ue} · ${c.uf}` : c.uf;
}
