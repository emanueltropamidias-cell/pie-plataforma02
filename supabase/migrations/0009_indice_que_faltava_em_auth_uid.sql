-- ============================================================================
-- O ÍNDICE QUE FALTAVA — 4 BILHÕES DE LINHAS LIDAS À TOA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- "A plataforma está lenta." Medido em `pg_stat_user_tables`:
--
--     liderancas   774.212 varreduras completas
--                  4.061.487.397 linhas lidas
--                  numa tabela de 7.491 linhas
--
-- Quatro bilhões de linhas lidas de uma tabela que cabe em 12 MB. Nenhuma tela
-- pede isso. Quem pede é o controle de acesso.
--
-- ── A CAUSA ─────────────────────────────────────────────────────────────────
--
-- `perfil_equipe()` é chamada por quase toda política RLS do banco — é ela que
-- responde "esta pessoa é do gabinete?". A última linha dela é:
--
--     and ( p.role = 'admin'
--           or not exists (select 1 from public.liderancas l where l.auth_uid = p.id) )
--
-- A regra está certa: conta que também é liderança na rede não é gabinete. O
-- problema é que `liderancas` tem NOVE índices e nenhum em `auth_uid`. Então
-- toda checagem de permissão de todo usuário que não é admin lê a tabela
-- inteira — em cada consulta, de cada tela, de cada uma das 16 atendentes.
--
-- `minha_subarvore()` tem a mesma semente (`where auth_uid = auth.uid()`) e
-- paga o mesmo preço, nas políticas de leitura e escrita de `liderancas`.
--
-- ── POR QUE ISTO PASSOU DESPERCEBIDO ────────────────────────────────────────
--
-- Porque não aparece como consulta lenta. Aparece como TUDO um pouco mais
-- lento: a varredura acontece dentro da política, não dentro da consulta que
-- alguém escreveu. E enquanto a tabela era pequena, era barato — o custo
-- cresceu junto com a base de lideranças, sem nada na tela mudando de lugar.
--
-- ── O ÍNDICE ────────────────────────────────────────────────────────────────
--
-- PARCIAL, e não completo: de 7.491 lideranças, DUAS têm conta. Um índice
-- inteiro guardaria 7.489 nulos que ninguém procura. O parcial ocupa alguns
-- kilobytes e responde a mesma pergunta.
--
-- `where auth_uid = <algo>` é atendido pelo índice parcial sem precisar dizer
-- nada: igualdade já implica não-nulo, e o planejador sabe disso.
create index if not exists liderancas_auth_uid
  on public.liderancas (auth_uid)
  where auth_uid is not null;

comment on index public.liderancas_auth_uid is
  'A conta da liderança no portal. Parcial porque quase nenhuma tem conta. Sem ele, perfil_equipe() varre a tabela inteira em toda checagem de permissão.';

-- ── E A MESMA PERGUNTA DO OUTRO LADO ────────────────────────────────────────
--
-- `perfil_equipe()` parte de `profiles.id = auth.uid()`, que é a chave
-- primária e já é índice. Este lado estava certo — fica registrado para quem
-- vier conferir não precisar procurar de novo.

-- ── ESTATÍSTICA FRESCA ──────────────────────────────────────────────────────
--
-- O planejador só usa o índice se souber que ele ajuda, e ele decide isso pela
-- estatística. O último `autoanalyze` de `liderancas` foi em 08/09, antes deste
-- índice existir.
analyze public.liderancas;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- O plano tem de dizer "Index Scan" ou "Index Only Scan". Se disser "Seq Scan",
-- o índice não está sendo usado e não adiantou nada.
explain (costs off)
select 1 from public.liderancas l where l.auth_uid = '00000000-0000-0000-0000-000000000000'::uuid;

select indexrelname as indice,
       pg_size_pretty(pg_relation_size(indexrelid)) as tamanho
  from pg_stat_user_indexes
 where relname = 'liderancas' and indexrelname = 'liderancas_auth_uid';
