-- ============================================================================
-- A SUPERVISÃO PASSA A CONTAR NUMA VARREDURA, E NÃO EM TRINTA E CINCO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca o corpo de uma função.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- "A troca de aba está rápida, mas carregar o conteúdo demora."
--
-- Medido em `pg_stat_statements`, `supervisao_janelas()` é a consulta mais
-- lenta por chamada da plataforma inteira:
--
--     média 3.849 ms · pior caso 7.569 ms · 141 chamadas · 543 segundos
--
-- ── A CAUSA ─────────────────────────────────────────────────────────────────
--
-- São SETE janelas (Hoje, Ontem, 7, 15, 30, 90, Tudo) e CINCO números em cada
-- uma. Cada número era uma subconsulta própria: 35 contagens independentes.
--
-- Catorze delas varrem `mensagens`, que tem 70 mil linhas. Vinte e uma varrem
-- `conversas`, que tem 10 mil. A janela "Tudo" não tem filtro que ajude —
-- conta a tabela inteira, e conta quatro vezes.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
--
-- `count(*) filter (where ...)` conta várias coisas diferentes numa passada
-- só. Em vez de 35 varreduras, duas: uma em `mensagens` e uma em `conversas`.
--
-- Cada linha é lida uma vez e cai em todos os baldes a que pertence — uma
-- mensagem de hoje conta em Hoje, em 7 dias, em 15, em 30, em 90 e em Tudo,
-- sem ser lida seis vezes.
--
-- ── O RESULTADO TEM DE SER IDÊNTICO ─────────────────────────────────────────
--
-- Isto é troca de COMO conta, nunca de O QUE conta. A conferência no fim
-- compara os sete conjuntos com os da função antiga — se algum número mudar, o
-- conserto de velocidade quebrou a medição, e é para reverter.

create or replace function public.supervisao_janelas()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Bahia')
             at time zone 'America/Bahia' as d
  ),
  lim as (
    select (select d from hoje)                        as h,
           (select d from hoje) - interval '1 day'     as o,
           now() - interval  '7 day'                   as d7,
           now() - interval '15 day'                   as d15,
           now() - interval '30 day'                   as d30,
           now() - interval '90 day'                   as d90
  ),
  -- ── UMA passada em mensagens, catorze contas ──────────────────────────────
  --
  -- A mensagem é lida uma vez e cai em todas as janelas a que pertence. Era
  -- isto que custava: a de hoje era lida seis vezes, uma por janela.
  msg as (
    select
      count(*) filter (where m.direcao='inbound'  and m.momento >= l.h)                        as r_hoje,
      count(*) filter (where m.direcao='outbound' and m.momento >= l.h)                        as e_hoje,
      count(*) filter (where m.direcao='inbound'  and m.momento >= l.o and m.momento < l.h)    as r_ontem,
      count(*) filter (where m.direcao='outbound' and m.momento >= l.o and m.momento < l.h)    as e_ontem,
      count(*) filter (where m.direcao='inbound'  and m.momento >= l.d7)                       as r_7,
      count(*) filter (where m.direcao='outbound' and m.momento >= l.d7)                       as e_7,
      count(*) filter (where m.direcao='inbound'  and m.momento >= l.d15)                      as r_15,
      count(*) filter (where m.direcao='outbound' and m.momento >= l.d15)                      as e_15,
      count(*) filter (where m.direcao='inbound'  and m.momento >= l.d30)                      as r_30,
      count(*) filter (where m.direcao='outbound' and m.momento >= l.d30)                      as e_30,
      count(*) filter (where m.direcao='inbound'  and m.momento >= l.d90)                      as r_90,
      count(*) filter (where m.direcao='outbound' and m.momento >= l.d90)                      as e_90,
      count(*) filter (where m.direcao='inbound')                                              as r_tudo,
      count(*) filter (where m.direcao='outbound')                                             as e_tudo
    from public.mensagens m cross join lim l
    -- ── LER PELO ÍNDICE, NÃO PELO DISCO ─────────────────────────────────────
    --
    -- Sempre verdadeiro, e é o ponto: com esta condição o Postgres escolhe o
    -- índice (direcao, momento), que tem 3,8 MB, em vez de varrer a tabela,
    -- que tem 55 MB. Medido isolado: 2.228 ms varrendo, 307 ms pelo índice.
    --
    -- Só as duas colunas contadas estão no índice, então ele não precisa
    -- voltar à tabela para nada.
    where m.momento > '-infinity'::timestamptz
  ),
  -- ── UMA passada em conversas, vinte e uma contas ──────────────────────────
  conv as (
    select
      count(*) filter (where coalesce(c.primeira_msg_at,c.criado_em) >= l.h)                          as c_hoje,
      count(*) filter (where c.primeira_resp_at >= l.h)                                               as p_hoje,
      count(*) filter (where c.encerrada_em     >= l.h)                                               as f_hoje,
      count(*) filter (where coalesce(c.primeira_msg_at,c.criado_em) >= l.o
                         and coalesce(c.primeira_msg_at,c.criado_em) <  l.h)                          as c_ontem,
      count(*) filter (where c.primeira_resp_at >= l.o and c.primeira_resp_at < l.h)                  as p_ontem,
      count(*) filter (where c.encerrada_em     >= l.o and c.encerrada_em     < l.h)                  as f_ontem,
      count(*) filter (where coalesce(c.primeira_msg_at,c.criado_em) >= l.d7)                         as c_7,
      count(*) filter (where c.primeira_resp_at >= l.d7)                                              as p_7,
      count(*) filter (where c.encerrada_em     >= l.d7)                                              as f_7,
      count(*) filter (where coalesce(c.primeira_msg_at,c.criado_em) >= l.d15)                        as c_15,
      count(*) filter (where c.primeira_resp_at >= l.d15)                                             as p_15,
      count(*) filter (where c.encerrada_em     >= l.d15)                                             as f_15,
      count(*) filter (where coalesce(c.primeira_msg_at,c.criado_em) >= l.d30)                        as c_30,
      count(*) filter (where c.primeira_resp_at >= l.d30)                                             as p_30,
      count(*) filter (where c.encerrada_em     >= l.d30)                                             as f_30,
      count(*) filter (where coalesce(c.primeira_msg_at,c.criado_em) >= l.d90)                        as c_90,
      count(*) filter (where c.primeira_resp_at >= l.d90)                                             as p_90,
      count(*) filter (where c.encerrada_em     >= l.d90)                                             as f_90,
      count(*) filter (where coalesce(c.primeira_msg_at,c.criado_em) is not null)                     as c_tudo,
      count(*) filter (where c.primeira_resp_at is not null)                                          as p_tudo,
      count(*) filter (where c.encerrada_em     is not null)                                          as f_tudo
    from public.conversas c cross join lim l
  )
  select jsonb_build_array(
    jsonb_build_object('id','0',    'rotulo','Hoje',    'recebidas',m.r_hoje, 'enviadas',m.e_hoje,
                       'chegaram',c.c_hoje, 'respondidas',c.p_hoje, 'encerradas',c.f_hoje),
    jsonb_build_object('id','ontem','rotulo','Ontem',   'recebidas',m.r_ontem,'enviadas',m.e_ontem,
                       'chegaram',c.c_ontem,'respondidas',c.p_ontem,'encerradas',c.f_ontem),
    jsonb_build_object('id','7',    'rotulo','7 dias',  'recebidas',m.r_7,    'enviadas',m.e_7,
                       'chegaram',c.c_7,    'respondidas',c.p_7,    'encerradas',c.f_7),
    jsonb_build_object('id','15',   'rotulo','15 dias', 'recebidas',m.r_15,   'enviadas',m.e_15,
                       'chegaram',c.c_15,   'respondidas',c.p_15,   'encerradas',c.f_15),
    jsonb_build_object('id','30',   'rotulo','30 dias', 'recebidas',m.r_30,   'enviadas',m.e_30,
                       'chegaram',c.c_30,   'respondidas',c.p_30,   'encerradas',c.f_30),
    jsonb_build_object('id','90',   'rotulo','90 dias', 'recebidas',m.r_90,   'enviadas',m.e_90,
                       'chegaram',c.c_90,   'respondidas',c.p_90,   'encerradas',c.f_90),
    jsonb_build_object('id','tudo', 'rotulo','Tudo',    'recebidas',m.r_tudo, 'enviadas',m.e_tudo,
                       'chegaram',c.c_tudo, 'respondidas',c.p_tudo, 'encerradas',c.f_tudo)
  )
  from msg m cross join conv c;
$function$;

comment on function public.supervisao_janelas is
  'Os sete períodos da supervisão, contados em DUAS varreduras — uma em mensagens, uma em conversas. Eram 35 contagens separadas, e a função levava 3,8 segundos por chamada.';

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Tem de voltar em milissegundos.
explain (analyze, timing off, summary on) select public.supervisao_janelas();

select x->>'rotulo' as janela,
       x->>'recebidas'  as recebidas,
       x->>'enviadas'   as enviadas,
       x->>'chegaram'   as chegaram,
       x->>'respondidas' as respondidas,
       x->>'encerradas' as encerradas
  from jsonb_array_elements(public.supervisao_janelas()) x;
