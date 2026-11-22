// Território de cada deputado eleito — a parte "votos" do Dossiê do mandato.
//
//   node scripts/dossie-territorio.mjs                 (MG, deputado estadual, 2026)
//   node scripts/dossie-territorio.mjs --uf=MG --cargo="DEPUTADO ESTADUAL"
//
// Lê os arquivos do TSE já gerados em .cache/eleicao-arquivos (2022, 2024 e
// 2026) e as regiões do IBGE (.cache/dossie/ibge-<uf>.json, baixado de
// servicodados.ibge.gov.br/api/v1/localidades/estados/<cod>/municipios).
// Grava .cache/dossie/territorio-<UF>-<ano>.json, um registro por eleito.
//
// ── O QUE CADA NÚMERO QUER DIZER ────────────────────────────────────────────
//
//   concentracao   quantas cidades somam 50% / 80% dos votos dele. Poucas
//                  cidades = base forte e frágil ao mesmo tempo (perdeu uma,
//                  perdeu o mandato).
//   forca          votos dele ÷ votos válidos para deputado na cidade. É o
//                  "quanto ele manda ali", não "quanto a cidade pesa para ele".
//   regioes        votos por região intermediária do IBGE, com o nome que o
//                  mineiro usa (Norte de Minas, Triângulo...).
//   evolucao       2022 → 2026, cidade a cidade, para quem disputou deputado
//                  estadual em 2022 (ligação pelo `pessoas/<UF>.json`).
//   vizinhos       outros eleitos que tiram voto das MESMAS cidades:
//                  sobreposição = Σ min(parte dele na cidade, parte do outro).
//                  1 = bases idênticas, 0 = nenhuma cidade em comum.
//   prefeitos      prefeito eleito em 2024 nas 15 cidades mais fortes dele, e
//                  se é do mesmo partido.
//   espaco         cidades grandes da região principal dele onde a força é
//                  baixa: onde crescer sem sair de casa.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, padrao) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? padrao;
const UF = arg("uf", "MG");
const CARGO = arg("cargo", "DEPUTADO ESTADUAL");
const ANO = Number(arg("ano", "2026"));
const ANTES = ANO - 4;

const ler = (p) => JSON.parse(readFileSync(resolve(RAIZ, p), "utf8"));
const E = (ano, p) => ler(`.cache/eleicao-arquivos/${ano}/${p}`);

// Nome popular de cada região intermediária do IBGE em MG (o IBGE usa o nome
// da cidade-polo, que ninguém fala).
const NOME_REGIAO = {
  "Belo Horizonte": "Grande BH e Central",
  "Montes Claros": "Norte de Minas",
  "Teófilo Otoni": "Mucuri e Jequitinhonha",
  "Governador Valadares": "Vale do Rio Doce",
  "Ipatinga": "Vale do Aço",
  "Juíz de Fora": "Zona da Mata",
  "Barbacena": "Campo das Vertentes",
  "Varginha": "Sul de Minas (Varginha)",
  "Pouso Alegre": "Sul de Minas (Pouso Alegre)",
  "Divinópolis": "Centro-Oeste",
  "Patos de Minas": "Alto Paranaíba",
  "Uberlândia": "Triângulo (Uberlândia)",
  "Uberaba": "Triângulo (Uberaba)",
};
// Grafia do TSE que não bate com a do IBGE.
const APELIDO = {
  "BARÃO DE MONTE ALTO": "BARAODOMONTEALTO",
  "DONA EUSÉBIA": "DONAEUZEBIA",
  "SÃO THOMÉ DAS LETRAS": "SAOTOMEDASLETRAS",
};
const norm = (s) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z]/g, "");

// ── Dados ───────────────────────────────────────────────────────────────────
const indice = E(ANO, `indice/${UF}.json`);
const pessoas = E(ANO, `pessoas/${UF}.json`);
const indiceAntes = new Map(E(ANTES, `indice/${UF}.json`).map((r) => [r[0], r]));
const apuracao = E(ANO, `apuracao/${UF}.json`);
const validos = Object.fromEntries(
  Object.entries(apuracao.cargos[`${CARGO}|1`]).map(([m, v]) => [m, v[1]]),
);
const eleitorado = apuracao.aptos;
const ibge = ler(`.cache/dossie/ibge-${UF.toLowerCase()}.json`);
const regiaoPorNorma = new Map(
  ibge.map((m) => {
    const r = m["regiao-imediata"]["regiao-intermediaria"].nome;
    return [norm(m.nome), NOME_REGIAO[r] ?? r];
  }),
);
const regiao = (cidade) => regiaoPorNorma.get(APELIDO[cidade] ?? norm(cidade)) ?? "?";

const prefeitos = new Map();
for (const r of E(ANO - 2, `indice/${UF}.json`))
  if (r[2] === "PREFEITO" && String(r[7]).startsWith("ELEITO")) prefeitos.set(r[8], { nome: r[4], partido: r[6] });

const votosDe = (ano, id) => {
  try {
    return E(ano, `c/${id}.json`).votos[UF] ?? {};
  } catch {
    return null;
  }
};

const eleitos = indice
  .filter((r) => r[2] === CARGO && String(r[7]).startsWith("ELEITO"))
  .sort((a, b) => b[9] - a[9]);

// ── Por eleito ──────────────────────────────────────────────────────────────
const base = eleitos.map((r) => {
  const votos = votosDe(ANO, r[0]) ?? {};
  const total = Object.values(votos).reduce((s, v) => s + v, 0);
  return { r, votos, total };
});

const pct = (a, b) => (b ? +((100 * a) / b).toFixed(2) : 0);
const totalValidos = Object.values(validos).reduce((s, v) => s + v, 0);

const saida = base.map(({ r, votos, total }, i) => {
  const cidades = Object.entries(votos).sort((a, b) => b[1] - a[1]);

  // concentração
  const ate = (frac) => {
    let s = 0;
    for (const [k, [, v]] of cidades.entries()) if ((s += v) >= frac * total) return k + 1;
    return cidades.length;
  };

  // regiões
  const porRegiao = {};
  for (const [m, v] of cidades) porRegiao[regiao(m)] = (porRegiao[regiao(m)] ?? 0) + v;
  const regioes = Object.entries(porRegiao)
    .sort((a, b) => b[1] - a[1])
    .map(([nome, v]) => ({ nome, votos: v, parte: pct(v, total) }));

  const topo = cidades.slice(0, 15).map(([m, v]) => ({
    cidade: m,
    regiao: regiao(m),
    votos: v,
    parte: pct(v, total),
    forca: pct(v, validos[m]),
    eleitorado: eleitorado[m] ?? null,
    prefeito: prefeitos.get(m) ?? null,
    prefeito_mesmo_partido: prefeitos.get(m)?.partido === r[6],
  }));

  // 2022 → 2026
  let evolucao = null;
  const antes = (pessoas[String(r[0])] ?? []).find(([a]) => a === ANTES);
  const linhaAntes = antes && indiceAntes.get(antes[2]);
  if (linhaAntes && linhaAntes[2] === CARGO) {
    const v22 = votosDe(ANTES, antes[2]) ?? {};
    const t22 = Object.values(v22).reduce((s, v) => s + v, 0);
    const todas = new Set([...Object.keys(v22), ...Object.keys(votos)]);
    const dif = [...todas].map((m) => ({ cidade: m, antes: v22[m] ?? 0, agora: votos[m] ?? 0, delta: (votos[m] ?? 0) - (v22[m] ?? 0) }));
    dif.sort((a, b) => b.delta - a.delta);
    const regAntes = {};
    for (const [m, v] of Object.entries(v22)) regAntes[regiao(m)] = (regAntes[regiao(m)] ?? 0) + v;
    evolucao = {
      situacao_antes: linhaAntes[7],
      total_antes: t22,
      delta: total - t22,
      delta_pct: pct(total - t22, t22),
      cresceu: dif.slice(0, 8),
      caiu: dif.slice(-8).reverse(),
      regioes: Object.keys({ ...regAntes, ...porRegiao })
        .map((nome) => ({ nome, antes: regAntes[nome] ?? 0, agora: porRegiao[nome] ?? 0 }))
        .sort((a, b) => b.agora - a.agora),
    };
  }

  // quem divide a base
  const vizinhos = base
    .filter((o) => o.r[0] !== r[0] && o.total)
    .map((o) => {
      let s = 0;
      for (const [m, v] of cidades) if (o.votos[m]) s += Math.min(v / total, o.votos[m] / o.total);
      return { nome: o.r[4], partido: o.r[6], sobreposicao: +s.toFixed(3) };
    })
    .sort((a, b) => b.sobreposicao - a.sobreposicao)
    .slice(0, 5);

  // espaço para crescer na região principal
  const principal = regioes[0]?.nome;
  const forcaMediana = (() => {
    const f = topo.map((c) => c.forca).sort((a, b) => a - b);
    return f[Math.floor(f.length / 2)] ?? 0;
  })();
  const espaco = Object.keys(validos)
    .filter((m) => regiao(m) === principal && (eleitorado[m] ?? 0) >= 15000)
    .map((m) => ({ cidade: m, eleitorado: eleitorado[m], votos: votos[m] ?? 0, forca: pct(votos[m] ?? 0, validos[m]) }))
    .filter((c) => c.forca < forcaMediana / 3)
    .sort((a, b) => b.eleitorado - a.eleitorado)
    .slice(0, 6);

  return {
    candidato: String(r[0]),
    nome: r[4],
    nome_completo: r[5],
    partido: r[6],
    situacao: r[7],
    posicao: i + 1,
    votos: total,
    parte_validos_estado: pct(total, totalValidos),
    cidades_com_voto: cidades.length,
    concentracao: { cidades_50: ate(0.5), cidades_80: ate(0.8), top5_parte: pct(cidades.slice(0, 5).reduce((s, [, v]) => s + v, 0), total) },
    regioes,
    cidades: topo,
    evolucao,
    vizinhos,
    espaco: { regiao: principal, forca_referencia: forcaMediana, cidades: espaco },
    prefeitos_mesmo_partido_top15: topo.filter((c) => c.prefeito_mesmo_partido).length,
  };
});

const arquivo = resolve(RAIZ, `.cache/dossie/territorio-${UF}-${ANO}.json`);
writeFileSync(arquivo, JSON.stringify(saida, null, 1));
console.log(`${saida.length} eleitos · ${arquivo}`);
console.log(`com 2022 como ${CARGO.toLowerCase()}: ${saida.filter((s) => s.evolucao).length}`);
console.log(`cidades sem região: ${new Set(saida.flatMap((s) => s.cidades.filter((c) => c.regiao === "?").map((c) => c.cidade))).size}`);
