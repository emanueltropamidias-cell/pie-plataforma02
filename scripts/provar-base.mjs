// Prova que `supabase/migrations/0000_base.sql` INSTALA DO ZERO.
//
//   node scripts/provar-base.mjs
//
// ── POR QUE ISTO NÃO É OPCIONAL ─────────────────────────────────────────────
//
// Contar objetos no arquivo prova que ele foi ESCRITO, não que ele RODA. E o
// jeito de a base falhar é exatamente esse: uma função que chama outra que
// ainda não existe, uma tabela cuja coluna gerada depende de função ausente,
// uma política que cita uma view criada depois. Nada disso aparece lendo.
//
// ── COMO SE PROVA SEM DOCKER ────────────────────────────────────────────────
//
// O certo seria subir um Supabase vazio e rodar lá. Sem Docker nesta máquina,
// o mais próximo honesto é instalar num SCHEMA NOVO E VAZIO do próprio
// servidor, dentro de uma transação que termina em `rollback`:
//
//   * é vazio de verdade — nada do PIE existe lá dentro, então nenhuma
//     dependência passa por acidente
//   * a ordem é testada de ponta a ponta, uma instrução por vez
//   * `public` não é tocado: a plataforma continua atendendo enquanto roda
//   * o `rollback` desfaz até a criação do schema
//
// ── O QUE ELE NÃO PROVA ─────────────────────────────────────────────────────
//
// Um Supabase novo também não tem os papéis (`anon`, `authenticated`,
// `service_role`) nem o schema `auth` já criados por um projeto em uso. Aqui
// eles existem, então este teste NÃO prova que os `grant` e as chaves
// estrangeiras para `auth.users` funcionam num projeto recém-criado — só que
// o corpo do schema fecha sozinho. Num projeto Supabase novo os dois existem
// desde o início, por isso a lacuna é pequena, mas ela existe e fica dita.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");
const ENSAIO = "zero_teste";

const { conexao } = escolherBanco({ raiz: RAIZ });
const c = new pg.Client(conexao);

// A base e a semente são ensaiadas JUNTAS porque é junto que elas rodam numa
// instalação. Semente que não entra na base recém-criada é o defeito que só
// apareceria no dia do candidato novo.
let sql = `${readFileSync(resolve(RAIZ, "supabase/migrations/0000_base.sql"), "utf8")}
${readFileSync(resolve(RAIZ, "supabase/seed.sql"), "utf8")}`;

// Redireciona o schema, e SÓ o schema. `to public` e `from public` são o PAPEL
// public do Postgres, não o schema — trocar esses quebraria as permissões.
sql = sql
  .replace(/\bpublic\./g, `${ENSAIO}.`)
  // ── auth.users vira um sósia, e isso é o ponto mais importante do arquivo ──
  //
  // A base tem 9 pontos que citam `auth.users`: as chaves estrangeiras e os
  // corpos de função que leem a tabela de login. Num ensaio contra o servidor
  // vivo, criar uma chave estrangeira para `auth.users` pega lock NELA — a
  // tabela de login de PRODUÇÃO. Aconteceu: os logins da equipe ficaram na
  // fila atrás do ensaio até o processo ser derrubado à mão.
  //
  // Apontando para um sósia dentro do schema descartável, o ensaio deixa de
  // encostar em qualquer coisa que a plataforma use. `auth.uid()` fica como
  // está: é chamada de função, não trava tabela nenhuma.
  .replace(/\bauth\.users\b/g, `${ENSAIO}.users`)
  // Pelo mesmo motivo, `storage.objects` e `storage.buckets`: criar política
  // nelas pegaria lock na tabela de ARQUIVOS de produção, e o `drop policy if
  // exists` que vem antes apagaria as políticas de verdade — desfeitas no
  // rollback, mas com a plataforma parada enquanto isso.
  .replace(/\bstorage\./g, `${ENSAIO}.`)
  .replace(/search_path\s*=\s*public\b/g, `search_path = ${ENSAIO}`)
  .replace(/\bschema public\b/g, `schema ${ENSAIO}`)
  // As extensões já existem no servidor; recriá-las no ensaio não acrescenta
  // nada ao que se quer provar.
  .replace(/^create extension .*$/gm, "")
  // ── a classe de operador do pg_trgm ──────────────────────────────────────
  //
  // `pg_trgm` está instalado em `public` (não em `extensions`), e é de lá que
  // vem o `gin_trgm_ops` dos índices de busca por nome. Como o ensaio tira
  // `public` do caminho de propósito, o nome não resolve.
  //
  // Qualificar aqui é legítimo e não afrouxa o teste: classe de operador é
  // peça da extensão, igual para todo projeto, e não estado do banco da
  // Talita. Numa instalação de verdade a base cria `pg_trgm` em `public` e o
  // nome resolve sozinho pelo `search_path`.
  .replace(/\b(gin|gist)_trgm_ops\b/g, "public.$1_trgm_ops");

// Fatia por instrução respeitando os corpos `$$ ... $$`, que contêm ponto e
// vírgula aos montes.
const instrucoes = [];
let atual = "";
let cifrao = null;
for (const linha of sql.split("\n")) {
  if (linha.trimStart().startsWith("--") && !atual.trim()) continue;
  atual += `${linha}\n`;
  for (const m of linha.matchAll(/\$[A-Za-z_]*\$/g)) {
    if (cifrao === null) cifrao = m[0];
    else if (cifrao === m[0]) cifrao = null;
  }
  if (cifrao === null && linha.trimEnd().endsWith(";")) {
    if (atual.trim()) instrucoes.push(atual.trim());
    atual = "";
  }
}

await c.connect();
console.log(`ensaiando ${instrucoes.length} instruções no schema "${ENSAIO}"…\n`);

let falhas = 0;
try {
  // Cinto de segurança: se o ensaio esbarrar em qualquer lock de produção, ele
  // DESISTE em três segundos em vez de esperar — e esperar segurando lock é
  // exatamente o que derrubou o login da equipe da primeira vez. O
  // `idle_in_transaction` garante que um travamento do lado do Node também não
  // deixe a transação aberta segurando o que pegou.
  await c.query("set lock_timeout = '3s'");
  await c.query("set statement_timeout = '300s'");

  await c.query("begin");
  await c.query(`create schema ${ENSAIO}`);
  // ── `public` FORA do caminho, e isto não é detalhe ────────────────────────
  //
  // Com `public` no `search_path`, um nome sem schema no arquivo — como
  // `nextval('tags_id_seq')` — encontra o objeto de PRODUÇÃO e o ensaio passa
  // sem a base estar inteira. Foi assim que a falta dos `create sequence`
  // quase passou batido: 36 tabelas criadas, todas emprestando a sequência do
  // banco da Talita.
  //
  // Um projeto novo não tem de quem emprestar. O ensaio também não pode ter.
  //
  // O `gin_trgm_ops` dos índices de busca por nome é o único nome que
  // legitimamente vinha de fora; ele é qualificado lá em cima, na reescrita.
  await c.query(`set search_path = ${ENSAIO}, pg_temp`);
  // Os sósias. `auth.users` só precisa da coluna que as chaves estrangeiras
  // apontam; as do Storage copiam as colunas de verdade com `like`, que pega
  // só um lock de leitura e some no mesmo instante — assim as políticas de
  // arquivo são validadas contra as colunas certas.
  await c.query(`create table ${ENSAIO}.users (id uuid primary key)`);
  await c.query(`create table ${ENSAIO}.objects (like storage.objects)`);
  await c.query(`create table ${ENSAIO}.buckets (like storage.buckets including all)`);
  await c.query("set check_function_bodies = off");

  // ── uma viagem, e não novecentas ──────────────────────────────────────────
  //
  // O banco fica em São Paulo. Mandar as 922 instruções uma a uma dá quase
  // três mil idas e voltas e leva minutos — tempo em que a conexão do pooler
  // cai no meio, que foi o que aconteceu. Mandadas juntas, é uma viagem só.
  //
  // O preço é não saber QUAL instrução quebrou. Por isso o segundo modo: se o
  // lote falhar, o ensaio refaz uma a uma, com savepoint, só para localizar a
  // culpada. O caminho lento é diagnóstico, não é o normal.
  try {
    await c.query(instrucoes.join("\n"));
  } catch (eLote) {
    console.log(`o lote falhou (${eLote.message}) — refazendo uma a uma para achar onde\n`);
    await c.query("rollback");
    await c.query("begin");
    await c.query(`create schema ${ENSAIO}`);
    await c.query(`set search_path = ${ENSAIO}, pg_temp`);
    await c.query(`create table ${ENSAIO}.users (id uuid primary key)`);
    await c.query(`create table ${ENSAIO}.objects (like storage.objects)`);
    await c.query(`create table ${ENSAIO}.buckets (like storage.buckets including all)`);
    await c.query("set check_function_bodies = off");

    for (const [i, s] of instrucoes.entries()) {
      // O savepoint vem ANTES: no Postgres um erro aborta a transação inteira,
      // e sem ponto de retorno já marcado a primeira falha derruba o ensaio.
      // Com ele, dá para colher TODAS as falhas numa rodada só.
      await c.query("savepoint sp");
      try {
        await c.query(s);
        await c.query("release savepoint sp");
      } catch (e) {
        falhas++;
        const cabeca = s.split("\n").slice(0, 3).join("\n");
        console.log(`✗ instrução ${i + 1}: ${e.message}\n${cabeca}\n`);
        await c.query("rollback to sp");
        await c.query("release savepoint sp");
        if (falhas > 25) {
          console.log("… parando: falhas demais para valer a pena continuar");
          break;
        }
      }
    }
  }

  // A prova real: as funções foram guardadas sem validação (o
  // `check_function_bodies = off` que a base precisa). Ligar a validação e
  // reescrever cada uma força o Postgres a resolver todos os nomes de tabela e
  // de coluna que os corpos citam.
  console.log("validando os corpos das funções…");
  await c.query("set check_function_bodies = on");
  const { rows: fs } = await c.query(
    `select proname, pg_get_functiondef(p.oid) as def
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1 and p.prokind = 'f' order by proname`,
    [ENSAIO],
  );
  let corposRuins = 0;
  // Mesma lógica do lote acima: as 77 de uma vez, e uma a uma só se quebrar.
  try {
    await c.query(fs.map((f) => `${f.def};`).join("\n"));
  } catch {
    for (const f of fs) {
      await c.query("savepoint vf");
      try {
        await c.query(f.def);
        await c.query("release savepoint vf");
      } catch (e) {
        corposRuins++;
        console.log(`✗ corpo de ${f.proname}(): ${e.message}`);
        await c.query("rollback to vf");
      }
    }
  }

  const conta = async (sqlConta) => (await c.query(sqlConta, [ENSAIO])).rows[0].n;
  console.log("\n── o que o ensaio produziu ──");
  console.table({
    // Fora o sósia de `auth.users`, que é andaime do ensaio e não da base.
    tabelas: await conta(`select count(*)::int n from pg_class c join pg_namespace x on x.oid=c.relnamespace where x.nspname=$1 and c.relkind='r' and c.relname not in ('users','objects','buckets')`),
    views: await conta(`select count(*)::int n from pg_class c join pg_namespace x on x.oid=c.relnamespace where x.nspname=$1 and c.relkind='v'`),
    funcoes: await conta(`select count(*)::int n from pg_proc p join pg_namespace x on x.oid=p.pronamespace where x.nspname=$1 and p.prokind='f'`),
    gatilhos: await conta(`select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace x on x.oid=c.relnamespace where x.nspname=$1 and not t.tgisinternal`),
    indices: await conta(`select count(*)::int n from pg_indexes where schemaname=$1 and tablename not in ('users','objects','buckets')`),
    sequencias: await conta(`select count(*)::int n from pg_class c join pg_namespace x on x.oid=c.relnamespace where x.nspname=$1 and c.relkind='S'`),
    politicas: await conta(`select count(*)::int n from pg_policies where schemaname=$1 and tablename<>'objects'`),
    municipios: { n: (await c.query(`select count(*)::int n from ${ENSAIO}.municipios_ba`)).rows[0].n },
    etiquetas: { n: (await c.query(`select count(*)::int n from ${ENSAIO}.tags`)).rows[0].n },
    setores: { n: (await c.query(`select count(*)::int n from ${ENSAIO}.departamentos`)).rows[0].n },
    baldes: { n: (await c.query(`select count(*)::int n from ${ENSAIO}.buckets`)).rows[0].n },
    politicas_de_arquivo: { n: (await c.query(`select count(*)::int n from pg_policies where schemaname=$1 and tablename='objects'`, [ENSAIO])).rows[0].n },
    corpos_invalidos: { n: corposRuins },
    instrucoes_falhas: { n: falhas },
  });
} finally {
  // Sempre. Mesmo se estourar no meio — o ensaio não deixa rastro.
  await c.query("rollback").catch(() => {});
  await c.end();
}

process.exit(falhas ? 1 : 0);
