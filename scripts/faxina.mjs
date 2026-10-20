// Faxina do banco: tira o lixo que o uso do dia a dia deixa para trás.
//
// ── O QUE É O LIXO ───────────────────────────────────────────────────────────
//
// O Postgres nunca altera uma linha no lugar. Todo `update` escreve uma linha
// NOVA e marca a velha como morta; todo `delete` só marca. As mortas ficam no
// arquivo ocupando espaço, e a mesma consulta passa a ler mais páginas de disco
// para achar o mesmo dado.
//
// `conversas` recebe `update` a cada mensagem que chega — última mensagem,
// horário, contador. São milhares por dia, e cada um deixa uma linha morta.
//
// O autovacuum limpa sozinho, mas ele só acorda quando a proporção de mortas
// passa de um limite. Numa tabela que cresce devagar e é muito atualizada, como
// `liderancas`, ele pode passar dias sem rodar — e foi o que aconteceu.
//
// ── POR QUE UM SCRIPT, E NÃO SQL NO rodar-sql ────────────────────────────────
//
// `vacuum` e `reindex concurrently` NÃO rodam dentro de transação, e o
// `rodar-sql.mjs` manda o arquivo inteiro numa chamada só — o que o Postgres
// embrulha numa transação implícita de propósito, para não existir migração
// pela metade. Aqui é o contrário: cada comando é independente e tem de ir
// sozinho.
//
// ── O QUE ESTE SCRIPT NÃO FAZ ────────────────────────────────────────────────
//
// `vacuum full`, que é o único que devolve espaço ao sistema operacional. Ele
// TRAVA A TABELA INTEIRA enquanto reescreve — em `mensagens`, com 291 MB, isso
// é a caixa de atendimento parada por minutos no meio do expediente. O `vacuum`
// comum devolve o espaço para o próprio Postgres reusar, que é o que resolve a
// lentidão, e roda com a plataforma no ar.
//
// E não apaga DADO nenhum. Nenhuma conversa, nenhuma mensagem, nenhuma
// liderança. Só o lixo que já estava invisível.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/faxina.mjs
//   node scripts/faxina.mjs --candidato=manasses

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const { conexao, env } = escolherBanco();
const cliente = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
});

const mb = (b) => `${(Number(b) / 1024 / 1024).toFixed(1)} MB`;

async function medir() {
  const { rows } = await cliente.query(`
    select relname as tabela,
           n_live_tup as vivas,
           n_dead_tup as mortas,
           pg_total_relation_size(relid) as bytes
      from pg_stat_user_tables
     where schemaname = 'public' and (n_dead_tup > 0 or n_live_tup > 1000)
     order by pg_total_relation_size(relid) desc
  `);
  return rows;
}

try {
  await cliente.connect();

  // O mesmo teto do rodar-sql. `vacuum` comum não pega trava exclusiva, mas
  // `reindex concurrently` espera transação antiga terminar — e esperar é o que
  // deixa a fila de atendimento parada atrás da manutenção.
  await cliente.query("set lock_timeout = '5s'");

  // ── 0. REFAZER O RETRATO ANTES DE OLHAR ───────────────────────────────────
  //
  // `medir()` decide o que limpar lendo `pg_stat_user_tables`. Esses números
  // NÃO sobrevivem a um restart do banco: em 12/09, depois da queda, `conversas`
  // marcava 56 linhas vivas e `mensagens` 318 — quando tinham 10.701 e 71.573.
  //
  // Duas consequências, e a segunda é pior:
  //
  //   1. a faxina não enxerga o que limpar, porque tudo parece vazio
  //   2. o PLANEJADOR usa esse mesmo retrato para escolher plano de consulta, e
  //      tabela que ele acha vazia ele varre inteira em vez de usar índice
  //
  // `analyze` sem nome de tabela refaz o retrato da base toda. É barato (lê uma
  // amostra, não a tabela), não tranca nada, e roda com a plataforma no ar.
  const tAnalyze = Date.now();
  await cliente.query("analyze");
  console.log(`\nretrato do planejador refeito em ${Date.now() - tAnalyze}ms`);

  const antes = await medir();
  console.log("\n── ANTES ──────────────────────────────────────────────────");
  console.table(
    antes.map((r) => ({
      tabela: r.tabela,
      vivas: Number(r.vivas).toLocaleString("pt-BR"),
      mortas: Number(r.mortas).toLocaleString("pt-BR"),
      pct: r.vivas > 0 ? `${((100 * r.mortas) / r.vivas).toFixed(1)}%` : "-",
      tamanho: mb(r.bytes),
    })),
  );

  // ── 1. VACUUM ANALYZE ─────────────────────────────────────────────────────
  //
  // `analyze` junto porque as duas coisas andam juntas: o vacuum libera o
  // espaço e o analyze conta ao planejador como a tabela ficou. Sem o analyze,
  // o planejador continua decidindo pelo retrato velho — e escolher o plano
  // errado custa mais caro que ler algumas páginas mortas.
  console.log("\n── LIMPANDO ───────────────────────────────────────────────");
  for (const r of antes) {
    const t0 = Date.now();
    try {
      await cliente.query(`vacuum (analyze) public.${r.tabela}`);
      console.log(`  ok    ${r.tabela.padEnd(22)} ${Date.now() - t0}ms`);
    } catch (e) {
      // Uma tabela que falha não pode interromper a faxina das outras.
      console.log(`  FALHA ${r.tabela.padEnd(22)} ${e.message}`);
    }
  }

  // ── 2. REINDEX DOS ÍNDICES INCHADOS ───────────────────────────────────────
  //
  // O vacuum limpa a TABELA. O índice é outro arquivo, e ele incha do mesmo
  // jeito — em `liderancas`, a chave primária ocupava 1.216 kB para 7.650 uuids
  // que caberiam em um quarto disso.
  //
  // `concurrently` é obrigatório aqui: a versão sem ele trava a tabela contra
  // escrita enquanto reconstrói, e escrita em `liderancas` é cadastro de
  // atendente acontecendo agora.
  console.log("\n── RECONSTRUINDO ÍNDICES INCHADOS ─────────────────────────");
  const { rows: indices } = await cliente.query(`
    select s.relname as tabela, s.indexrelname as indice,
           pg_relation_size(s.indexrelid) as bytes,
           t.n_live_tup as linhas
      from pg_stat_user_indexes s
      join pg_stat_user_tables t on t.relid = s.relid
     where s.schemaname = 'public'
       and t.n_live_tup > 0
       -- Mais de 150 bytes por linha num índice é inchaço: uuid ocupa 16,
       -- bigint ocupa 8, e o resto é estrutura da árvore.
       and pg_relation_size(s.indexrelid) / t.n_live_tup > 150
       and pg_relation_size(s.indexrelid) > 300000
     order by pg_relation_size(s.indexrelid) desc
  `);

  if (indices.length === 0) console.log("  nenhum índice inchado.");
  for (const i of indices) {
    const t0 = Date.now();
    try {
      await cliente.query(`reindex index concurrently public.${i.indice}`);
      const { rows: [d] } = await cliente.query(
        "select pg_relation_size($1::regclass) as bytes", [`public.${i.indice}`]);
      console.log(
        `  ok    ${i.indice.padEnd(32)} ${mb(i.bytes)} → ${mb(d.bytes)}  ${Date.now() - t0}ms`,
      );
    } catch (e) {
      console.log(`  FALHA ${i.indice.padEnd(32)} ${e.message}`);
    }
  }

  const depois = await medir();
  console.log("\n── DEPOIS ─────────────────────────────────────────────────");
  const mapa = Object.fromEntries(antes.map((r) => [r.tabela, r]));
  console.table(
    depois.map((r) => ({
      tabela: r.tabela,
      mortas: `${Number(mapa[r.tabela]?.mortas ?? 0).toLocaleString("pt-BR")} → ${Number(r.mortas).toLocaleString("pt-BR")}`,
      tamanho: `${mb(mapa[r.tabela]?.bytes ?? 0)} → ${mb(r.bytes)}`,
    })),
  );

  const ganho =
    antes.reduce((s, r) => s + Number(r.bytes), 0) -
    depois.reduce((s, r) => s + Number(r.bytes), 0);
  console.log(
    `\nEspaço devolvido para reuso: ${mb(Math.max(0, ganho))}. Nenhum dado foi apagado.\n`,
  );
} catch (erro) {
  console.error(`\nFALHOU: ${erro.message}`);
  process.exitCode = 1;
} finally {
  await cliente.end().catch(() => {});
}
