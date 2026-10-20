// Cadastra TODO MUNDO que conversou com a campanha e nunca virou ficha.
//
// ── O PEDIDO ─────────────────────────────────────────────────────────────────
//
// 01/10, Emanuel: "preciso que as 38 mil pessoas entrem na base, mesmo que seja
// só o número".
//
// ── 38 MIL NÃO EXISTEM COMO DADO, E ISSO PRECISA ESTAR ESCRITO ───────────────
//
// O 38.360 é a linha "Conversas iniciadas" do painel da Meta. Ela conta
// CONVERSAS, não pessoas, e conta o clique que abriu o WhatsApp mesmo quando a
// pessoa não chegou a mandar nada.
//
// A Meta não entrega telefone — isso está medido e escrito nas regras do
// projeto: "Não existe origem do lead. Nenhum campo liga a pessoa ao anúncio."
//
// Então a diferença entre 38.360 e o que o PIE conhece não é gente que ficou de
// fora de uma lista: é gente de quem NÃO EXISTE NÚMERO em lugar nenhum. Não há
// o que importar. O que dá para fazer é fechar o buraco de verdade, que é outro
// e é grande: quem falou, tem número guardado, e nunca virou ficha.
//
// ── O QUE ESTE SCRIPT FAZ ────────────────────────────────────────────────────
//
// Pega quem tem conversa em `conversas`, não está em `liderancas`, e cria a
// ficha com o que existir — nome do WhatsApp quando há, cidade quando ela foi
// dita e bate com um dos 417 municípios, e o número sempre.
//
// ── POR QUE NÃO USA `cadastrar_manual` ───────────────────────────────────────
//
// Porque ela também INSERE UMA CONVERSA, e estas pessoas já têm a delas —
// passar por ali criaria uma conversa duplicada por pessoa. Mesmo motivo do
// `cadastrar-quem-citou-cidade.mjs`, que fez o lote anterior.
//
// ── POR QUE UM MARCADOR PRÓPRIO ──────────────────────────────────────────────
//
// O lote de setembro usou `created_via = 'conversa'` e tem 1.157 linhas.
// Reusar o mesmo marcador faria o desfazer de um apagar o outro. Este lote é
// `conversa_sem_ficha`, e sai inteiro com um delete só.
//
// ── LID FICA DE FORA ─────────────────────────────────────────────────────────
//
// O WhatsApp passou a usar identificadores opacos (`180088146530322`) no lugar
// do número. Eles estão em `conversas.telefone` e NÃO são telefone de ninguém:
// viraria ficha que não disca, não recebe e não cruza com base nenhuma. Só
// entra o que tem 10 ou 11 dígitos depois de `fone_canonico`.
//
// ── USO ──────────────────────────────────────────────────────────────────────
//
//   node scripts/cadastrar-todo-mundo-que-falou.mjs             # só mostra
//   node scripts/cadastrar-todo-mundo-que-falou.mjs --aplicar   # grava
//
// Pode rodar de novo: quem já está cadastrado não entra duas vezes.

import pg from "pg";
import { readFileSync } from "node:fs";
import { escolherBanco } from "./banco.mjs";

// ── A LISTA DE DDD VEM DE `src/lib/telefone.ts` ─────────────────────────────
//
// E não escrita aqui. Ela já existe lá, é quem recusa o que a equipe digita, e
// já estava duplicada uma vez (em `agenda-wa.ts`) — unificada em 30/09 pelo
// motivo de sempre: duas cópias da mesma lista desencontram, e bastava a
// Anatel criar um DDD para um lugar aceitar o que o outro recusa.
//
// Sem isto, 2 fichas entrariam com DDD 80, que não existe no Brasil.
const DDDS = (() => {
  const fonte = readFileSync(new URL("../src/lib/telefone.ts", import.meta.url), "utf8");
  const i = fonte.indexOf("export const DDDS = new Set([");
  if (i < 0) throw new Error("não achei DDDS em src/lib/telefone.ts");
  return fonte
    .slice(i, fonte.indexOf("]);", i))
    .match(/\b\d{2}\b/g)
    .map(Number);
})();

const aplicar = process.argv.includes("--aplicar");
const { conexao, env } = escolherBanco();
const c = new pg.Client({
  ...(conexao ?? { connectionString: env.SUPABASE_DB_URL }),
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 25_000,
  query_timeout: 600_000,
});
await c.connect();

// Um telefone, uma forma. `liderancas.telefone` está gravado de todo jeito —
// com espaço na frente, com +55, com hífen —, então a comparação é pela forma
// canônica dos dois lados. Sem isso o "já está cadastrado" falha e a mesma
// pessoa entra de novo.
const ALVO = `
  with cadastrados as (
    select distinct public.fone_canonico(telefone) as f
      from public.liderancas where telefone is not null
  ),
  falantes as (
    select public.fone_canonico(c.telefone)                                  as fone,
           -- O nome do WhatsApp serve. É o que a pessoa escolheu se chamar, e
           -- é melhor que ficha anônima: a atendente reconhece quem é.
           max(coalesce(nullif(btrim(c.nome), ''),
                        nullif(btrim(c.nome_sugerido), '')))                 as nome,
           max(coalesce(c.municipio, c.municipio_sugerido))                  as cidade,
           max(nullif(btrim(c.bairro), ''))                                  as bairro
      from public.conversas c
     where c.telefone is not null
       and c.telefone not like 'lid.%'
     group by 1
  )
  select f.fone,
         -- NOT NULL na tabela. "Sem nome" é honesto e some na busca por nome;
         -- inventar rótulo bonito faria 134 fichas parecerem uma categoria.
         coalesce(f.nome, 'Sem nome')                                        as nome,
         f.bairro,
         -- Cidade SÓ quando ela casa com um dos 417 municípios. Deduzir pelo
         -- DDD seria inventar: o 75 vai de Feira de Santana a Paulo Afonso,
         -- 400 km. Base inventada é pior que base vazia.
         mb.nome                                                             as municipio
    from falantes f
    left join public.municipios_ba mb
           on mb.chave = public.chave_municipio(f.cidade)
   where length(f.fone) in (10, 11)
     and left(f.fone, 2)::int = any($1::int[])
     and not exists (select 1 from cadastrados x where x.f = f.fone)
`;

const { rows: alvo } = await c.query(`${ALVO} order by f.fone`, [DDDS]);

const comNome = alvo.filter((p) => p.nome !== "Sem nome").length;
const comCidade = alvo.filter((p) => p.municipio).length;

console.log(`\n  pessoas a cadastrar: ${alvo.length.toLocaleString("pt-BR")}`);
console.log(`    com nome do WhatsApp: ${comNome.toLocaleString("pt-BR")}`);
console.log(`    só o número:          ${(alvo.length - comNome).toLocaleString("pt-BR")}`);
console.log(`    com município:        ${comCidade.toLocaleString("pt-BR")}`);

const BA = new Set(["71", "73", "74", "75", "77"]);
const daBahia = alvo.filter((p) => BA.has(p.fone.slice(0, 2))).length;
console.log(`    DDD da Bahia:         ${daBahia.toLocaleString("pt-BR")}`);
console.log(`    DDD de fora:          ${(alvo.length - daBahia).toLocaleString("pt-BR")}`);

if (alvo.length === 0) {
  console.log("\n  Nada a fazer.\n");
  await c.end();
  process.exit(0);
}

console.log("\n  amostra:");
for (const p of alvo.slice(0, 6)) {
  console.log(
    `    ${String(p.nome).slice(0, 26).padEnd(28)} ${p.fone.padEnd(12)} ${p.municipio ?? "—"}`,
  );
}

const { rows: [antes] } = await c.query("select count(*) n from public.liderancas");
console.log(`\n  a rede tem hoje:  ${Number(antes.n).toLocaleString("pt-BR")}`);
console.log(`  ficaria com:      ${(Number(antes.n) + alvo.length).toLocaleString("pt-BR")}`);

if (!aplicar) {
  console.log(`\n  ENSAIO — nada foi gravado. Para cadastrar as ${alvo.length.toLocaleString("pt-BR")}:\n`);
  console.log("    node scripts/cadastrar-todo-mundo-que-falou.mjs --aplicar\n");
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
    select f.nome, f.fone, f.municipio, f.bairro, 'lead', 'conversa_sem_ficha'
      from (${ALVO}) f
  `, [DDDS]);
  await c.query("commit");

  const { rows: [depois] } = await c.query("select count(*) n from public.liderancas");
  console.log(`\n  cadastradas: ${rowCount.toLocaleString("pt-BR")}`);
  console.log(`  a rede agora tem: ${Number(depois.n).toLocaleString("pt-BR")}`);
  console.log(`\n  Para desfazer ESTE lote, sem tocar nos outros:`);
  console.log(`    delete from public.liderancas where created_via = 'conversa_sem_ficha';\n`);
} catch (e) {
  await c.query("rollback");
  console.log(`\n  FALHOU, nada foi gravado: ${e.message}\n`);
  process.exitCode = 1;
}
await c.end();
