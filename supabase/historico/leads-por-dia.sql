-- ============================================================================
-- A SÉRIE DIÁRIA DOS LEADS DE TRÁFEGO
-- ============================================================================
--
-- Rode DEPOIS de `metricas-por-data.sql`. Pode rodar de novo sem medo.
--
-- ── POR QUE UM NÚMERO NÃO BASTA ─────────────────────────────────────────────
--
-- "2.030 leads em 7 dias" não diz se foram 290 por dia ou 1.800 num sábado e
-- migalha no resto. Para quem decide onde por verba, essas duas realidades
-- pedem decisões opostas — e o número agregado é idêntico nas duas.
--
-- ── O DIA VAZIO TEM DE APARECER ─────────────────────────────────────────────
--
-- Esta é a parte que quase todo gráfico erra. Agrupando só o que existe, o dia
-- em que NÃO entrou ninguém simplesmente some, e as barras se encostam como se
-- o fluxo tivesse sido contínuo. O buraco — que é justamente a informação, o
-- dia em que o anúncio parou — desaparece do desenho.
--
-- `generate_series` cria a régua de dias primeiro, e a contagem encosta nela.
-- Dia sem lead vem com zero, e o zero é visível.
--
-- ── O DIA É O DA BAHIA ──────────────────────────────────────────────────────
--
-- O Postgres roda em UTC. Agrupar por `::date` direto jogaria tudo que entrou
-- depois das 21h para o dia seguinte — e as noites são o horário de pico de
-- quem responde anúncio.

create or replace function public.leads_por_dia(
  p_dias      int   default 30,
  p_atendente uuid  default null,
  p_municipio text  default null,
  p_origem    text  default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with regua as (
    select generate_series(
             (date_trunc('day', now() at time zone 'America/Bahia')
               - make_interval(days => greatest(p_dias, 1) - 1))::date,
             (now() at time zone 'America/Bahia')::date,
             interval '1 day'
           )::date as dia
  ),
  contados as (
    select ((coalesce(c.primeira_msg_at, c.criado_em) at time zone 'America/Bahia')::date) as dia,
           count(*) as n
      from public.conversas c
     where c.tipo = 'lead'
       and coalesce(c.primeira_msg_at, c.criado_em)
             >= public.metricas_desde(greatest(p_dias, 1), null)
       -- O mesmo crédito do resto das métricas: quem cadastrou, e na falta
       -- dele quem está com a conversa.
       and (p_atendente is null
            or coalesce(c.cadastrado_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
     group by 1
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object('dia', r.dia, 'leads', coalesce(c.n, 0))
             order by r.dia
           ),
           '[]'::jsonb
         )
    from regua r
    left join contados c on c.dia = r.dia;
$$;

comment on function public.leads_por_dia is
  'Leads de tráfego por dia da Bahia, com os dias vazios preenchidos com zero. Mesmos filtros de metricas_atendimento.';

-- O agrupamento varre por data de entrada; sem índice é varredura na tabela
-- inteira a cada troca de filtro.
create index if not exists conversas_por_entrada
  on public.conversas (tipo, primeira_msg_at desc);

-- ── conferência ─────────────────────────────────────────────────────────────
select jsonb_array_length(public.leads_por_dia(14, null, null, null)) as dias_na_serie,
       (select sum((x ->> 'leads')::int)
          from jsonb_array_elements(public.leads_por_dia(14, null, null, null)) x)
         as soma_14_dias,
       (public.metricas_atendimento(14, null, null, null) -> 'leads')::text
         as leads_14_dias_pela_outra_conta;
