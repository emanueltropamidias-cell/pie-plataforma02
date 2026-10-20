// Gera os dados de eleição de UMA instalação, do banco para o repositório.
//
//   node scripts/gerar-dados-eleicao.mjs --candidato=manasses
//
// ── POR QUE ARQUIVO, SE O DADO JÁ ESTÁ NO BANCO ─────────────────────────────
//
// O mapa, o gráfico de regiões e o placar de metas são componentes de
// NAVEGADOR, e leem os votos no momento em que desenham. Para lerem do banco,
// os três teriam de receber tudo por propriedade, vindo de um componente de
// servidor — refatoração em nove arquivos, no mapa de uma campanha no ar.
//
// Votação de 2022 é dado que NÃO MUDA. Congelá-la num arquivo por candidato
// tem o mesmo efeito prático e nenhum risco: o banco continua sendo a fonte
// (é dele que este script lê), e o arquivo é o retrato commitado.
//
// O que se ganha é o que importa: cada instalação passa a ler os SEUS números.

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const { conexao, candidato } = escolherBanco({ raiz: RAIZ });
const c = new pg.Client(conexao);
await c.connect();

const pasta = resolve(RAIZ, "src/dados", candidato);
mkdirSync(pasta, { recursive: true });

const votos = (await c.query(`select public.votos_por_municipio(2022) j`)).rows[0].j;
writeFileSync(
  resolve(pasta, "votos-2022.json"),
  `${JSON.stringify(votos.por_municipio, null, 1)}\n`,
);
console.log(`  votos-2022.json   ${votos.municipios} municípios, ${Number(votos.total).toLocaleString("pt-BR")} votos`);

const meta = (await c.query(`select public.placar_meta(2026) j`)).rows[0].j;
writeFileSync(
  resolve(pasta, "meta-2026.json"),
  `${JSON.stringify(meta.cidades, null, 1)}\n`,
);
console.log(`  meta-2026.json    ${meta.cidades.length} cidades, meta ${Number(meta.meta_total).toLocaleString("pt-BR")}`);

const bairros = (await c.query(`select public.votos_por_bairro('Salvador', 2022) j`)).rows[0].j;
writeFileSync(
  resolve(pasta, "bairros-2022.json"),
  `${JSON.stringify({ Salvador: bairros.bairros }, null, 1)}\n`,
);
const fecha = String(bairros.total_pelos_bairros) === String(bairros.total_do_municipio);
console.log(
  `  bairros-2022.json ${Object.keys(bairros.bairros).length} bairros, ` +
    `${Number(bairros.total_pelos_bairros).toLocaleString("pt-BR")} votos — ` +
    (fecha ? "fecha com o município" : "*** NÃO FECHA com o município ***"),
);

await c.end();
