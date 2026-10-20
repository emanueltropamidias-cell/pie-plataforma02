// Gera `supabase/migrations/0000_base.sql` a partir do banco VIVO.
//
//   node scripts/gerar-base.mjs
//
// ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
//
// Os 75 arquivos em `supabase/` foram escritos incrementalmente, sempre contra
// um banco que já existia. Ninguém nunca instalou o PIE do zero, e a ordem
// certa só existe no histórico do git — quatro arquivos definem
// `receber_mensagem`, quatro definem `so_digitos`, três definem
// `atribuir_conversa`. Rodar na ordem errada instala a versão VELHA por cima da
// nova, sem erro nenhum.
//
// A saída não é descobrir a ordem certa daqueles arquivos. É parar de depender
// dela: o banco vivo é a única prova do que funciona hoje, e é dele que a base
// é gerada.
//
// ── POR QUE NÃO O `supabase db dump` ─────────────────────────────────────────
//
// Ele roda o `pg_dump` dentro de um contêiner e exige Docker, que não existe
// nesta máquina. Este gerador usa a introspecção do próprio Postgres —
// `pg_get_functiondef`, `pg_get_viewdef`, `pg_get_indexdef`,
// `pg_get_constraintdef`, `pg_get_triggerdef` — que são as mesmas funções que o
// `psql` usa para desenhar o `\d`.
//
// ── A ORDEM, QUE É O MIOLO ───────────────────────────────────────────────────
//
// Existe uma dependência circular real:
//
//   `etiquetas_pendentes.digitos` é coluna GERADA por `public.so_digitos()`
//     -> a função precisa existir ANTES da tabela
//
//   `metricas_atendimento` é `language sql` e lê `public.conversas`
//     -> a tabela precisa existir ANTES da função
//
// O Postgres resolve isso com `check_function_bodies = off`: o corpo passa a
// ser guardado sem validar os nomes, e a validação acontece na primeira
// execução. É o mesmo recurso que o `pg_dump` usa, e é por isso que funções vêm
// antes de tabelas aqui.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import pg from "pg";
import { escolherBanco } from "./banco.mjs";

const RAIZ = resolve(dirname(new URL(import.meta.url).pathname), "..");


const { conexao } = escolherBanco({ raiz: RAIZ });
const c = new pg.Client(conexao);
await c.connect();

const q = async (sql, p = []) => (await c.query(sql, p)).rows;
const partes = [];
const secao = (titulo, comentario) =>
  partes.push(
    `\n-- ${"═".repeat(74)}\n-- ${titulo}\n-- ${"═".repeat(74)}` +
      (comentario ? `\n--\n-- ${comentario.replace(/\n/g, "\n-- ")}` : ""),
  );

// ── EXTENSÕES ────────────────────────────────────────────────────────────────
secao(
  "EXTENSÕES",
  "Vêm primeiro porque tudo o mais pode depender delas. `unaccent` e `pg_trgm`\nsustentam a busca por nome e o cruzamento de município.",
);
for (const e of await q(`
  select extname, n.nspname as esquema
    from pg_extension e join pg_namespace n on n.oid = e.extnamespace
   where extname not in ('plpgsql')
   order by extname`))
  partes.push(
    `create extension if not exists "${e.extname}" with schema ${e.esquema};`,
  );

// ── TIPOS ────────────────────────────────────────────────────────────────────
const tipos = await q(`
  select t.typname,
         string_agg(quote_literal(e.enumlabel), ', ' order by e.enumsortorder) as valores
    from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    join pg_namespace n on n.oid = t.typnamespace
   where n.nspname = 'public'
   group by t.typname order by t.typname`);
if (tipos.length) {
  secao("TIPOS");
  for (const t of tipos)
    partes.push(`create type public.${t.typname} as enum (${t.valores});`);
}

// ── FUNÇÕES ──────────────────────────────────────────────────────────────────
//
// Elas saem em DOIS blocos, e a razão é uma dependência que anda nos dois
// sentidos:
//
//   `etiquetas_pendentes.digitos` é coluna gerada por `so_digitos()`
//     -> a função tem de vir ANTES da tabela
//
//   `supervisao_lista()` devolve `setof conversas`
//     -> a TABELA tem de vir antes da função, porque o tipo de retorno é
//        resolvido na hora de criar, e o `check_function_bodies = off` não
//        cobre isso: ele solta o CORPO, não a assinatura
//
// Então: primeiro só as poucas de que as tabelas precisam, e depois todas, já
// com tabelas e views no lugar. O segundo bloco é `create or replace`, então
// repetir as primeiras não custa nada.
const funcoes = await q(`
  select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
     and p.oid not in (select objid from pg_depend where deptype = 'e')
   order by p.proname`);

// O corte é pelo TIPO, e não por quem chama quem.
//
// Tentei antes listar "as funções que as tabelas citam" e o recorte ficou
// estreito: `etiquetas_pendentes.digitos` chama `so_digitos()`, que chama
// `ddd_valido()` por dentro — e criar a coluna gerada resolve a cadeia inteira.
// A view `departamentos_painel` chama `departamento_aberto()`. Perseguir essas
// cadeias à mão é errar de novo mais tarde.
//
// A pergunta certa é a inversa: quais funções NÃO PODEM vir antes das tabelas?
// Só as que mencionam uma tabela no TIPO — `setof conversas`, um parâmetro do
// tipo da linha. Essas o Postgres resolve na hora de criar, e o
// `check_function_bodies = off` não ajuda, porque ele solta o corpo e não a
// assinatura. Todo o resto pode nascer primeiro, e nasce.
const dependeDeTipoDeTabela = new Set(
  (
    await q(`
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and exists (
         select 1 from pg_class c
          join pg_namespace cn on cn.oid = c.relnamespace
         where cn.nspname = 'public' and c.relkind in ('r', 'v')
           and (c.reltype = p.prorettype
                or c.reltype = any(p.proargtypes::oid[])))`)
  ).map((r) => r.proname),
);

secao(
  "FUNÇÕES QUE NÃO DEPENDEM DE TABELA",
  "Vêm antes das tabelas porque as tabelas precisam delas: `so_digitos()` é\nchamada por uma coluna gerada, e `departamento_aberto()` por uma view. Os\ncorpos que leem tabela passam por causa do `check_function_bodies = off`.",
);
for (const f of funcoes)
  if (!dependeDeTipoDeTabela.has(f.proname)) partes.push(`${f.def};`);

// ── SEQUÊNCIAS ───────────────────────────────────────────────────────────────
//
// As colunas `id` são `serial` à moda antiga: o padrão é
// `nextval('tags_id_seq'::regclass)`, e a sequência é um objeto separado que
// precisa existir ANTES da tabela.
//
// Isto quase passou batido. O ensaio num schema vazio criou as tabelas sem
// erro porque o nome SEM SCHEMA encontrou a sequência de PRODUÇÃO pelo
// `search_path` — a base parecia inteira e não era. Num projeto novo, onde não
// há produção para emprestar, o `create table` falharia na primeira tabela.
//
// Por isso duas coisas aqui: criar as sequências, e qualificar o `nextval` com
// o schema para que ele nunca mais possa achar a de outro lugar.
const sequencias = await q(`
  select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'S'
     -- As de coluna de identidade são criadas junto com a tabela; recriá-las
     -- à mão daria conflito de nome.
     and not exists (
       select 1 from pg_depend d
        where d.objid = c.oid and d.deptype = 'i')
   order by c.relname`);
if (sequencias.length) {
  secao("SEQUÊNCIAS");
  for (const s of sequencias)
    partes.push(`create sequence if not exists public.${s.relname};`);
}

// ── TABELAS ──────────────────────────────────────────────────────────────────
secao(
  "TABELAS",
  "Só colunas e valores padrão. Chaves e restrições vêm depois, para que a ordem\nentre tabelas deixe de importar — uma chave estrangeira não pode apontar para\numa tabela que ainda não existe.",
);
const tabelas = (
  await q(`
  select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
   order by c.relname`)
).map((t) => t.relname);

for (const t of tabelas) {
  const cols = await q(
    `select a.attname,
            format_type(a.atttypid, a.atttypmod) as tipo,
            a.attnotnull as obrigatoria,
            pg_get_expr(d.adbin, d.adrelid) as padrao,
            a.attgenerated as gerada,
            a.attidentity as identidade
       from pg_attribute a
       left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
      where a.attrelid = ('public.' || quote_ident($1))::regclass
        and a.attnum > 0 and not a.attisdropped
      order by a.attnum`,
    [t],
  );
  const linhas = cols.map((col) => {
    let s = `  ${col.attname} ${col.tipo}`;
    if (col.identidade)
      s += ` generated ${col.identidade === "a" ? "always" : "by default"} as identity`;
    else if (col.gerada === "s") s += ` generated always as (${col.padrao}) stored`;
    else if (col.padrao)
      // `nextval('tags_id_seq')` sem schema procura pelo `search_path` e pode
      // achar a sequência de outro schema. Qualificado, só acha a certa.
      s += ` default ${col.padrao.replace(/nextval\('(?!public\.)/g, "nextval('public.")}`;
    if (col.obrigatoria) s += " not null";
    return s;
  });
  partes.push(
    `create table if not exists public.${t} (\n${linhas.join(",\n")}\n);`,
  );
}

// ── DONO DAS SEQUÊNCIAS ──────────────────────────────────────────────────────
//
// Depois das tabelas, porque a coluna precisa existir. Sem o dono, apagar a
// tabela deixa a sequência órfã para trás — e é assim que o banco de produção
// está.
if (sequencias.length) {
  secao("A QUEM CADA SEQUÊNCIA PERTENCE");
  for (const d of await q(`
    select s.relname as seq, t.relname as tabela, a.attname as coluna
      from pg_depend d
      join pg_class s on s.oid = d.objid and s.relkind = 'S'
      join pg_class t on t.oid = d.refobjid
      join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
      join pg_namespace n on n.oid = s.relnamespace
     where n.nspname = 'public' and d.deptype = 'a'
     order by s.relname`))
    partes.push(
      `alter sequence public.${d.seq} owned by public.${d.tabela}.${d.coluna};`,
    );
}

// ── RESTRIÇÕES ───────────────────────────────────────────────────────────────
secao(
  "CHAVES E RESTRIÇÕES",
  "Primária, única e de verificação primeiro; estrangeira por último, quando\ntoda tabela já existe.",
);
const ordemTipo = { p: 1, u: 2, c: 3, f: 4 };
const restricoes = await q(`
  select rel.relname as tabela, con.conname, con.contype,
         pg_get_constraintdef(con.oid) as def
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'public' and con.contype in ('p','u','c','f')
   order by con.contype, rel.relname, con.conname`);
for (const r of restricoes.sort(
  (a, b) =>
    ordemTipo[a.contype] - ordemTipo[b.contype] ||
    a.tabela.localeCompare(b.tabela),
))
  partes.push(
    `alter table public.${r.tabela}\n  add constraint ${r.conname} ${r.def};`,
  );

// ── VIEWS ────────────────────────────────────────────────────────────────────
//
// Em ordem de DEPENDÊNCIA, não alfabética. `conversas_creditadas` lê
// `trabalho_conversa`, e em ordem alfabética ela vem primeiro — o arquivo
// quebrava aí, no meio da instalação.
const views = await q(`
  select c.relname, pg_get_viewdef(c.oid, true) as def,
         c.reloptions
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v'
   order by c.relname`);

// Quem depende de quem, direto do catálogo: uma view "usa" outra quando há
// dependência da regra de reescrita dela para a relação da outra.
const dependencias = new Map(views.map((v) => [v.relname, new Set()]));
for (const d of await q(`
  select dependente.relname as view, usada.relname as usa
    from pg_depend dep
    join pg_rewrite r on r.oid = dep.objid
    join pg_class dependente on dependente.oid = r.ev_class
    join pg_class usada on usada.oid = dep.refobjid
    join pg_namespace n on n.oid = usada.relnamespace
   where n.nspname = 'public' and usada.relkind = 'v'
     and dependente.relkind = 'v' and dependente.oid <> usada.oid`))
  dependencias.get(d.view)?.add(d.usa);

// Ordenação topológica simples: só sai quem já teve tudo de que precisa.
const emOrdem = [];
const prontas = new Set();
while (emOrdem.length < views.length) {
  const proxima = views.find(
    (v) =>
      !prontas.has(v.relname) &&
      [...dependencias.get(v.relname)].every((d) => prontas.has(d)),
  );
  // Se nada avança, há ciclo — impossível em views do Postgres, mas melhor
  // parar do que gerar um arquivo em ordem errada em silêncio.
  if (!proxima) throw new Error("ciclo entre as views — ordem impossível");
  emOrdem.push(proxima);
  prontas.add(proxima.relname);
}

if (views.length) {
  secao(
    "VIEWS",
    "Em ordem de dependência: `conversas_creditadas` lê `trabalho_conversa`.\n`security_invoker` vem junto quando existe — sem ele a view roda com os\ndireitos do dono e vira porta dos fundos para a RLS.",
  );
  for (const v of emOrdem) {
    const opts = (v.reloptions ?? []).length
      ? `\nwith (${v.reloptions.join(", ")})`
      : "";
    partes.push(`create or replace view public.${v.relname}${opts} as\n${v.def}`);
  }
}

// ── TODAS AS FUNÇÕES ─────────────────────────────────────────────────────────
//
// Agora que tabelas e views existem, as 77 saem inteiras. As poucas que já
// vieram lá em cima são reescritas sem prejuízo — é tudo `create or replace`.
secao(
  "AS FUNÇÕES QUE FALAM EM TABELA",
  "Só podiam vir aqui: devolvem ou recebem o tipo de uma tabela — `setof\nconversas` e parentes —, e isso o Postgres resolve na hora de criar.",
);
for (const f of funcoes)
  if (dependeDeTipoDeTabela.has(f.proname)) partes.push(`${f.def};`);

// ── GATILHOS ─────────────────────────────────────────────────────────────────
secao("GATILHOS");
for (const g of await q(`
  select t.tgname, pg_get_triggerdef(t.oid) as def, rel.relname
    from pg_trigger t
    join pg_class rel on rel.oid = t.tgrelid
    join pg_namespace n on n.oid = rel.relnamespace
   where n.nspname = 'public' and not t.tgisinternal
   order by rel.relname, t.tgname`))
  partes.push(
    `drop trigger if exists ${g.tgname} on public.${g.relname};\n${g.def};`,
  );

// ── GATILHOS FORA DO `public` ────────────────────────────────────────────────
//
// `on_auth_user_created` mora em `auth.users` e chama `public.handle_new_user`:
// é ele que cria a linha de perfil quando alguém se cadastra.
//
// Um dump só de `public` pega a FUNÇÃO e deixa o GATILHO para trás — foi o que
// aconteceu. A instalação sobe inteira, a tela de login abre, a pessoa se
// cadastra com sucesso... e nasce sem perfil. A plataforma não descobre quem
// ela é, e nada na tela diz que faltou um gatilho.
//
// Só os que apontam para função NOSSA. Os do próprio Supabase (PostgREST,
// GraphQL, pg_cron) vêm com o projeto e recriá-los daria conflito.
const gatilhosDeFora = await q(`
  select t.tgname, rel.relname as tabela, n.nspname as esquema,
         pg_get_triggerdef(t.oid) as def
    from pg_trigger t
    join pg_class rel on rel.oid = t.tgrelid
    join pg_namespace n on n.oid = rel.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace pn on pn.oid = p.pronamespace
   where n.nspname <> 'public' and pn.nspname = 'public'
     and not t.tgisinternal
   order by n.nspname, rel.relname, t.tgname`);
if (gatilhosDeFora.length) {
  secao(
    "GATILHOS EM OUTROS SCHEMAS",
    "`on_auth_user_created` é o que cria o perfil de quem se cadastra. Ele mora em\n`auth.users`, então um dump só de `public` o deixa para trás — e a instalação\nsobe inteira com o login quebrado, sem nada na tela dizer o porquê.",
  );
  for (const g of gatilhosDeFora)
    partes.push(
      `drop trigger if exists ${g.tgname} on ${g.esquema}.${g.tabela};\n${g.def};`,
    );
}

// ── ÍNDICES ──────────────────────────────────────────────────────────────────
secao(
  "ÍNDICES",
  "Os de chave primária e única não entram: já vieram com as restrições acima, e\nrecriá-los daria erro de nome repetido.",
);
for (const i of await q(`
  select i.indexname, i.indexdef
    from pg_indexes i
   where i.schemaname = 'public'
     and not exists (
       select 1 from pg_constraint con
        where con.conname = i.indexname and con.contype in ('p','u'))
   order by i.tablename, i.indexname`))
  partes.push(`${i.indexdef};`);

// ── RLS ──────────────────────────────────────────────────────────────────────
secao(
  "SEGURANÇA POR LINHA",
  "A RLS é o que separa uma atendente da base inteira. Uma tabela que suba sem\nela fica aberta para qualquer conta autenticada — e nada na tela denuncia.",
);
for (const t of (
  await q(`
  select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname='public' and c.relkind='r' and c.relrowsecurity
   order by c.relname`)
).map((x) => x.relname))
  partes.push(`alter table public.${t} enable row level security;`);

partes.push("");
for (const p of await q(`
  select tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
    from pg_policies where schemaname = 'public'
   order by tablename, policyname`)) {
  // `roles` é `name[]`, que o driver entrega como o literal `{authenticated}`.
  const papeis =
    (p.roles ?? "")
      .replace(/^\{|\}$/g, "")
      .split(",")
      .map((r) => r.trim().replace(/^"|"$/g, ""))
      .filter(Boolean)
      .join(", ") || "public";
  let s = `drop policy if exists ${JSON.stringify(p.policyname)} on public.${p.tablename};\n`;
  s += `create policy ${JSON.stringify(p.policyname)} on public.${p.tablename}\n`;
  s += `  as ${p.permissive === "PERMISSIVE" ? "permissive" : "restrictive"}\n`;
  s += `  for ${p.cmd.toLowerCase()} to ${papeis}`;
  if (p.qual) s += `\n  using (${p.qual})`;
  if (p.with_check) s += `\n  with check (${p.with_check})`;
  partes.push(`${s};`);
}

// ── PERMISSÕES ───────────────────────────────────────────────────────────────
secao(
  "PERMISSÕES DE EXECUÇÃO",
  "Várias funções são `security definer` e foram fechadas de propósito — quem\npode chamá-las faz parte do desenho, não é detalhe.",
);
for (const g of await q(`
  select p.proname,
         pg_get_function_identity_arguments(p.oid) as args,
         coalesce(array_to_string(p.proacl, E'\\n'), '') as acl
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and p.proacl is not null
     and p.oid not in (select objid from pg_depend where deptype = 'e')
   order by p.proname`)) {
  const alvo = `public.${g.proname}(${g.args})`;
  const linhas = [`revoke all on function ${alvo} from public;`];
  for (const item of g.acl.split("\n")) {
    const m = item.match(/^([^=]*)=([a-zA-Z]*)\//);
    if (!m) continue;
    const papel = m[1] || "public";
    if (m[2].includes("X") && papel !== "postgres" && papel !== "")
      linhas.push(`grant execute on function ${alvo} to ${papel};`);
  }
  if (linhas.length > 1) partes.push(linhas.join("\n"));
}

// ── PERMISSÕES DE TABELA ─────────────────────────────────────────────────────
//
// Sem isto, a instalação nova sobe e o aplicativo recebe "permission denied for
// table conversas" em TUDO — porque quem fala com o banco pelo PostgREST é o
// papel `anon` ou `authenticated`, não o dono das tabelas.
//
// No banco da Talita essas permissões nunca foram escritas por ninguém: vieram
// da caixa "Automatically expose new tables" do painel, que aplica privilégio
// padrão a cada tabela criada. Quer dizer que a instalação dependia de UMA
// CAIXA MARCADA no painel — e o Supabase recomenda desmarcá-la.
//
// Escritas aqui, a base para de depender do painel: pode desmarcar a caixa que
// a instalação continua inteira, e o que cada papel alcança passa a estar dito
// no arquivo em vez de acontecer por padrão.
//
// A RLS continua sendo o que decide QUAIS LINHAS cada um vê. Isto é a camada de
// baixo — sem ela a RLS nem chega a ser consultada.
secao(
  "PERMISSÕES DE TABELA",
  "Quem fala com o banco pelo PostgREST é `anon` ou `authenticated`. Sem estas\nlinhas a instalação sobe e o aplicativo leva \"permission denied\" em tudo — e\nno banco da Talita elas vieram de uma caixa marcada no painel, não de código.",
);
for (const g of await q(`
  select table_name, grantee,
         string_agg(distinct privilege_type, ', ' order by privilege_type) as privilegios
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated', 'service_role')
   group by table_name, grantee
   order by table_name, grantee`))
  partes.push(
    `grant ${g.privilegios.toLowerCase()} on public.${g.table_name} to ${g.grantee};`,
  );

// ── STORAGE ──────────────────────────────────────────────────────────────────
//
// Os arquivos não moram em `public`: os áudios dos kits e a mídia que o eleitor
// manda ficam no Storage, que é o schema `storage`. Um dump só de `public`
// deixa isso de fora, e a instalação nova sobe inteira, abre bonito e não
// guarda arquivo nenhum — o upload falha com "bucket not found", que não diz a
// ninguém que faltou instalar.
//
// Vem por último porque as políticas chamam `perfil_atendimento()` e parentes.
const buckets = await q(`
  select id, name, public, file_size_limit, allowed_mime_types
    from storage.buckets order by id`);
const politicasStorage = await q(`
  select policyname, permissive, roles::text as roles, cmd, qual, with_check
    from pg_policies where schemaname = 'storage' and tablename = 'objects'
   order by policyname`);

if (buckets.length || politicasStorage.length) {
  secao(
    "STORAGE",
    "Os baldes de arquivo e quem pode mexer neles. Os dois são PRIVADOS: áudio de\ncampanha e mídia de eleitor não ficam em endereço público, que qualquer um\nacerta por tentativa.",
  );
  for (const b of buckets)
    partes.push(
      `insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)\n` +
        `values (${[b.id, b.name].map((v) => `'${v}'`).join(", ")}, ${b.public}, ` +
        `${b.file_size_limit ?? "null"}, ` +
        `${b.allowed_mime_types ? `array[${b.allowed_mime_types.map((m) => `'${m}'`).join(", ")}]::text[]` : "null"})\n` +
        `on conflict (id) do nothing;`,
    );

  for (const p of politicasStorage) {
    const papeis =
      (p.roles ?? "")
        .replace(/^\{|\}$/g, "")
        .split(",")
        .map((r) => r.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
        .join(", ") || "public";
    let s = `drop policy if exists ${JSON.stringify(p.policyname)} on storage.objects;\n`;
    s += `create policy ${JSON.stringify(p.policyname)} on storage.objects\n`;
    s += `  as ${p.permissive === "PERMISSIVE" ? "permissive" : "restrictive"}\n`;
    s += `  for ${p.cmd.toLowerCase()} to ${papeis}`;
    if (p.qual) s += `\n  using (${p.qual})`;
    if (p.with_check) s += `\n  with check (${p.with_check})`;
    partes.push(`${s};`);
  }
}

const cabecalho = `-- ============================================================================
-- O PIE, DO ZERO
-- ============================================================================
--
-- GERADO por \`scripts/gerar-base.mjs\` a partir do banco em produção.
-- NÃO EDITE À MÃO: mudança daqui para frente é migração nova em
-- \`supabase/migrations/\`, e esta base é regerada quando a produção mudar.
--
-- ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
--
-- Os 75 arquivos que viraram \`supabase/historico/\` foram escritos
-- incrementalmente, sempre contra um banco que já existia. Ninguém nunca
-- instalou o PIE do zero, e a ordem certa só existia no histórico do git —
-- quatro deles definem \`receber_mensagem\`, quatro definem \`so_digitos\`, três
-- definem \`atribuir_conversa\`. Rodar na ordem errada instalava a versão VELHA
-- por cima da nova, sem erro nenhum.
--
-- Este arquivo é o banco que FUNCIONA, lido dele mesmo.
--
-- ── A ORDEM ─────────────────────────────────────────────────────────────────
--
-- extensões · tipos · funções · tabelas · restrições · views · gatilhos ·
-- índices · RLS · permissões
--
-- As funções vêm antes das tabelas porque \`etiquetas_pendentes.digitos\` é
-- coluna gerada por \`so_digitos()\`. As funções que leem tabelas sobrevivem a
-- isso por causa do \`check_function_bodies\` logo abaixo: o corpo é guardado
-- sem validar os nomes, e a validação acontece na primeira execução. É o mesmo
-- recurso que o \`pg_dump\` usa.
--
-- Gerado em ${new Date().toISOString()}

set check_function_bodies = off;
`;

mkdirSync(resolve(RAIZ, "supabase/migrations"), { recursive: true });
const saida = resolve(RAIZ, "supabase/migrations/0000_base.sql");
writeFileSync(saida, `${cabecalho}${partes.join("\n\n")}\n`);

console.log(`escrito: supabase/migrations/0000_base.sql`);
console.log(`  extensões e tipos ......... ${tipos.length} tipos`);
console.log(`  funções ................... ${funcoes.length}`);
console.log(`  tabelas ................... ${tabelas.length}`);
console.log(`  restrições ................ ${restricoes.length}`);
console.log(`  views ..................... ${views.length}`);
await c.end();
