// Testa se este computador consegue falar com o banco. Nada mais.
//
// ── POR QUE EXISTE ───────────────────────────────────────────────────────────
//
// Depois de trocar a senha do banco, ou de configurar uma máquina nova, a
// pergunta é uma só: "ficou certo?". Até hoje a resposta só aparecia na hora em
// que alguém ia rodar uma migração de verdade — que é o pior momento possível
// para descobrir que a senha está errada.
//
// `rodar-sql.mjs --ajuda` NÃO serve para isso: ele imprime o texto de uso sem
// abrir conexão, e responde igual com a senha certa ou errada.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/testar-conexao.mjs
//   node scripts/testar-conexao.mjs --candidato=manasses
//
// Funciona igual no Mac e no Windows.

import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const { conexao, env } = escolherBanco();

const cliente = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20_000,
  query_timeout: 20_000,
});

const t0 = Date.now();

try {
  await cliente.connect();
  const { rows } = await cliente.query(`
    select current_user                                as usuario,
           current_database()                          as banco,
           (select count(*) from public.conversas)     as conversas,
           (select count(*) from public.mensagens)     as mensagens,
           (select count(*) from public.liderancas)    as cadastros,
           pg_size_pretty(pg_database_size(current_database())) as tamanho
  `);
  const r = rows[0];
  console.log(`\n  ✓ CONECTOU em ${Date.now() - t0}ms\n`);
  console.log(`    usuário     ${r.usuario}`);
  console.log(`    banco       ${r.banco} (${r.tamanho})`);
  console.log(`    conversas   ${Number(r.conversas).toLocaleString("pt-BR")}`);
  console.log(`    mensagens   ${Number(r.mensagens).toLocaleString("pt-BR")}`);
  console.log(`    cadastros   ${Number(r.cadastros).toLocaleString("pt-BR")}\n`);
  await cliente.end();
} catch (e) {
  console.log(`\n  ✗ NÃO CONECTOU (${Date.now() - t0}ms)\n`);
  console.log(`    ${e.message}\n`);

  // Traduzir o erro do Postgres para a coisa que precisa ser arrumada. O texto
  // original é em inglês e não diz o que fazer.
  const m = e.message.toLowerCase();
  if (/password|authentication|senha/.test(m)) {
    // ── ANTES DE MANDAR CONFERIR O ARQUIVO, MANDE ESPERAR ────────────────────
    //
    // O pooler segura a senha ANTIGA em cache por alguns segundos depois de um
    // reset. Em 14/09 a primeira tentativa falhou com o .env.local JÁ CORRETO, e
    // a conferência ia recomeçar do zero — vinte segundos depois entrou sozinho.
    //
    // Vem primeiro de propósito: mandar reconferir um arquivo certo é o conselho
    // mais caro que este script pode dar.
    console.log("    Se você ACABOU de resetar a senha, espere meio minuto e");
    console.log("    rode de novo: o pooler do Supabase ainda pode estar");
    console.log("    respondendo com a senha antiga. Só depois disso vale");
    console.log("    desconfiar do arquivo.\n");
    console.log("    Persistindo, a senha não bate com a do Supabase. No .env.local:");
    console.log("      SUPABASE_DB_PASSWORD=asenha");
    console.log("    Sem aspas, sem espaço antes ou depois do =, e sem os");
    console.log("    caracteres @ : / ? # % — eles quebram o endereço de conexão.\n");
  } else if (/enotfound|getaddrinfo|dns/.test(m)) {
    console.log("    Não achou o servidor: confira a NEXT_PUBLIC_SUPABASE_URL,");
    console.log("    ou é a internet desta máquina que está fora.\n");
  } else if (/timeout|etimedout/.test(m)) {
    console.log("    O servidor não respondeu a tempo. Pode ser o banco");
    console.log("    reiniciando, ou a rede daqui. Tente de novo em 1 minuto.\n");
  } else if (/does not exist|role/.test(m)) {
    console.log("    Usuário inválido: confira o endereço do projeto na");
    console.log("    NEXT_PUBLIC_SUPABASE_URL.\n");
  }
  process.exit(1);
}
