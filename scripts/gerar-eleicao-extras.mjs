// Gera os dados ALÉM DO VOTO para a Estratégia, ao lado dos arquivos de
// `gerar-eleicao-arquivos.mjs` (mesma pasta, mesmo bucket, mesma versão).
//
//   node scripts/gerar-eleicao-extras.mjs --ano=2022
//   node scripts/gerar-eleicao-extras.mjs --ano=2024 --so=quociente,perfil
//   node scripts/gerar-eleicao-extras.mjs --pessoas          (os três anos)
//
// Depois: `node scripts/subir-eleicao-arquivos.mjs --ano=2022 --confirmo
//          --apenas="^(apuracao|quociente|perfil|contas|pessoas|ficha)/"`
//
// ── O QUE SAI, POR ANO ──────────────────────────────────────────────────────
//
//   apuracao/<UF>.json   aptos por município e zona; por "CARGO|turno" e
//                        município: [comparecimento, válidos, brancos, nulos]
//                        (detalhe_votacao_munzona). O presidente vem do
//                        arquivo _BR e é repartido pelo estado de cada linha.
//   quociente/<UF>.json  por "SG_UE|CARGO" proporcional: vagas, válidos e
//                        [partido, federação, nominais, legenda]
//                        (votacao_partido_munzona + consulta_vagas)
//   perfil/<UF>.json     por município: total, gênero, 6 faixas de idade e 5
//                        de escolaridade (perfil_eleitorado)
//   contas/<UF>.json     por SQ_CANDIDATO: [receitas, despesas contratadas]
//                        em reais inteiros (prestacao_de_contas_eleitorais)
//   ficha/<UF>.json      por chave do candidato: [gênero, nascimento,
//                        instrução, ocupação, chapa] (consulta_cand)
//   pessoas/<UF>.json    por chave: todas as candidaturas da mesma pessoa em
//                        2022–2026, [ano, UF, chave] — só quem disputou mais
//                        de um ano. A ligação é o TÍTULO DE ELEITOR: o CPF
//                        vem "-4" (oculto) em 2024, e nome repete.
//
// A chave do candidato é a mesma do outro gerador: SQ_CANDIDATO * 10 + turno.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { execSync } from "node:child_process";
import { streamCsvDoZip } from "./tse-csv.mjs";
import UFS from "../src/lib/ufs.json" with { type: "json" };

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const CACHE = resolve(RAIZ, ".cache/tse");
const args = process.argv.slice(2);
const arg = (n, p) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3).trim() ?? p;
const SIGLAS = UFS.map((u) => u.uf);
const PROPORCIONAIS = new Set(["DEPUTADO FEDERAL", "DEPUTADO ESTADUAL", "DEPUTADO DISTRITAL", "VEREADOR"]);

const chaveDe = (sq, turno) => Number(sq) * 10 + turno;
const nulo = (v) => !v || v === "#NULO" || v === "#NE" || v === "-1" || v === "-4";
const inteiro = (v) => parseInt(v, 10) || 0;
// Valores em reais vêm com vírgula decimal ("1234,56").
const reais = (v) => Number(String(v ?? "0").replace(/\./g, "").replace(",", ".")) || 0;

function zip(nome) {
  const p = resolve(CACHE, nome);
  return existsSync(p) ? p : null;
}
const noZip = (z) => new Set(execSync(`unzip -Z1 "${z}"`, { maxBuffer: 64 * 1024 * 1024 }).toString().split("\n"));

function escritor(ano) {
  const saida = resolve(RAIZ, ".cache/eleicao-arquivos", String(ano));
  return (rel, obj) => {
    const p = resolve(saida, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(obj));
  };
}

// Lê um CSV de dentro do zip com as colunas pelo nome.
function lerCsv(z, nome, aoLer) {
  return streamCsvDoZip(z, nome, (c, h) => {
    if (!lerCsv.idx || lerCsv.h !== h) {
      lerCsv.h = h;
      lerCsv.idx = Object.fromEntries(h.map((n, i) => [n, i]));
    }
    const idx = lerCsv.idx;
    aoLer((col) => c[idx[col]]);
  });
}

// ── APURAÇÃO ────────────────────────────────────────────────────────────────

async function apuracao(ano, escrever) {
  const z = zip(`detalhe_votacao_munzona_${ano}.zip`);
  if (!z) return console.log(`apuracao ${ano}: zip ausente`);
  const dentro = noZip(z);
  const porUf = new Map(); // uf → { zonaVista: Set, aptos: {mun: {zona: n}}, cargos: {} }
  const doEstado = (uf) => {
    if (!porUf.has(uf)) porUf.set(uf, { vista: new Set(), zonas: {}, cargos: {} });
    return porUf.get(uf);
  };

  const ler = (nome, ufFixo) =>
    lerCsv(z, nome, (v) => {
      const uf = ufFixo ?? v("SG_UF");
      if (!SIGLAS.includes(uf)) return; // exterior (ZZ)
      const e = doEstado(uf);
      const mun = v("NM_MUNICIPIO");
      const zona = v("NR_ZONA");
      const turno = inteiro(v("NR_TURNO")) || 1;
      const cargo = (v("DS_CARGO") || "").toUpperCase();
      // Aptos se repetem em cada cargo da mesma zona: conta uma vez, no 1º
      // turno. Seção de voto em trânsito é outra linha, com aptos próprios.
      const marca = `${mun}|${zona}|${v("ST_VOTO_EM_TRANSITO")}`;
      if (turno === 1 && !e.vista.has(marca)) {
        e.vista.add(marca);
        const zm = (e.zonas[mun] ??= {});
        zm[zona] = (zm[zona] ?? 0) + inteiro(v("QT_APTOS"));
      }
      const k = `${cargo}|${turno}`;
      const m = ((e.cargos[k] ??= {})[mun] ??= [0, 0, 0, 0]);
      m[0] += inteiro(v("QT_COMPARECIMENTO"));
      m[1] += inteiro(v("QT_TOTAL_VOTOS_VALIDOS"));
      m[2] += inteiro(v("QT_VOTOS_BRANCOS"));
      m[3] += inteiro(v("QT_TOTAL_VOTOS_NULOS"));
    });

  for (const uf of SIGLAS) {
    const nome = `detalhe_votacao_munzona_${ano}_${uf}.csv`;
    if (dentro.has(nome)) await ler(nome, uf);
  }
  // Presidente: fica no arquivo nacional, com o estado em cada linha.
  const br = `detalhe_votacao_munzona_${ano}_BR.csv`;
  if (dentro.has(br)) {
    const jaTem = [...porUf.values()].some((e) => Object.keys(e.cargos).some((k) => k.startsWith("PRESIDENTE|")));
    if (!jaTem) await ler(br, null);
  }

  for (const [uf, e] of porUf) {
    const aptos = Object.fromEntries(Object.entries(e.zonas).map(([m, zs]) => [m, Object.values(zs).reduce((s, n) => s + n, 0)]));
    escrever(`apuracao/${uf}.json`, { aptos, zonas: e.zonas, cargos: e.cargos });
  }
  console.log(`apuracao ${ano}: ${porUf.size} estados`);
}

// ── QUOCIENTE ───────────────────────────────────────────────────────────────

async function quociente(ano, escrever) {
  const zp = zip(`votacao_partido_munzona_${ano}.zip`);
  const zv = zip(`consulta_vagas_${ano}.zip`);
  if (!zp || !zv) return console.log(`quociente ${ano}: zip ausente`);
  const dentroP = noZip(zp);
  const dentroV = noZip(zv);
  let n = 0;
  for (const uf of SIGLAS) {
    const nomeP = `votacao_partido_munzona_${ano}_${uf}.csv`;
    const nomeV = `consulta_vagas_${ano}_${uf}.csv`;
    if (!dentroP.has(nomeP) || !dentroV.has(nomeV)) continue;
    const vagas = new Map();
    await lerCsv(zv, nomeV, (v) => {
      const cargo = (v("DS_CARGO") || "").toUpperCase();
      if (PROPORCIONAIS.has(cargo)) vagas.set(`${v("SG_UE")}|${cargo}`, inteiro(v("QT_VAGA")));
    });
    const disputas = new Map(); // "SG_UE|CARGO" → { ue, partidos: Map }
    await lerCsv(zp, nomeP, (v) => {
      const cargo = (v("DS_CARGO") || "").toUpperCase();
      if (!PROPORCIONAIS.has(cargo) || (inteiro(v("NR_TURNO")) || 1) !== 1) return;
      const k = `${v("SG_UE")}|${cargo}`;
      const d = disputas.get(k) ?? { ue: v("NM_UE"), partidos: new Map() };
      const sigla = v("SG_PARTIDO");
      const p = d.partidos.get(sigla) ?? [sigla, nulo(v("SG_FEDERACAO")) ? null : v("SG_FEDERACAO"), 0, 0];
      p[2] += inteiro(v("QT_VOTOS_NOMINAIS_VALIDOS"));
      // Legenda + nominal de candidato cassado que vai para a legenda.
      p[3] += inteiro(v("QT_TOTAL_VOTOS_LEG_VALIDOS"));
      d.partidos.set(sigla, p);
      disputas.set(k, d);
    });
    const saida = {};
    for (const [k, d] of disputas) {
      const partidos = [...d.partidos.values()].filter((p) => p[2] + p[3] > 0);
      saida[k] = { ue: d.ue, vagas: vagas.get(k) ?? 0, validos: partidos.reduce((s, p) => s + p[2] + p[3], 0), partidos };
    }
    escrever(`quociente/${uf}.json`, saida);
    n++;
  }
  console.log(`quociente ${ano}: ${n} estados`);
}

// ── PERFIL DO ELEITORADO ────────────────────────────────────────────────────

function faixaIdade(ds) {
  const m = /^(\d+)/.exec(ds || "");
  if (!m) return -1; // "Inválida"
  const a = Number(m[1]);
  return a < 25 ? 0 : a < 35 ? 1 : a < 45 ? 2 : a < 60 ? 3 : a < 70 ? 4 : 5;
}

function nivelEscolaridade(ds) {
  const s = (ds || "").toUpperCase();
  if (s.startsWith("ANALFABETO")) return 0;
  if (s.startsWith("LÊ E ESCREVE") || s.startsWith("LE E ESCREVE")) return 1;
  if (s.includes("FUNDAMENTAL")) return 2;
  if (s.includes("MÉDIO") || s.includes("MEDIO")) return 3;
  if (s.includes("SUPERIOR")) return 4;
  return -1; // não informado
}

async function perfil(ano, escrever) {
  const z = zip(`perfil_eleitorado_${ano}.zip`);
  if (!z) return console.log(`perfil ${ano}: zip ausente`);
  const dentro = noZip(z);
  let n = 0;
  for (const uf of SIGLAS) {
    const nome = [...dentro].find((x) => x.endsWith(`_${uf}.csv`) && x.startsWith("perfil_eleitorado"));
    if (!nome) continue;
    const muns = {};
    await lerCsv(z, nome, (v) => {
      const q = inteiro(v("QT_ELEITORES"));
      if (!q) return;
      const m = (muns[v("NM_MUNICIPIO")] ??= { t: 0, g: {}, i: [0, 0, 0, 0, 0, 0], e: [0, 0, 0, 0, 0] });
      m.t += q;
      const g = v("DS_GENERO") || "NÃO INFORMADO";
      m.g[g] = (m.g[g] ?? 0) + q;
      const i = faixaIdade(v("DS_FAIXA_ETARIA"));
      if (i >= 0) m.i[i] += q;
      const e = nivelEscolaridade(v("DS_GRAU_ESCOLARIDADE"));
      if (e >= 0) m.e[e] += q;
    });
    escrever(`perfil/${uf}.json`, muns);
    n++;
  }
  console.log(`perfil ${ano}: ${n} estados`);
}

// ── PRESTAÇÃO DE CONTAS ─────────────────────────────────────────────────────

async function contas(ano, escrever) {
  const z = zip(`prestacao_de_contas_eleitorais_candidatos_${ano}.zip`);
  if (!z) return console.log(`contas ${ano}: zip ausente`);
  const dentro = [...noZip(z)];
  let n = 0;
  for (const uf of ["BR", ...SIGLAS]) {
    const rec = dentro.find((x) => /^receitas_candidatos_\d{4}_/.test(x) && x.endsWith(`_${uf}.csv`));
    const desp = dentro.find((x) => /^despesas_contratadas_candidatos_\d{4}_/.test(x) && x.endsWith(`_${uf}.csv`));
    if (!rec && !desp) continue;
    const porSq = {};
    const somar = (i, valor) => (sq) => {
      const c = (porSq[sq] ??= [0, 0]);
      c[i] += valor;
    };
    if (rec)
      await lerCsv(z, rec, (v) => {
        const sq = v("SQ_CANDIDATO");
        if (!nulo(sq)) somar(0, reais(v("VR_RECEITA")))(sq);
      });
    if (desp)
      await lerCsv(z, desp, (v) => {
        const sq = v("SQ_CANDIDATO");
        if (!nulo(sq)) somar(1, reais(v("VR_DESPESA_CONTRATADA")))(sq);
      });
    for (const c of Object.values(porSq)) {
      c[0] = Math.round(c[0]);
      c[1] = Math.round(c[1]);
    }
    escrever(`contas/${uf}.json`, porSq);
    n++;
  }
  console.log(`contas ${ano}: ${n} arquivos`);
}

// ── FICHA E PESSOAS (os três anos juntos) ───────────────────────────────────

async function pessoas() {
  const ANOS = [2022, 2024, 2026];
  const grupos = new Map(); // título → [[ano, uf, chave]]
  const fichas = new Map(); // ano → uf → { chave: ficha }
  for (const ano of ANOS) {
    const z = zip(`consulta_cand_${ano}.zip`);
    if (!z) continue;
    const dentro = noZip(z);
    fichas.set(ano, new Map());
    for (const uf of ["BR", ...SIGLAS]) {
      const nome = `consulta_cand_${ano}_${uf}.csv`;
      if (!dentro.has(nome)) continue;
      const ficha = {};
      await lerCsv(z, nome, (v) => {
        const sq = v("SQ_CANDIDATO");
        if (nulo(sq)) return;
        const k = chaveDe(sq, inteiro(v("NR_TURNO")) || 1);
        const federacao = v("SG_FEDERACAO");
        const coligacao = v("NM_COLIGACAO");
        const chapa = !nulo(federacao) ? federacao : coligacao && coligacao !== "PARTIDO ISOLADO" && !nulo(coligacao) ? coligacao : v("SG_PARTIDO");
        ficha[k] = [v("DS_GENERO"), v("DT_NASCIMENTO"), v("DS_GRAU_INSTRUCAO"), v("DS_OCUPACAO"), chapa];
        const titulo = v("NR_TITULO_ELEITORAL_CANDIDATO");
        if (nulo(titulo) || !/^\d{8,}$/.test(titulo)) return;
        const g = grupos.get(titulo) ?? [];
        g.push([ano, uf, k]);
        grupos.set(titulo, g);
      });
      fichas.get(ano).set(uf, ficha);
    }
    console.log(`ficha ${ano}: ${fichas.get(ano).size} arquivos`);
  }

  // Por ano e estado: a chave de cada candidato → todas as candidaturas dele.
  const porArquivo = new Map();
  let ligados = 0;
  for (const g of grupos.values()) {
    if (new Set(g.map((x) => x[0])).size < 2) continue; // só um ano: nada a ligar
    ligados++;
    for (const [ano, uf, k] of g) {
      const nome = `${ano}|${uf}`;
      if (!porArquivo.has(nome)) porArquivo.set(nome, {});
      porArquivo.get(nome)[k] = g;
    }
  }
  for (const [ano, porUf] of fichas) {
    const escrever = escritor(ano);
    for (const [uf, ficha] of porUf) {
      escrever(`ficha/${uf}.json`, ficha);
      escrever(`pessoas/${uf}.json`, porArquivo.get(`${ano}|${uf}`) ?? {});
    }
  }
  console.log(`pessoas: ${ligados} pessoas com candidatura em mais de um ano`);
}

// ── EXECUÇÃO ────────────────────────────────────────────────────────────────

if (args.includes("--pessoas")) {
  await pessoas();
} else {
  const ano = parseInt(arg("ano", "2022"), 10);
  const so = new Set(arg("so", "apuracao,quociente,perfil,contas").split(","));
  const escrever = escritor(ano);
  if (so.has("apuracao")) await apuracao(ano, escrever);
  if (so.has("quociente")) await quociente(ano, escrever);
  if (so.has("perfil")) await perfil(ano, escrever);
  if (so.has("contas")) await contas(ano, escrever);
}
