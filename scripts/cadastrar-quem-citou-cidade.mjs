// Cadastra quem CONVERSOU, DISSE A CIDADE e nunca virou ficha.
//
// ── O BURACO QUE ISTO FECHA ──────────────────────────────────────────────────
//
// 7.171 pessoas falaram com a campanha e não estão em `liderancas`. Elas
// existem só como conversa: sem município, fora do mapa de cobertura, fora de
// qualquer lista tirada da Base. Destas, 1.172 DISSERAM a cidade no meio do
// papo — "Falo da cidade Gandu bahia", "Eu moro em Irecê Bahia", "Oi de
// barreiras".
//
// A informação já está lá. Só ninguém transformou em ficha.
//
// ── POR QUE SÓ QUEM CITOU, E NÃO QUEM TEM DDD DA REGIÃO ─────────────────────
//
// Um DDD cobre dezenas de municípios: o 75 vai de Feira de Santana a Paulo
// Afonso, 400 km de distância. Cadastrar alguém em "Feira de Santana" porque o
// telefone é 75 é INVENTAR o dado — e base inventada é pior que base vazia,
// porque ninguém sabe mais em quem acreditar.
//
// Aqui só entra cidade que saiu da boca da pessoa e que casa com um dos 417
// municípios da Bahia. O resto fica de fora, de propósito.
//
// ── POR QUE NÃO USA `cadastrar_manual` ──────────────────────────────────────
//
// Porque ela também INSERE UMA CONVERSA, e estas pessoas já têm a delas. Passar
// por ali criaria uma conversa duplicada por pessoa. A gravação é direta, e a
// origem fica marcada como `conversa` — diferente de `manual`, que são as 3.110
// fichas digitadas por gente de verdade. Assim dá para achar, medir e desfazer.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/cadastrar-quem-citou-cidade.mjs             # só mostra
//   node scripts/cadastrar-quem-citou-cidade.mjs --aplicar   # grava
//
// Pode rodar de novo: quem já está cadastrado não entra duas vezes.

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const aplicar = process.argv.includes("--aplicar");
const { conexao, env } = escolherBanco();
const c = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25_000,
  query_timeout: 300_000,
});
await c.connect();

// Um telefone, uma forma. Sem isto a mesma pessoa aparece como 12 e como 13
// dígitos, e o "já está cadastrado" falha — cadastrando quem já existe.
const ALVO = `
  with cadastrados as (
    select distinct public.fone_canonico(telefone) as f
      from public.liderancas where telefone is not null
  ),
  falantes as (
    select public.fone_canonico(c.telefone)                    as fone,
           max(c.nome)                                          as nome,
           max(coalesce(c.municipio, c.municipio_sugerido))     as cidade_dita,
           max(c.bairro)                                        as bairro
      from public.conversas c
     where c.telefone is not null
       and c.telefone not like 'lid.%'
       and coalesce(c.municipio, c.municipio_sugerido) is not null
     group by 1
  )
  select f.fone, f.nome, f.bairro, mb.nome as municipio
    from falantes f
    join public.municipios_ba mb on mb.chave = public.chave_municipio(f.cidade_dita)
   where length(f.fone) = 11
     and substring(f.fone, 3, 1) = '9'
     and f.nome is not null and btrim(f.nome) <> ''
     and not exists (select 1 from cadastrados x where x.f = f.fone)
`;

const { rows: alvo } = await c.query(`${ALVO} order by mb.nome, f.nome`);

console.log(`\n  pessoas a cadastrar: ${alvo.length}`);
if (alvo.length === 0) {
  console.log("  Nada a fazer.\n");
  await c.end();
  process.exit(0);
}

const porCidade = {};
for (const p of alvo) porCidade[p.municipio] = (porCidade[p.municipio] ?? 0) + 1;
const top = Object.entries(porCidade).sort((a, b) => b[1] - a[1]);
console.log(`  municípios diferentes: ${top.length}\n`);
console.log("  onde elas estão:");
for (const [cidade, n] of top.slice(0, 12)) {
  console.log(`    ${String(n).padStart(4)}  ${cidade}`);
}
if (top.length > 12) console.log(`    ...e mais ${top.length - 12} municípios`);

console.log("\n  amostra:");
for (const p of alvo.slice(0, 5)) {
  console.log(`    ${p.nome.slice(0, 28).padEnd(30)} ${p.fone}  ${p.municipio}`);
}

if (!aplicar) {
  console.log(`\n  ENSAIO — nada foi gravado. Para cadastrar as ${alvo.length}:\n`);
  console.log("    node scripts/cadastrar-quem-citou-cidade.mjs --aplicar\n");
  await c.end();
  process.exit(0);
}

// ── GRAVAR ──────────────────────────────────────────────────────────────────
//
// Numa transação só: ou entram todas, ou nenhuma. Meia importação é pior que
// nenhuma, porque ninguém sabe onde parou.
await c.query("begin");
try {
  const { rowCount } = await c.query(`
    insert into public.liderancas (nome, telefone, municipio, bairro, tipo, created_via)
    select f.nome, f.fone, f.municipio, f.bairro, 'lead', 'conversa'
      from (${ALVO}) f
  `);
  await c.query("commit");
  console.log(`\n  cadastradas: ${rowCount}`);
  const { rows: [d] } = await c.query(
    `select count(*) as total from public.liderancas where created_via = 'conversa'`);
  console.log(`  total com origem "conversa" no banco: ${d.total}`);
  console.log(`\n  Para desfazer, se precisar:`);
  console.log(`    delete from public.liderancas where created_via = 'conversa';\n`);
} catch (e) {
  await c.query("rollback");
  console.log(`\n  FALHOU, nada foi gravado: ${e.message}\n`);
  process.exitCode = 1;
}
await c.end();
