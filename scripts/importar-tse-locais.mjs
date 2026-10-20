// Votos de TODO candidato por local de votação e bairro, nas cidades-foco.
//
//   node scripts/importar-tse-locais.mjs --ano=2024                      só conta
//   node scripts/importar-tse-locais.mjs --ano=2024 --confirmo           grava
//   node scripts/importar-tse-locais.mjs --ano=2024 --cidades=SALVADOR,FEIRA\ DE\ SANTANA
//
// ── POR QUE EXISTE ───────────────────────────────────────────────────────────
//
// A camada municipal do painel mostrava, para qualquer candidato, as zonas e
// os bairros da Talita em 2022 — os únicos que existiam, escritos no código.
// Aqui o detalhe sai do TSE para todos:
//
//   votacao_secao_<ano>_<UF>       voto de cada candidato em cada seção, com o
//                                  número do local de votação
//   eleitorado_local_votacao_<ano> o bairro de cada local
//
// Gravado por LOCAL (não por seção) em `eleicao_votos_detalhe`. Só nas
// cidades pedidas: o estado inteiro passaria de milhões de linhas.
//
// ── A CONFERÊNCIA ────────────────────────────────────────────────────────────
//
// No fim, a soma por local de cada candidato é comparada com o total dele na
// cidade em `eleicao_votos_municipio`. Diferença aparece na tela, não some.

import { mkdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";
import { garantirArquivo, streamCsvDoZip } from "./tse-csv.mjs";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = resolve(RAIZ, ".cache/tse");
mkdirSync(CACHE_DIR, { recursive: true });

const args = process.argv.slice(2);
const arg = (n, p) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim() ?? p;
const ano = parseInt(arg("ano", "2022"), 10);
const uf = arg("uf", "BA").toUpperCase();
const cidades = new Set(arg("cidades", "SALVADOR").split(",").map((c) => c.trim().toUpperCase()));
const gravar = args.includes("--confirmo");

const BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";
const zipSecao = garantirArquivo(CACHE_DIR, `votacao_secao_${ano}_${uf}.zip`, `${BASE}/votacao_secao/votacao_secao_${ano}_${uf}.zip`);
const zipLocais = garantirArquivo(
  CACHE_DIR,
  `eleitorado_local_votacao_${ano}.zip`,
  `${BASE}/eleitorado_locais_votacao/eleitorado_local_votacao_${ano}.zip`,
);

// 1. Bairro de cada local, das cidades pedidas.
const local = new Map();
// Até 2024 o TSE publica um CSV só para o país; em 2026 passou a separar por
// estado dentro do mesmo zip.
const dentro = execSync(`unzip -Z1 "${zipLocais}"`).toString().split("\n");
const csvLocais = dentro.includes(`eleitorado_local_votacao_${ano}_${uf}.csv`)
  ? `eleitorado_local_votacao_${ano}_${uf}.csv`
  : `eleitorado_local_votacao_${ano}.csv`;
await streamCsvDoZip(zipLocais, csvLocais, (c, h) => {
  if (c[h.indexOf("SG_UF")] !== uf) return;
  if (!cidades.has(c[h.indexOf("NM_MUNICIPIO")]?.toUpperCase())) return;
  const k = `${c[h.indexOf("CD_MUNICIPIO")]}_${c[h.indexOf("NR_ZONA")]}_${c[h.indexOf("NR_LOCAL_VOTACAO")]}`;
  if (!local.has(k)) local.set(k, { nome: c[h.indexOf("NM_LOCAL_VOTACAO")], bairro: c[h.indexOf("NM_BAIRRO")] });
});
console.log(`${local.size} locais de votação em ${[...cidades].join(", ")}`);

// 2. Voto por local, de cada candidato.
const porLocal = new Map();
await streamCsvDoZip(zipSecao, `votacao_secao_${ano}_${uf}.csv`, (c, h) => {
  const municipio = c[h.indexOf("NM_MUNICIPIO")];
  if (!cidades.has(municipio?.toUpperCase())) return;
  const sq = c[h.indexOf("SQ_CANDIDATO")];
  const votos = parseInt(c[h.indexOf("QT_VOTOS")], 10) || 0;
  // Branco, nulo e legenda vêm com sequencial -1 ou vazio.
  if (!sq || sq.startsWith("-") || votos <= 0) return;
  const turno = parseInt(c[h.indexOf("NR_TURNO")], 10) || 1;
  const cod = c[h.indexOf("CD_MUNICIPIO")];
  const zona = parseInt(c[h.indexOf("NR_ZONA")], 10);
  const nrLocal = parseInt(c[h.indexOf("NR_LOCAL_VOTACAO")], 10);
  const k = `${sq}_${turno}_${cod}_${zona}_${nrLocal}`;
  const atual = porLocal.get(k);
  if (atual) atual.votos += votos;
  else {
    const l = local.get(`${cod}_${zona}_${nrLocal}`);
    porLocal.set(k, {
      sq, turno, cod, municipio, zona, nrLocal, votos,
      nome: l?.nome ?? c[h.indexOf("NM_LOCAL_VOTACAO")],
      bairro: l?.bairro ?? null,
    });
  }
});
const semBairro = [...porLocal.values()].filter((v) => !v.bairro).length;
console.log(`${porLocal.size} linhas candidato × local (${semBairro} sem bairro no cadastro de locais)`);

if (!gravar) {
  console.log("Sem --confirmo: nada gravado.");
  process.exit(0);
}

const { conexao } = escolherBanco({ raiz: RAIZ });
const cliente = new pg.Client({ ...conexao, ssl: { rejectUnauthorized: false } });
await cliente.connect();

const { rows } = await cliente.query(
  `select id, turno, sq_candidato from public.eleicao_candidatos where ano = $1 and uf = $2`,
  [ano, uf],
);
const idPor = new Map(rows.map((r) => [`${r.sq_candidato}_${r.turno}`, r.id]));

const col = { cand: [], turno: [], mun: [], cod: [], zona: [], nr: [], nome: [], bairro: [], votos: [] };
let semCandidato = 0;
for (const v of porLocal.values()) {
  const id = idPor.get(`${v.sq}_${v.turno}`);
  if (!id) {
    semCandidato++;
    continue;
  }
  col.cand.push(id);
  col.turno.push(v.turno);
  col.mun.push(v.municipio);
  col.cod.push(v.cod);
  col.zona.push(v.zona);
  col.nr.push(v.nrLocal);
  col.nome.push(v.nome);
  col.bairro.push(v.bairro);
  col.votos.push(v.votos);
}

const LOTE = 5000;
for (let i = 0; i < col.cand.length; i += LOTE) {
  const f = (a) => a.slice(i, i + LOTE);
  await cliente.query(
    `insert into public.eleicao_votos_detalhe
       (candidato_id, ano, turno, uf, municipio, codigo_tse, zona, nr_local, local_votacao, bairro, votos)
     select t.cand, $1, t.turno, $2, t.mun, t.cod, t.zona, t.nr, t.nome, t.bairro, t.votos
       from unnest($3::bigint[], $4::smallint[], $5::text[], $6::text[], $7::int[], $8::int[], $9::text[], $10::text[], $11::int[])
         as t(cand, turno, mun, cod, zona, nr, nome, bairro, votos)
     on conflict (candidato_id, codigo_tse, zona, nr_local)
     do update set votos = excluded.votos, local_votacao = excluded.local_votacao,
                   bairro = excluded.bairro, atualizado_em = now()`,
    [ano, uf, f(col.cand), f(col.turno), f(col.mun), f(col.cod), f(col.zona), f(col.nr), f(col.nome), f(col.bairro), f(col.votos)],
  );
  process.stdout.write(`\r${Math.min(i + LOTE, col.cand.length)}/${col.cand.length}`);
}
console.log(`\n${col.cand.length} gravadas` + (semCandidato ? `, ${semCandidato} sem candidatura no banco` : ""));

// 3. Conferência: soma por local contra o total do município.
const { rows: conf } = await cliente.query(
  `with d as (
     select candidato_id, municipio, sum(votos) s from public.eleicao_votos_detalhe
      where ano = $1 and uf = $2 and municipio = any($3) group by 1, 2
   )
   select count(*) as candidatos,
          count(*) filter (where d.s = v.votos) as fecham,
          coalesce(sum(abs(d.s - v.votos)), 0) as diferenca_total
     from d join public.eleicao_votos_municipio v
       on v.candidato_id = d.candidato_id and v.municipio = d.municipio`,
  [ano, uf, [...cidades]],
);
console.log(
  `Conferência: ${conf[0].fecham} de ${conf[0].candidatos} candidatos fecham com o total da cidade` +
    ` (diferença somada: ${conf[0].diferenca_total} votos)`,
);
await cliente.end();
