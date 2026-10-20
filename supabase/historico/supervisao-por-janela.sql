-- ============================================================================
-- A SUPERVISÃO GANHA JANELA DE ATRIBUIÇÃO
-- ============================================================================
--
-- Rode DEPOIS de `janelas-completas.sql`. Pode rodar de novo sem medo.
--
-- ── O QUE FALTAVA ───────────────────────────────────────────────────────────
--
-- A supervisão responde "a equipe está dando conta?" — e só sabia responder
-- HOJE. As mensagens eram contadas desde a meia-noite, as encerradas também, e
-- os totais eram desde sempre. Não havia como perguntar "como foi a semana
-- passada" nem "o sábado do comício".
--
-- ── O QUE É POR JANELA E O QUE É DE AGORA ───────────────────────────────────
--
-- Esta separação é o miolo, e misturar as duas é o jeito de fazer o painel
-- mentir:
--
--   POR JANELA   o que ACONTECEU no período: quantas pessoas escreveram,
--                quantas respostas saíram, quantas conversas foram abertas,
--                respondidas e encerradas.
--
--   DE AGORA     o estado deste instante: quantas estão abertas, quantas sem
--                dono, quantas esperando resposta. "Quantas estão abertas nos
--                últimos 7 dias" não quer dizer nada — ou está aberta agora,
--                ou não está.
--
-- Por isso os três cartões de estado ficam FORA da janela, e continuam sendo
-- os mesmos em qualquer período escolhido.
--
-- ── E VEM TUDO DE UMA VEZ ───────────────────────────────────────────────────
--
-- As sete janelas inteiras cabem em poucos kilobytes, então a tela troca de
-- período sem ir ao servidor — igual às Métricas. Trocar janela para procurar
-- o dia em que a fila estourou tem de ser instantâneo, senão ninguém procura.

create or replace function public.supervisao_janelas()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Bahia')
             at time zone 'America/Bahia' as d
  ),
  janelas(ordem, id, rotulo, ini, fim) as (
    select 1, '0',     'Hoje',    (select d from hoje),                      null::timestamptz
    union all select 2, 'ontem', 'Ontem',   (select d from hoje) - interval '1 day', (select d from hoje)
    union all select 3, '7',     '7 dias',  now() - interval  '7 day',       null
    union all select 4, '15',    '15 dias', now() - interval '15 day',       null
    union all select 5, '30',    '30 dias', now() - interval '30 day',       null
    union all select 6, '90',    '90 dias', now() - interval '90 day',       null
    union all select 7, 'tudo',  'Tudo',    '-infinity'::timestamptz,        null
  )
  select coalesce(jsonb_agg(x order by ordem), '[]'::jsonb)
    from (
      select j.ordem,
             jsonb_build_object(
               'id',     j.id,
               'rotulo', j.rotulo,
               -- Quantas pessoas escreveram para a campanha no período.
               'recebidas', (select count(*) from public.mensagens m
                              where m.direcao = 'inbound'
                                and m.momento >= j.ini
                                and (j.fim is null or m.momento < j.fim)),
               -- Quantas respostas saíram — pelo PIE ou pelo celular.
               'enviadas',  (select count(*) from public.mensagens m
                              where m.direcao = 'outbound'
                                and m.momento >= j.ini
                                and (j.fim is null or m.momento < j.fim)),
               -- Conversas que NASCERAM no período.
               'chegaram',  (select count(*) from public.conversas c
                              where coalesce(c.primeira_msg_at, c.criado_em) >= j.ini
                                and (j.fim is null
                                     or coalesce(c.primeira_msg_at, c.criado_em) < j.fim)),
               -- Conversas que receberam a PRIMEIRA resposta no período. Não é
               -- o mesmo que "chegaram": a pessoa pode ter escrito ontem e
               -- sido respondida hoje, e é justamente esse atraso que a
               -- supervisão precisa enxergar.
               'respondidas', (select count(*) from public.conversas c
                                where c.primeira_resp_at >= j.ini
                                  and (j.fim is null or c.primeira_resp_at < j.fim)),
               'encerradas', (select count(*) from public.conversas c
                               where c.encerrada_em >= j.ini
                                 and (j.fim is null or c.encerrada_em < j.fim))
             ) as x
        from janelas j
    ) y;
$$;

comment on function public.supervisao_janelas is
  'O que ACONTECEU em cada janela: mensagens recebidas e enviadas, conversas que chegaram, foram respondidas e encerradas. O estado de agora (abertas, sem dono, esperando) NÃO entra aqui — não é pergunta de período.';

-- As contagens varrem por data; sem estes índices cada janela é varredura na
-- tabela inteira, e são sete janelas.
create index if not exists mensagens_por_momento
  on public.mensagens (direcao, momento desc);

create index if not exists conversas_por_encerramento
  on public.conversas (encerrada_em desc)
  where encerrada_em is not null;

create index if not exists conversas_por_primeira_resposta
  on public.conversas (primeira_resp_at desc)
  where primeira_resp_at is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
-- "Hoje" tem de bater com a conta que a tela fazia antes.
select j ->> 'rotulo' as janela,
       j ->> 'recebidas'   as recebidas,
       j ->> 'enviadas'    as enviadas,
       j ->> 'chegaram'    as chegaram,
       j ->> 'respondidas' as respondidas,
       j ->> 'encerradas'  as encerradas
  from jsonb_array_elements(public.supervisao_janelas()) j;
