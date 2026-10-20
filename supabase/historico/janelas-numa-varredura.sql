-- ============================================================================
-- AS SETE JANELAS NUMA VARREDURA SÓ
-- ============================================================================
--
-- Rode DEPOIS de `credito-de-quem-trabalhou.sql`. Pode rodar de novo sem medo.
--
-- ── O QUE EU FIZ DE ERRADO ──────────────────────────────────────────────────
--
-- Quando as janelas de atribuição entraram, a tela passou a chamar
-- `metricas_atendimento` UMA VEZ POR JANELA. Com sete janelas, mais o período
-- escolhido, mais a série do gráfico, mais as opções e os atendentes, virou
-- ONZE idas ao banco a cada carregamento — e a tela é `force-dynamic`, então
-- todo clique refaz tudo.
--
-- Cada consulta sozinha é rápida: 150 a 280 ms, e 777 ms quando há filtro por
-- pessoa. O problema nunca foi a consulta, foi a IDA: onze viagens entre a
-- Vercel e o banco, cada uma pagando a latência inteira. Clicar numa janela
-- travava.
--
-- ── UMA VARREDURA, SETE RESPOSTAS ───────────────────────────────────────────
--
-- As sete janelas olham a MESMA tabela com cortes de data diferentes. Isso é
-- um `count(*) filter (...)` por janela sobre uma leitura só — que é o que o
-- resto desta base já faz nos dois eixos.
--
-- O filtro por pessoa, que é o caro, passa a ser avaliado UMA vez em vez de
-- sete.

create or replace function public.metricas_janelas(
  p_atendente uuid  default null,
  p_municipio text  default null,
  p_origem    text  default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with hoje as (
    select (now() at time zone 'America/Bahia')::date as d
  ),
  base as (
    select c.tipo,
           -- O dia da BAHIA. Em UTC, tudo que entra depois das 21h cairia no
           -- dia seguinte — e a noite é o pico de quem responde anúncio.
           (coalesce(c.primeira_msg_at, c.criado_em) at time zone 'America/Bahia')::date as dia,
           coalesce(c.primeira_msg_at, c.criado_em) as em
      from public.conversas c
     where (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
  n as (
    select
      count(*) filter (where tipo = 'lead' and dia = (select d from hoje))     as l_hoje,
      count(*) filter (where tipo = 'lead' and dia = (select d from hoje) - 1) as l_ontem,
      count(*) filter (where tipo = 'lead' and em >= now() - interval  '7 day') as l_7,
      count(*) filter (where tipo = 'lead' and em >= now() - interval '15 day') as l_15,
      count(*) filter (where tipo = 'lead' and em >= now() - interval '30 day') as l_30,
      count(*) filter (where tipo = 'lead' and em >= now() - interval '90 day') as l_90,
      count(*) filter (where tipo = 'lead')                                     as l_tudo,
      count(*) filter (where tipo = 'disparo' and dia = (select d from hoje))     as d_hoje,
      count(*) filter (where tipo = 'disparo' and dia = (select d from hoje) - 1) as d_ontem,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval  '7 day') as d_7,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval '15 day') as d_15,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval '30 day') as d_30,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval '90 day') as d_90,
      count(*) filter (where tipo = 'disparo')                                     as d_tudo
    from base
  )
  -- A ordem é a da tela, e sai pronta do banco: montar a lista no servidor de
  -- aplicação obrigaria a repetir a ordem em dois lugares.
  select jsonb_build_array(
    jsonb_build_object('id','0',     'rotulo','Hoje',    'leads', l_hoje,  'disparos', d_hoje),
    jsonb_build_object('id','ontem', 'rotulo','Ontem',   'leads', l_ontem, 'disparos', d_ontem),
    jsonb_build_object('id','7',     'rotulo','7 dias',  'leads', l_7,     'disparos', d_7),
    jsonb_build_object('id','15',    'rotulo','15 dias', 'leads', l_15,    'disparos', d_15),
    jsonb_build_object('id','30',    'rotulo','30 dias', 'leads', l_30,    'disparos', d_30),
    jsonb_build_object('id','90',    'rotulo','90 dias', 'leads', l_90,    'disparos', d_90),
    jsonb_build_object('id','tudo',  'rotulo','Tudo',    'leads', l_tudo,  'disparos', d_tudo)
  ) from n;
$$;

comment on function public.metricas_janelas is
  'As sete janelas de atribuição numa varredura só. Substitui sete chamadas a metricas_atendimento — o custo era a ida ao banco, não a conta.';

-- ── conferência ─────────────────────────────────────────────────────────────
-- Tem de bater com a conta antiga, janela por janela.
select (public.metricas_janelas() -> 0 ->> 'leads')::int as hoje_novo,
       (public.metricas_atendimento(0,null,null,null) ->> 'leads')::int as hoje_antigo,
       (public.metricas_janelas() -> 2 ->> 'leads')::int as sete_novo,
       (public.metricas_atendimento(7,null,null,null) ->> 'leads')::int as sete_antigo,
       (public.metricas_janelas() -> 6 ->> 'leads')::int as tudo_novo,
       (public.metricas_atendimento(null,null,null,null) ->> 'leads')::int as tudo_antigo;
