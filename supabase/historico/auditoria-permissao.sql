-- ============================================================================
-- AUDITORIA DE PERMISSÃO — só lê, não muda nada
-- ============================================================================
--
-- Rode inteiro e leia a coluna `gravidade`. Nenhum comando aqui altera o banco:
-- é uma foto de quem pode ver o quê.
--
-- POR QUE ISTO EXISTE.
--
-- Numa só noite apareceram três buracos de autorização, e nenhum deles era
-- injeção, cabeçalho faltando ou biblioteca velha — que é o que ferramenta
-- automática acha. Todos os três eram lógica de permissão, e para uma
-- ferramenta pareceriam comportamento intencional:
--
--   · a tela gravava o papel `atendimento` e a trava conferia `atendente`.
--     Duas palavras parecidas, e a atendente enxergava as 29 mil;
--   · `atribuir_conversa` é security definer e estava concedida a qualquer
--     conta logada;
--   · `carga_atendentes` era uma view sem `security_invoker`, e view roda como
--     DONA por padrão — ou seja, devolvia tudo, ignorando a RLS.
--
-- Esta consulta procura os três padrões de uma vez, e mais dois.

with

-- 1. TABELA SEM RLS. A porta escancarada: qualquer conta logada lê tudo.
sem_rls as (
  select
    'TABELA SEM RLS'                                   as achado,
    c.relname                                          as objeto,
    'qualquer conta logada le e escreve tudo'          as consequencia,
    1                                                  as gravidade
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity
),

-- 2. RLS LIGADA E NENHUMA POLÍTICA. O contrário: trancada para todo mundo,
--    inclusive para quem deveria entrar. Não vaza — quebra, e em silêncio.
sem_politica as (
  select
    'RLS SEM POLITICA'                                 as achado,
    c.relname                                          as objeto,
    'ninguem le nada; a tela abre vazia sem dizer por que' as consequencia,
    2                                                  as gravidade
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relrowsecurity
    and not exists (
      select 1 from pg_policy p where p.polrelid = c.oid
    )
),

-- 3. VIEW SEM `security_invoker`. O caso do `carga_atendentes`: view roda como
--    DONA por padrão, então ela ATRAVESSA a RLS das tabelas que consulta.
view_sem_invoker as (
  select
    'VIEW ATRAVESSA A RLS'                             as achado,
    c.relname                                          as objeto,
    'roda como dona e ignora a RLS das tabelas que le' as consequencia,
    1                                                  as gravidade
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and coalesce(
      (select option_value
         from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'),
      'false'
    ) <> 'true'
),

-- 4. FUNÇÃO `security definer` ALCANÇÁVEL POR CONTA LOGADA. O caso do
--    `atribuir_conversa`. Nem toda é problema — várias existem justamente para
--    isso, com trava por dentro. A lista serve para conferir uma a uma se a
--    trava está lá.
definer_aberta as (
  select
    'FUNCAO DEFINER ABERTA'                            as achado,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as objeto,
    'ignora a RLS e qualquer conta logada chama - confira a trava por dentro' as consequencia,
    3                                                  as gravidade
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
),

-- 5. FUNÇÃO `security definer` SEM `search_path` FIXO. Sem ele, quem chama pode
--    apontar o esquema para tabelas próprias e fazer a função operar sobre elas.
definer_sem_caminho as (
  select
    'DEFINER SEM SEARCH_PATH'                          as achado,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as objeto,
    'quem chama pode trocar o esquema sob os pes da funcao' as consequencia,
    2                                                  as gravidade
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prosecdef
    and (p.proconfig is null
         or not exists (
           select 1 from unnest(p.proconfig) as cfg
            where cfg like 'search_path=%'
         ))
)

select achado, objeto, consequencia, gravidade
  from (
    select * from sem_rls
    union all select * from sem_politica
    union all select * from view_sem_invoker
    union all select * from definer_aberta
    union all select * from definer_sem_caminho
  ) tudo
 order by gravidade, achado, objeto;

-- ── COMO LER ────────────────────────────────────────────────────────────────
--
-- gravidade 1  conserte hoje. É vazamento: alguém vê o que não é dela.
-- gravidade 2  conserte esta semana. Quebra em silêncio ou abre caminho.
-- gravidade 3  confira uma a uma. Pode ser intencional, e várias serão —
--              `assumir_conversa` e `transferir_conversa` estão nessa lista de
--              propósito, e cada uma confere o papel na primeira linha.
--
-- Se não vier NENHUMA linha, não é erro da consulta: é o resultado bom.
