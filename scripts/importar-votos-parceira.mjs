// Importa a votação de uma candidata parceira, de um TSV "MUNICÍPIO<tab>VOTOS".
//
// ── AS TRÊS CONFERÊNCIAS, ANTES DE GRAVAR ───────────────────────────────────
//
// A lista chega colada da tela do TSE e passa por mim antes do banco. Erro meu
// de transcrição não pode virar mapa errado — mapa errado tem a mesma cara de um
// certo, e é o Emanuel que decide onde a campanha põe esforço olhando para ele.
//
//   1. ORDEM      a lista do TSE vem decrescente. Se eu troquei um número,
//                 quase certamente a ordem quebra — e a quebra aponta a linha.
//   2. REPETIDO   município duas vezes é linha duplicada na origem ou dedo meu.
//   3. GRAFIA     todo nome tem que existir entre os 417. O banco recusaria de
//                 qualquer jeito, mas recusar no meio de uma transação de 384
//                 linhas não diz QUAIS estão erradas — diz a primeira e para.
//
// Nada é gravado se qualquer uma falhar.
//
//   node scripts/importar-votos-parceira.mjs <arquivo.tsv> "Nome" --numero 22222
//   ... --confirmo    para gravar de verdade

import { readFileSync } from "node:fs";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

// ── O TSE E O IBGE ESCREVEM DIFERENTE ───────────────────────────────────────
//
// `municipios_ba` veio do IBGE. A votação vem da tela do TSE, e dois nomes não
// batem — não por erro de quem copiou, mas porque as duas instituições grafam
// diferente:
//
//   TSE "CAMACÃ"        IBGE "Camacan"      palavra diferente, não acento
//   TSE "DIAS DÁVILA"   IBGE "Dias d'Ávila" o apóstrofo separa, e `chave_municipio`
//                                           transforma pontuação em espaço: vira
//                                           "dias d avila" contra "dias davila"
//
// Sem isto, os dois municípios seriam recusados na importação — ou, pior num
// caminho sem trava, entrariam como cidade nova e sumiriam do mapa em silêncio.
//
// Fica aqui, e não no `municipios-de-para.json`: aquele arquivo é da Planilha de
// Atendimentos, e é sobre gente digitando endereço errado. Este é sobre duas
// fontes oficiais discordando, e é estável — não cresce a cada planilha nova.
const TSE_PARA_IBGE = {
  "CAMACÃ": "Camacan",
  "DIAS DÁVILA": "Dias d'Ávila",
};

const [arquivo, nome] = process.argv.slice(2);
const gravar = process.argv.includes("--confirmo");
const iNumero = process.argv.indexOf("--numero");
const iPartido = process.argv.indexOf("--partido");
const numero = iNumero > -1 ? process.argv[iNumero + 1] : undefined;
const partido = iPartido > -1 ? process.argv[iPartido + 1] : undefined;

if (!arquivo || !nome) {
  console.error('Uso: node scripts/importar-votos-parceira.mjs <arquivo.tsv> "Nome" [--numero N] [--partido P] [--confirmo]');
  process.exit(1);
}

const linhas = readFileSync(arquivo, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean)
  .map((l, i) => {
    const [m, v] = l.split("\t");
    const cru = (m ?? "").trim();
    return {
      linha: i + 1,
      cru,
      municipio: TSE_PARA_IBGE[cru] ?? cru,
      votos: Number((v ?? "").replace(/\./g, "")),
    };
  });

const problemas = [];

// 1. ordem decrescente
for (let i = 1; i < linhas.length; i++) {
  if (linhas[i].votos > linhas[i - 1].votos) {
    problemas.push(
      `ORDEM quebrada na linha ${linhas[i].linha}: ${linhas[i].municipio} (${linhas[i].votos}) vem depois de ${linhas[i - 1].municipio} (${linhas[i - 1].votos})`,
    );
  }
  if (!Number.isInteger(linhas[i].votos) || linhas[i].votos < 0) {
    problemas.push(`VOTO inválido na linha ${linhas[i].linha}: ${linhas[i].municipio}`);
  }
}

// 2. repetidos
const vistos = new Map();
for (const l of linhas) {
  const k = l.municipio.toLowerCase();
  if (vistos.has(k)) problemas.push(`REPETIDO: ${l.municipio} nas linhas ${vistos.get(k)} e ${l.linha}`);
  vistos.set(k, l.linha);
}

// A conexão sai de `escolherBanco()`, como a dos outros scripts.
//
// Este arquivo montava a dele: lia o .env.local direto e entrava. Com mais de um
// candidato isso é o caminho padrão para o pior erro possível AQUI — importar a
// votação de um candidato dentro da base do outro. Não daria erro nenhum: as
// tabelas são as mesmas, o insert passa, e o mapa do outro candidato simplesmente
// mostraria votos que não são dele. Agora a instalação é anunciada antes, e tocar
// a base do outro exige digitar `--candidato=<nome>`.
const { conexao } = escolherBanco();
if (!conexao) {
  console.error("Falta SUPABASE_DB_PASSWORD no .env da instalação.");
  process.exit(1);
}
const cliente = new pg.Client({ ...conexao, ssl: { rejectUnauthorized: false } });

await cliente.connect();

// 3. grafia — contra a lista oficial, pela mesma função que o trigger usa
const { rows: naoExistem } = await cliente.query(
  `select t.municipio
     from unnest($1::text[]) as t(municipio)
    where not exists (
      select 1 from public.municipios_ba m
       where m.chave = public.chave_municipio(t.municipio))`,
  [linhas.map((l) => l.municipio)],
);
for (const r of naoExistem) problemas.push(`GRAFIA: "${r.municipio}" não está entre os 417`);

const total = linhas.reduce((s, l) => s + l.votos, 0);

console.log(`arquivo:   ${arquivo}`);
console.log(`candidata: ${nome}${numero ? ` · ${numero}` : ""}${partido ? ` · ${partido}` : ""}`);
console.log(`linhas:    ${linhas.length}`);
console.log(`votos:     ${total.toLocaleString("pt-BR")}`);
console.log(`maior:     ${linhas[0]?.municipio} (${linhas[0]?.votos})`);
console.log(`menor:     ${linhas[linhas.length - 1]?.municipio} (${linhas[linhas.length - 1]?.votos})`);
console.log("");

if (problemas.length) {
  console.error(`PAROU — ${problemas.length} problema(s), nada foi gravado:`);
  for (const p of problemas.slice(0, 20)) console.error(`  ${p}`);
  await cliente.end();
  process.exit(2);
}

const traduzidos = linhas.filter((l) => l.cru !== l.municipio);
console.log("Conferências: ordem OK, sem repetido, grafias OK.");
if (traduzidos.length) {
  console.log(`Grafia do TSE traduzida para a do IBGE em ${traduzidos.length}:`);
  for (const t of traduzidos) console.log(`  ${t.cru} -> ${t.municipio}`);
}

if (!gravar) {
  console.log("\nNada gravado. Rode de novo com --confirmo para gravar.");
  await cliente.end();
  process.exit(0);
}

try {
  await cliente.query("begin");
  const { rows } = await cliente.query(
    `insert into public.candidatos_dobradinha (nome, cargo, numero, partido, eleicao)
     values ($1, 'estadual', $2, $3, 2022) returning id`,
    [nome, numero ?? null, partido ?? null],
  );
  const id = rows[0].id;

  // Uma chamada só, com os dois arrays — 384 inserts separados seriam 384
  // idas ao banco, e o trigger de grafia roda igual em qualquer um dos casos.
  await cliente.query(
    `insert into public.candidato_votos (candidato_id, municipio, votos)
     select $1, m, v from unnest($2::text[], $3::int[]) as t(m, v)`,
    [id, linhas.map((l) => l.municipio), linhas.map((l) => l.votos)],
  );

  const { rows: conf } = await cliente.query(
    `select count(*)::int as municipios, sum(votos)::int as votos
       from public.candidato_votos where candidato_id = $1`,
    [id],
  );
  await cliente.query("commit");

  console.log(`\nGravado. candidato_id ${id} — ${conf[0].municipios} municípios, ${conf[0].votos.toLocaleString("pt-BR")} votos.`);
  if (conf[0].municipios !== linhas.length || conf[0].votos !== total) {
    console.error("ATENÇÃO: o que entrou não bate com o que foi lido do arquivo.");
    process.exitCode = 1;
  }
} catch (erro) {
  await cliente.query("rollback").catch(() => {});
  console.error(`FALHOU — nada gravado. ${erro.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end();
}
