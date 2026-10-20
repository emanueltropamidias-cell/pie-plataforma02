// A votação do candidato DESTA instalação, por município.
//
// ── ISTO ERA UM ARQUIVO COM OS NÚMEROS DA TALITA ────────────────────────────
//
// Eram 415 municípios escritos à mão em TypeScript. Com uma campanha só, era
// apenas feio. Com duas instalações rodando do MESMO repositório, virou
// defeito: a plataforma do Manassés abria mostrando o mapa de cobertura DELA,
// as metas DELA e o total de votos DELA — com o banco dele vazio.
//
// Nada no banco estava errado. O número nunca foi dado: era código.
//
// ── DE ONDE VÊM OS NÚMEROS AGORA ────────────────────────────────────────────
//
// Da tabela `votos_candidato`, de cada banco, congelados em
// `src/dados/<candidato>/votos-2022.json` por `scripts/gerar-dados-eleicao.mjs`.
//
// O congelamento não é preguiça. O mapa e o gráfico de regiões são componentes
// de NAVEGADOR e leem os votos na hora de desenhar; para lerem do banco, os
// dois teriam de receber tudo por propriedade — refatoração em nove arquivos,
// no mapa de uma campanha no ar. Votação de 2022 é dado que não muda, então o
// retrato tem o mesmo efeito e nenhum risco.
//
// Trocar de candidato é trocar `NEXT_PUBLIC_CANDIDATO_DADOS`. Sem ela, é a
// Talita — que é a instalação que já existia.

import talita from "@/dados/talita/votos-2022.json";
import manasses from "@/dados/manasses/votos-2022.json";

// O mapa precisa ser ESTÁTICO: importação calculada em tempo de execução o
// empacotador não resolve, e o arquivo não entraria no pacote.
const POR_CANDIDATO: Record<string, Record<string, number>> = {
  talita,
  manasses,
};

const QUAL = process.env.NEXT_PUBLIC_CANDIDATO_DADOS?.trim() || "talita";

/**
 * Município -> votos, do candidato desta instalação.
 *
 * O nome mantém "TALITA" por enquanto porque ele aparece em nove arquivos;
 * renomear tudo no mesmo commit que troca a origem misturaria duas mudanças
 * numa só, e uma delas mexe no mapa de uma campanha no ar.
 */
export const VOTOS_TALITA: Record<string, number> =
  POR_CANDIDATO[QUAL] ?? talita;

export const VOTOS_TOTAL = Object.values(VOTOS_TALITA).reduce((s, v) => s + v, 0);
