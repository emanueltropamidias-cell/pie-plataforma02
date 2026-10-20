// Compara o banco de uma instalação com o da principal. Só lê.
//
// ── POR QUE EXISTE ───────────────────────────────────────────────────────────
//
// 03/10, Emanuel, na instalação do Manassés: "puxou somente 10k".
//
// O botão "Base completa, tudo junto" tinha ido ao ar na véspera, nos dois
// sites — o código é um repositório só, e a Vercel publica os dois juntos. A
// função que ele chama (`base_tudo_exportar`, 0053) só tinha rodado no banco da
// Talita. No do Manassés o botão devolvia erro, e o único "Base completa" que
// funcionava era o da base da campanha: 9.542, onde a tela mostra 46 mil.
//
// E não era só a 0053. Comparando os dois bancos, faltavam lá 6 funções e
// outras 10 estavam em versão antiga — migrações de 0016 a 0052 que nunca
// foram levadas. Nenhuma delas deu erro em lugar nenhum: a tela simplesmente
// mostrava menos, ou zero.
//
// O código anda sozinho para as duas instalações; o banco, não. Este script é
// a conferência que faltava entre uma coisa e outra.
//
// ── O QUE ELE COMPARA ────────────────────────────────────────────────────────
//
//   funções     nome, argumentos e o CORPO (por md5 de pg_get_functiondef)
//   colunas     tabela, coluna e tipo
//   índices, gatilhos, políticas e os horários do cron
//
// Não compara DADO: cada instalação tem a sua base, e é para ter.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/comparar-instalacoes.mjs --candidato=manasses
//
// Sai com código 1 se houver diferença, para poder entrar em rotina.

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const FOTO = `
  select s.x || E'\\t' || s.h as x from (
    select 'função   ' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
           md5(pg_get_functiondef(p.oid))
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    union all
    select 'coluna   ' || table_name || '.' || column_name, data_type
      from information_schema.columns where table_schema = 'public'
    union all
    select 'índice   ' || indexname, '' from pg_indexes where schemaname = 'public'
    union all
    select distinct 'gatilho  ' || event_object_table || '.' || trigger_name, ''
      from information_schema.triggers where trigger_schema = 'public'
    union all
    select 'política ' || tablename || '.' || policyname, '' from pg_policies where schemaname = 'public'
    union all
    select 'cron     ' || jobname, schedule from cron.job
  ) s (x, h)
  order by 1`;

async function fotografar(candidato) {
  const { conexao, env, candidato: nome } = escolherBanco({ candidato });
  const cliente = new pg.Client({
    ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20_000,
  });
  await cliente.connect();
  try {
    // Só leitura de verdade, e não só de intenção: qualquer escrita falha.
    await cliente.query("set default_transaction_read_only = on");
    const { rows } = await cliente.query(FOTO);
    return { nome, itens: new Map(rows.map((r) => r.x.split("\t"))) };
  } finally {
    await cliente.end();
  }
}

const outra = process.argv.find((a) => a.startsWith("--candidato="))?.slice("--candidato=".length)?.trim();
if (!outra) {
  console.error("Uso: node scripts/comparar-instalacoes.mjs --candidato=manasses");
  process.exit(1);
}

const principal = await fotografar("");
const instalacao = await fotografar(outra);

const falta = [...principal.itens.keys()].filter((k) => !instalacao.itens.has(k));
const sobra = [...instalacao.itens.keys()].filter((k) => !principal.itens.has(k));
const difere = [...principal.itens].filter(([k, h]) => instalacao.itens.has(k) && instalacao.itens.get(k) !== h).map(([k]) => k);

const mostrar = (titulo, lista) => {
  if (!lista.length) return;
  console.log(`\n${titulo} (${lista.length})`);
  for (const k of lista) console.log(`  ${k}`);
};

mostrar(`FALTA em ${instalacao.nome} — existe em ${principal.nome}`, falta);
mostrar(`DIFERENTE entre as duas — mesma coisa, outra versão`, difere);
mostrar(`SÓ em ${instalacao.nome}`, sobra);

const total = falta.length + sobra.length + difere.length;
console.log(
  total
    ? `\n${total} diferença(s). Para cada função, ache a migração mais recente que a define e rode com --candidato=${outra}.`
    : `\nIguais: ${principal.itens.size} itens conferidos nas duas.`,
);
process.exit(total ? 1 : 0);
