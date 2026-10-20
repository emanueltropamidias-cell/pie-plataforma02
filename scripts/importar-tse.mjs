// ============================================================================
// IMPORTADOR DE DADOS ELEITORAIS DO TSE (CKAN -> POSTGRES)
// ============================================================================
//
//   node scripts/importar-tse.mjs --ano=2024 --uf=BA              só lê e conta
//   node scripts/importar-tse.mjs --ano=2024 --uf=BA --confirmo   grava
//
// ── O CANDIDATO É O SEQUENCIAL ──────────────────────────────────────────────
//
// Número de urna não identifica ninguém numa eleição municipal: o vereador
// 55123 existe em cada cidade. Identificar por número fez 35.209 candidaturas
// de 2024 virarem 3.910 e somou os votos dos homônimos de número num só (ver
// a migração 0056). A chave é (ano, turno, SQ_CANDIDATO), e os votos são
// ligados pelo mesmo par — o sequencial se repete no 2º turno, então sem o
// turno os votos das duas rodadas seriam somados.

import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";
import { garantirArquivo as baixar, streamCsvDoZip } from "./tse-csv.mjs";
import UFS from "../src/lib/ufs.json" with { type: "json" };

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const CACHE_DIR = resolve(RAIZ, ".cache/tse");
mkdirSync(CACHE_DIR, { recursive: true });

const args = process.argv.slice(2);
const gravar = args.includes("--confirmo");

function obterArg(nome, padrao) {
  const pref = `--${nome}=`;
  const achado = args.find((a) => a.startsWith(pref));
  return achado ? achado.slice(pref.length).trim() : padrao;
}

const ano = parseInt(obterArg("ano", "2022"), 10);
const ufParam = obterArg("uf", "BA").toUpperCase();

// A mesma lista que a tela usa — um lugar só (src/lib/ufs.json).
const UFS_BRASIL = UFS.map((e) => e.uf);

const ufsParaProcessar = ufParam === "TODAS" || ufParam === "BR" ? UFS_BRASIL : [ufParam];

const URLS_TSE = {
  2022: {
    candidatos: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2022.zip",
    votos: "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip",
  },
  2024: {
    candidatos: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip",
    votos: "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2024.zip",
  },
  2026: {
    candidatos: "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2026.zip",
    votos: "https://cdn.tse.jus.br/estatistica/sead/odsele/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip",
  },
};

function normalizarChave(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const { conexao } = escolherBanco({ raiz: RAIZ });
const cliente = new pg.Client({ ...conexao, ssl: { rejectUnauthorized: false } });
await cliente.connect();

const urlsAno = URLS_TSE[ano];
if (!urlsAno) {
  console.error(`Ano ${ano} não suportado.`);
  await cliente.end();
  process.exit(1);
}

const zipCandidatos = baixar(CACHE_DIR, `consulta_cand_${ano}.zip`, urlsAno.candidatos);
const zipVotos = baixar(CACHE_DIR, `votacao_candidato_munzona_${ano}.zip`, urlsAno.votos);

for (const uf of ufsParaProcessar) {
  const candidatosMap = new Map();
  const arquivoCand = `consulta_cand_${ano}_${uf}.csv`;

  const lidosCand = await streamCsvDoZip(zipCandidatos, arquivoCand, (colunas, h) => {
    const cargo = colunas[h.indexOf("DS_CARGO")];
    const numero = parseInt(colunas[h.indexOf("NR_CANDIDATO")], 10);
    const turno = parseInt(colunas[h.indexOf("NR_TURNO")], 10) || 1;
    const sq = colunas[h.indexOf("SQ_CANDIDATO")];
    const sgUe = colunas[h.indexOf("SG_UE")];
    const nmUe = colunas[h.indexOf("NM_UE")];
    const nomeUrna = colunas[h.indexOf("NM_URNA_CANDIDATO")];
    const nomeCompleto = colunas[h.indexOf("NM_CANDIDATO")];
    const partidoSigla = colunas[h.indexOf("SG_PARTIDO")];
    const partidoNumero = parseInt(colunas[h.indexOf("NR_PARTIDO")], 10) || null;
    const coligacao = colunas[h.indexOf("DS_COMPOSICAO_COLIGACAO")] || colunas[h.indexOf("NM_COLIGACAO")];
    const situacao = colunas[h.indexOf("DS_SIT_TOT_TURNO")] || colunas[h.indexOf("DS_SITUACAO_CANDIDATURA")];

    if (!cargo || isNaN(numero) || !sq) return;

    const cargoNorm = cargo.toUpperCase();
    const chaveCand = `${sq}_${turno}`;
    // A cidade entra na busca: "vereador ilheus" tem de achar.
    const chaveBusca = normalizarChave(`${numero} ${nomeUrna} ${nomeCompleto} ${partidoSigla} ${cargoNorm} ${nmUe}`);
    const fotoUrl = sq
      ? `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/foto/${ano}/${sq}/${uf}`
      : null;

    candidatosMap.set(chaveCand, {
      ano, turno, uf, sg_ue: sgUe || uf, nm_ue: nmUe, cargo: cargoNorm, numero, sq_candidato: sq,
      nome_urna: nomeUrna, nome_completo: nomeCompleto, partido_sigla: partidoSigla,
      partido_numero: partidoNumero, coligacao, situacao, foto_url: fotoUrl, chave_busca: chaveBusca,
    });
  });

  const idPorSqTurno = new Map();
  console.log(`\n${uf} ${ano}: ${lidosCand} linhas de candidatura, ${candidatosMap.size} candidaturas distintas`);

  if (gravar && candidatosMap.size > 0) {
    const cands = Array.from(candidatosMap.values());
    for (let i = 0; i < cands.length; i += 500) {
      const lote = cands.slice(i, i + 500);
      const query = `
        insert into public.eleicao_candidatos (
          ano, turno, uf, sg_ue, nm_ue, cargo, numero, sq_candidato,
          nome_urna, nome_completo, partido_sigla, partido_numero,
          coligacao, situacao, foto_url, chave_busca
        )
        select
          t.ano, t.turno, t.uf, t.sg_ue, t.nm_ue, t.cargo, t.numero, t.sq_candidato,
          t.nome_urna, t.nome_completo, t.partido_sigla, t.partido_numero,
          t.coligacao, t.situacao, t.foto_url, t.chave_busca
        from jsonb_to_recordset($1::jsonb) as t(
          ano integer, turno smallint, uf text, sg_ue text, nm_ue text, cargo text, numero integer, sq_candidato text,
          nome_urna text, nome_completo text, partido_sigla text, partido_numero integer,
          coligacao text, situacao text, foto_url text, chave_busca text
        )
        on conflict (ano, turno, sq_candidato)
        do update set
          uf = excluded.uf,
          sg_ue = excluded.sg_ue,
          nm_ue = excluded.nm_ue,
          cargo = excluded.cargo,
          numero = excluded.numero,
          nome_urna = excluded.nome_urna,
          nome_completo = excluded.nome_completo,
          partido_sigla = excluded.partido_sigla,
          coligacao = excluded.coligacao,
          situacao = excluded.situacao,
          -- Foto já trocada pela do Storage (subir-fotos-urna.mjs) não volta
          -- a apontar para o TSE, que recusa o acesso direto.
          foto_url = case when public.eleicao_candidatos.foto_url like '%supabase.co%'
                          then public.eleicao_candidatos.foto_url else excluded.foto_url end,
          chave_busca = excluded.chave_busca,
          atualizado_em = now();
      `;
      await cliente.query(query, [JSON.stringify(lote)]);
    }

    const { rows: todosCandBanco } = await cliente.query(
      `select id, turno, sq_candidato from public.eleicao_candidatos where ano = $1 and uf = $2`,
      [ano, uf]
    );
    for (const r of todosCandBanco) idPorSqTurno.set(`${r.sq_candidato}_${r.turno}`, r.id);
  }

  const arquivoVotos = `votacao_candidato_munzona_${ano}_${uf}.csv`;
  const votosAgregados = new Map();
  // Mesmo arquivo, um nível abaixo: a zona eleitoral. É o que a camada
  // municipal mostra para qualquer candidato (eleicao_votos_zona).
  const votosZona = new Map();

  await streamCsvDoZip(zipVotos, arquivoVotos, (colunas, h) => {
    const cargo = colunas[h.indexOf("DS_CARGO")];
    const numero = parseInt(colunas[h.indexOf("NR_CANDIDATO")], 10);
    const turno = parseInt(colunas[h.indexOf("NR_TURNO")], 10) || 1;
    const codigoTse = colunas[h.indexOf("CD_MUNICIPIO")];
    const municipio = colunas[h.indexOf("NM_MUNICIPIO")];
    const sq = colunas[h.indexOf("SQ_CANDIDATO")];
    const zona = parseInt(colunas[h.indexOf("NR_ZONA")], 10);
    const votosValidos = parseInt(colunas[h.indexOf("QT_VOTOS_NOMINAIS_VALIDOS")], 10) || 0;

    if (!cargo || isNaN(numero) || !sq || !codigoTse || votosValidos <= 0) return;

    const cargoNorm = cargo.toUpperCase();
    const k = `${sq}_${turno}_${codigoTse}`;
    const atual = votosAgregados.get(k);

    if (!isNaN(zona)) {
      const kz = `${k}_${zona}`;
      const z = votosZona.get(kz);
      if (z) z.votos += votosValidos;
      else votosZona.set(kz, { sq, turno, codigo_tse: codigoTse, municipio, zona, votos: votosValidos });
    }

    if (atual) {
      atual.votos += votosValidos;
    } else {
      votosAgregados.set(k, {
        cargo: cargoNorm, numero, turno, sq, codigo_tse: codigoTse, municipio, votos: votosValidos,
      });
    }
  });

  if (gravar && votosAgregados.size > 0) {
    const candIds = [];
    const anos = [];
    const turnos = [];
    const ufs = [];
    const municipios = [];
    const codigosTse = [];
    const votosList = [];

    let semCandidato = 0;
    for (const v of votosAgregados.values()) {
      const candId = idPorSqTurno.get(`${v.sq}_${v.turno}`);
      if (!candId) {
        semCandidato++;
        continue;
      }
      candIds.push(candId);
      anos.push(ano);
      turnos.push(v.turno);
      ufs.push(uf);
      municipios.push(v.municipio);
      codigosTse.push(v.codigo_tse);
      votosList.push(v.votos);
    }

    const LOTE_VOTOS = 5000;
    for (let i = 0; i < candIds.length; i += LOTE_VOTOS) {
      const fim = Math.min(i + LOTE_VOTOS, candIds.length);
      const queryVotos = `
        insert into public.eleicao_votos_municipio (
          candidato_id, ano, turno, uf, municipio, codigo_tse, votos
        )
        select
          t.candidato_id, t.ano, t.turno, t.uf, t.municipio, t.codigo_tse, t.votos
        from unnest(
          $1::bigint[], $2::int[], $3::smallint[], $4::text[], $5::text[], $6::text[], $7::int[]
        ) as t(candidato_id, ano, turno, uf, municipio, codigo_tse, votos)
        on conflict (candidato_id, codigo_tse, municipio)
        do update set
          votos = excluded.votos,
          atualizado_em = now();
      `;
      await cliente.query(queryVotos, [
        candIds.slice(i, fim), anos.slice(i, fim), turnos.slice(i, fim),
        ufs.slice(i, fim), municipios.slice(i, fim), codigosTse.slice(i, fim),
        votosList.slice(i, fim),
      ]);
    }
    const zonas = { cand: [], cod: [], mun: [], zona: [], votos: [] };
    for (const z of votosZona.values()) {
      const candId = idPorSqTurno.get(`${z.sq}_${z.turno}`);
      if (!candId) continue;
      zonas.cand.push(candId);
      zonas.cod.push(z.codigo_tse);
      zonas.mun.push(z.municipio);
      zonas.zona.push(z.zona);
      zonas.votos.push(z.votos);
    }
    for (let i = 0; i < zonas.cand.length; i += LOTE_VOTOS) {
      const fim = Math.min(i + LOTE_VOTOS, zonas.cand.length);
      await cliente.query(
        `insert into public.eleicao_votos_zona (candidato_id, codigo_tse, municipio, zona, votos)
         select * from unnest($1::bigint[], $2::text[], $3::text[], $4::int[], $5::int[])
         on conflict (candidato_id, codigo_tse, zona) do update set votos = excluded.votos`,
        [zonas.cand.slice(i, fim), zonas.cod.slice(i, fim), zonas.mun.slice(i, fim),
          zonas.zona.slice(i, fim), zonas.votos.slice(i, fim)],
      );
    }
    console.log(`${uf} ${ano}: ${zonas.cand.length} linhas de voto por zona gravadas`);

    console.log(`${uf} ${ano}: ${candIds.length} linhas de voto gravadas` +
      (semCandidato ? `, ${semCandidato} SEM candidatura correspondente (não gravadas)` : ""));
  } else {
    console.log(`${uf} ${ano}: ${votosAgregados.size} linhas de voto lidas` + (gravar ? "" : " (sem --confirmo, nada gravado)"));
  }
}

// O que a tela oferece (anos e estados com dado) é contado uma vez aqui,
// e não a cada abertura da Central de Estratégia — ver a migração 0059.
if (gravar) await cliente.query("select public.atualizar_eleicao_cobertura()");
await cliente.end();
