-- ============================================================================
-- A JANELA DA SUPERVISÃO OLHA A MENSAGEM, E NÃO A ÚLTIMA MENSAGEM
-- ============================================================================
--
-- Rode DEPOIS de `supervisao-por-janela.sql`. Pode rodar de novo sem medo.
--
-- ── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- A lista era cortada por `ultima_msg_at`. Parece a mesma coisa e não é:
--
--   a menina responde ONTEM às 18h
--   a pessoa responde de volta HOJE às 9h
--   -> `ultima_msg_at` é de hoje, e a conversa SAI da janela "Ontem"
--
-- O trabalho de ontem some justamente porque deu certo — porque a pessoa
-- voltou a falar. Quanto melhor o atendimento, mais some.
--
--   ONTEM pela última mensagem      462 conversas
--   ONTEM que tiveram mensagem      555 conversas
--
-- Noventa e três conversas de trabalho real, invisíveis.
--
-- ── POR QUE PRECISA DE FUNÇÃO ───────────────────────────────────────────────
--
-- "Teve mensagem no período" é um `exists` sobre `mensagens`, e o PostgREST não
-- faz subconsulta. A tela filtrava com o que dava para filtrar de fora — e o
-- que dava não era o certo.

create or replace function public.supervisao_lista(
  p_de     timestamptz default null,
  p_ate    timestamptz default null,
  p_limite int         default 500
) returns setof public.conversas
language sql
stable
set search_path = public, pg_temp
as $$
  select c.*
    from public.conversas c
   where (p_de is null
          or exists (select 1 from public.mensagens m
                      where m.conversa_id = c.id
                        and m.momento >= p_de
                        and (p_ate is null or m.momento < p_ate)))
   -- A ordem continua sendo a última mensagem: a lista é de acompanhamento do
   -- agora, e quem se mexeu por último vem primeiro. O que mudou foi QUEM
   -- ENTRA na lista, não a ordem dentro dela.
   order by c.ultima_msg_at desc nulls last
   limit greatest(p_limite, 1);
$$;

comment on function public.supervisao_lista is
  'As conversas que TIVERAM mensagem no período — e não as que pararam nele. Cortar por ultima_msg_at escondia o atendimento de ontem que recebeu resposta hoje.';

-- O `exists` procura mensagem de uma conversa dentro de um intervalo. Sem este
-- índice é varredura nas 21 mil mensagens para cada conversa candidata.
create index if not exists mensagens_por_conversa_e_momento
  on public.mensagens (conversa_id, momento desc);

-- ── conferência ─────────────────────────────────────────────────────────────
with h as (select date_trunc('day', now() at time zone 'America/Bahia')
                    at time zone 'America/Bahia' as d)
select 'ontem, pelo corte novo'  as caso,
       (select count(*) from public.supervisao_lista(
          (select d from h) - interval '1 day', (select d from h), 100000)) as conversas
union all
select 'ontem, pelo corte antigo',
       (select count(*) from public.conversas c
         where c.ultima_msg_at >= (select d from h) - interval '1 day'
           and c.ultima_msg_at <  (select d from h))
union all
select 'tudo',
       (select count(*) from public.supervisao_lista(null, null, 100000));
