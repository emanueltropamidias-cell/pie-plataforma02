// Gera a votação do TSE do BRASIL INTEIRO em arquivos JSON prontos.
//
//   node scripts/gerar-eleicao-arquivos.mjs --ano=2022
//   node scripts/gerar-eleicao-arquivos.mjs --ano=2024 --uf=MG     (um estado só)
//
// Saída em .cache/eleicao-arquivos/<ano>/, que `subir-eleicao-arquivos.mjs`
// manda para o bucket público `eleicao` do Storage.
//
// ── POR QUE ARQUIVO, E NÃO TABELA ───────────────────────────────────────────
//
// Medido em 20/10/2026: só a Bahia ocupava ~330 MB no Postgres (num banco de
// 500 MB, o limite do plano gratuito). O peso não é a informação — são índice,
// cabeçalho de linha e colunas repetidas em cada uma das ~360 mil linhas. O
// Brasil seria 4 a 6 GB.
//
// Voto de eleição passada não muda e é lido sempre do mesmo jeito: "todos os
// votos DESTE candidato". Então vai pronto, um arquivo por candidato, e a
// leitura é um download só. O Storage gratuito tem 1 GB, e o país inteiro
// cabe em uma fração disso.
//
// ── O QUE SAI ───────────────────────────────────────────────────────────────
//
//   <ano>/indice/<UF>.json   candidatos do estado (BR = presidente), para a
//                            busca: [chave, turno, cargo, numero, urna, nome,
//                            partido, situação, unidade, total, municípios,
//                            código da unidade]
//
//   <ano>/c/<chave>.json     eleição geral: votos do candidato por município
//                            e por zona, de cada estado em que teve voto
//
//   <ano>/m/<UF>/<cod>.json  eleição municipal: a cidade inteira, todos os
//                            candidatos dela. São 460 mil candidatos em 2024 —
//                            um arquivo por cidade (5.570) em vez de um por
//                            candidato.
//
// A chave do candidato é SQ_CANDIDATO * 10 + turno: o sequencial se repete no
// 2º turno, e o número cabe inteiro num `number` do JavaScript.

import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { garantirArquivo, streamCsvDoZip } from "./tse-csv.mjs";
import UFS from "../src/lib/ufs.json" with { type: "json" };

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const CACHE = resolve(RAIZ, ".cache/tse");
const args = process.argv.slice(2);
const arg = (n, p) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim() ?? p;
const ano = parseInt(arg("ano", "2022"), 10);
const soUf = arg("uf", "")?.toUpperCase();
const SAIDA = resolve(RAIZ, ".cache/eleicao-arquivos", String(ano));

const municipal = ano % 4 === 0;
const BASE = "https://cdn.tse.jus.br/estatistica/sead/odsele";
const zipCand = garantirArquivo(CACHE, `consulta_cand_${ano}.zip`, `${BASE}/consulta_cand/consulta_cand_${ano}.zip`);
const zipVotos = garantirArquivo(
  CACHE,
  `votacao_candidato_munzona_${ano}.zip`,
  `${BASE}/votacao_candidato_munzona/votacao_candidato_munzona_${ano}.zip`,
);
const noZip = (z) => new Set(execSync(`unzip -Z1 "${z}"`).toString().split("\n"));
const csvCand = noZip(zipCand);
const csvVotos = noZip(zipVotos);

if (!soUf) rmSync(SAIDA, { recursive: true, force: true });
mkdirSync(resolve(SAIDA, "indice"), { recursive: true });
mkdirSync(resolve(SAIDA, "c"), { recursive: true });

const chaveDe = (sq, turno) => Number(sq) * 10 + turno;
const escrever = (rel, obj) => {
  const p = resolve(SAIDA, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(obj));
};

// Presidente mora no arquivo BR e tem voto em todo estado: fica em memória até
// o último estado ser lido.
const nacionais = new Map();

async function lerCandidatos(uf) {
  const nome = `consulta_cand_${ano}_${uf}.csv`;
  const lista = new Map();
  if (!csvCand.has(nome)) return lista;
  await streamCsvDoZip(zipCand, nome, (c, h) => {
    const sq = c[h.indexOf("SQ_CANDIDATO")];
    const numero = parseInt(c[h.indexOf("NR_CANDIDATO")], 10);
    if (!sq || isNaN(numero)) return;
    const turno = parseInt(c[h.indexOf("NR_TURNO")], 10) || 1;
    lista.set(chaveDe(sq, turno), {
      k: chaveDe(sq, turno),
      sq,
      turno,
      uf,
      cargo: c[h.indexOf("DS_CARGO")].toUpperCase(),
      numero,
      urna: c[h.indexOf("NM_URNA_CANDIDATO")],
      nome: c[h.indexOf("NM_CANDIDATO")],
      partido: c[h.indexOf("SG_PARTIDO")],
      situacao: c[h.indexOf("DS_SIT_TOT_TURNO")] || c[h.indexOf("DS_SITUACAO_CANDIDATURA")],
      ue: c[h.indexOf("NM_UE")],
      sgUe: c[h.indexOf("SG_UE")],
      // { UF: { município: votos } } e { UF: { município: { zona: votos } } }
      votos: {},
      zonas: {},
    });
  });
  return lista;
}

function somar(cand, uf, municipio, zona, votos) {
  const m = (cand.votos[uf] ??= {});
  m[municipio] = (m[municipio] ?? 0) + votos;
  if (!isNaN(zona)) {
    const z = ((cand.zonas[uf] ??= {})[municipio] ??= {});
    z[zona] = (z[zona] ?? 0) + votos;
  }
}

function linhaDoIndice(c) {
  let total = 0;
  let municipios = 0;
  for (const porMun of Object.values(c.votos))
    for (const v of Object.values(porMun)) {
      total += v;
      municipios++;
    }
  // sgUe (último campo) é a unidade eleitoral do TSE — a UF, "BR" ou o código
  // da cidade. É com ela que se monta o endereço da foto de urna.
  return [c.k, c.turno, c.cargo, c.numero, c.urna, c.nome, c.partido, c.situacao, c.ue, total, municipios, c.sgUe];
}

if (!soUf || soUf === "BR") for (const [k, c] of await lerCandidatos("BR")) nacionais.set(k, c);

let semCandidato = 0;
let arquivos = 0;
const ufs = soUf === "BR" ? [] : soUf ? [soUf] : UFS.map((u) => u.uf);

for (const uf of ufs) {
  const cands = await lerCandidatos(uf);
  const nomeVotos = `votacao_candidato_munzona_${ano}_${uf}.csv`;
  if (!csvVotos.has(nomeVotos)) {
    console.log(`${uf}: sem arquivo de votos`);
    continue;
  }
  // Cidade de cada voto municipal: { cod: { nome, chaves: Set } }
  const cidades = new Map();

  await streamCsvDoZip(zipVotos, nomeVotos, (c, h) => {
    const sq = c[h.indexOf("SQ_CANDIDATO")];
    const votos = parseInt(c[h.indexOf("QT_VOTOS_NOMINAIS_VALIDOS")], 10) || 0;
    if (!sq || votos <= 0) return;
    const turno = parseInt(c[h.indexOf("NR_TURNO")], 10) || 1;
    const k = chaveDe(sq, turno);
    const cand = cands.get(k) ?? nacionais.get(k);
    if (!cand) {
      semCandidato++;
      return;
    }
    const municipio = c[h.indexOf("NM_MUNICIPIO")];
    somar(cand, uf, municipio, parseInt(c[h.indexOf("NR_ZONA")], 10), votos);
    if (municipal) {
      const cod = c[h.indexOf("CD_MUNICIPIO")];
      const cid = cidades.get(cod) ?? { nome: municipio, chaves: new Set() };
      cid.chaves.add(k);
      cidades.set(cod, cid);
    }
  });

  const indice = [...cands.values()].map(linhaDoIndice);
  escrever(`indice/${uf}.json`, indice);
  arquivos++;

  if (municipal) {
    for (const [cod, cid] of cidades) {
      const dentro = {};
      for (const k of cid.chaves) {
        const c = cands.get(k);
        dentro[k] = { v: c.votos[uf][cid.nome], z: c.zonas[uf]?.[cid.nome] ?? {} };
      }
      escrever(`m/${uf}/${cod}.json`, { municipio: cid.nome, candidatos: dentro });
      arquivos++;
    }
    // A cidade de cada candidato, para o raio-x achar o arquivo dele.
    escrever(
      `cidade-de/${uf}.json`,
      Object.fromEntries([...cidades].flatMap(([cod, cid]) => [...cid.chaves].map((k) => [k, cod]))),
    );
    arquivos++;
  } else {
    for (const c of cands.values()) {
      if (!Object.keys(c.votos).length) continue;
      escrever(`c/${c.k}.json`, { votos: c.votos, zonas: c.zonas });
      arquivos++;
    }
  }
  const comVoto = indice.filter((l) => l[9] > 0).length;
  console.log(`${uf}: ${cands.size} candidaturas, ${comVoto} com voto`);
}

// Presidente NÃO está nos arquivos de cada estado — lá só vem a eleição
// estadual. O voto dele mora em `_BR.csv`, com o estado em cada linha (ZZ =
// exterior). Sem isto os 15 candidatos a presidente de 2022 saíam com zero.
if (nacionais.size && (!soUf || soUf === "BR")) {
  const nomeBr = `votacao_candidato_munzona_${ano}_BR.csv`;
  if (csvVotos.has(nomeBr))
    await streamCsvDoZip(zipVotos, nomeBr, (c, h) => {
      const sq = c[h.indexOf("SQ_CANDIDATO")];
      const votos = parseInt(c[h.indexOf("QT_VOTOS_NOMINAIS_VALIDOS")], 10) || 0;
      if (!sq || votos <= 0) return;
      const cand = nacionais.get(chaveDe(sq, parseInt(c[h.indexOf("NR_TURNO")], 10) || 1));
      if (!cand) return semCandidato++;
      somar(cand, c[h.indexOf("SG_UF")], c[h.indexOf("NM_MUNICIPIO")], parseInt(c[h.indexOf("NR_ZONA")], 10), votos);
    });
}

if (nacionais.size && (!soUf || soUf === "BR")) {
  escrever("indice/BR.json", [...nacionais.values()].map(linhaDoIndice));
  for (const c of nacionais.values()) if (Object.keys(c.votos).length) escrever(`c/${c.k}.json`, { votos: c.votos, zonas: c.zonas });
  console.log(`BR: ${nacionais.size} candidaturas nacionais`);
}

const tamanho = execSync(`du -sk "${SAIDA}"`).toString().split("\t")[0];
console.log(
  `\n${ano}: ${arquivos} arquivos, ${(Number(tamanho) / 1024).toFixed(0)} MB em disco` +
    (semCandidato ? ` · ${semCandidato} linhas de voto sem candidatura no cadastro` : ""),
);
