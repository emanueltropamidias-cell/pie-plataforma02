-- ============================================================================
-- AS SETE JANELAS INTEIRAS, DE UMA VEZ
-- ============================================================================
--
-- Rode DEPOIS de `janelas-numa-varredura.sql`. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- Trocar a janela ainda ia ao servidor. Mesmo com a consulta em 88 ms, o clique
-- disparava um render inteiro do Next mais a viagem até o banco — e isso nunca
-- vira "na hora", por melhor que seja o servidor.
--
-- A saída não é otimizar a ida: é NÃO IR. As sete janelas olham a mesma tabela
-- com cortes de data diferentes, e o resultado inteiro das sete cabe em alguns
-- kilobytes. Trazendo tudo na primeira carga, trocar de janela vira troca de
-- variável no navegador: instantâneo, sem rede.
--
-- `metricas_janelas` (só os totais) continua existindo e não foi tocada — quem
-- precisa só do número não paga por isto.
--
-- ── O QUE MUDA E O QUE NÃO ──────────────────────────────────────────────────
--
-- Período é instantâneo. Trocar PESSOA, MUNICÍPIO ou ORIGEM continua indo ao
-- servidor, porque muda o recorte inteiro — e são filtros que se mexe uma vez,
-- não sete vezes seguidas.

create or replace function public.metricas_janelas_completo(
  p_atendente uuid  default null,
  p_municipio text  default null,
  p_origem    text  default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Bahia')
             at time zone 'America/Bahia' as d
  ),
  -- A régua das janelas. `fim` nulo = até agora; só "Ontem" tem fim, porque é
  -- dia FECHADO — sem o fim ele viraria "os últimos dois dias".
  janelas(ordem, id, rotulo, ini, fim) as (
    select 1, '0',     'Hoje',    (select d from hoje),                      null::timestamptz
    union all select 2, 'ontem', 'Ontem',   (select d from hoje) - interval '1 day', (select d from hoje)
    union all select 3, '7',     '7 dias',  now() - interval  '7 day',       null
    union all select 4, '15',    '15 dias', now() - interval '15 day',       null
    union all select 5, '30',    '30 dias', now() - interval '30 day',       null
    union all select 6, '90',    '90 dias', now() - interval '90 day',       null
    union all select 7, 'tudo',  'Tudo',    '-infinity'::timestamptz,        null
  ),
  base as (
    select c.id, c.tipo, c.status_lead, c.demandas,
           coalesce(c.primeira_msg_at, c.criado_em) as em
      from public.conversas c
     where (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
  -- O trabalho de classificar tem janela PRÓPRIA: `marcada_em`, quando o
  -- trabalho foi feito, e não quando a pessoa chegou. É outra pergunta, e por
  -- isso vem separado — somá-lo aos eixos faria a barra passar de 100%.
  marcacoes as (
    select ct.conversa_id, ct.marcada_em
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
      join public.conversas c on c.id = ct.conversa_id
     where t.eixo = 'status'
       and (p_atendente is null
            or coalesce(ct.marcada_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  )
  select coalesce(jsonb_agg(x order by x_ordem), '[]'::jsonb)
    from (
      select j.ordem as x_ordem,
             jsonb_build_object(
               'id',     j.id,
               'rotulo', j.rotulo,
               'leads',    (select count(*) from base b
                             where b.tipo = 'lead' and b.em >= j.ini
                               and (j.fim is null or b.em < j.fim)),
               'disparos', (select count(*) from base b
                             where b.tipo = 'disparo' and b.em >= j.ini
                               and (j.fim is null or b.em < j.fim)),
               'status',   coalesce((
                             select jsonb_object_agg(s.status_lead, s.n)
                               from (select b.status_lead, count(*) as n
                                       from base b
                                      where b.em >= j.ini
                                        and (j.fim is null or b.em < j.fim)
                                        and b.status_lead is not null
                                      group by 1) s
                           ), '{}'::jsonb),
               'demandas', coalesce((
                             select jsonb_object_agg(d.dem, d.n)
                               from (select dd as dem, count(*) as n
                                       from base b, lateral unnest(b.demandas) as dd
                                      where b.em >= j.ini
                                        and (j.fim is null or b.em < j.fim)
                                      group by 1) d
                           ), '{}'::jsonb),
               'classificadas', (select count(distinct m.conversa_id)
                                   from marcacoes m
                                  where m.marcada_em >= j.ini
                                    and (j.fim is null or m.marcada_em < j.fim))
             ) as x
        from janelas j
    ) y;
$$;

comment on function public.metricas_janelas_completo is
  'As sete janelas com os números INTEIROS de cada uma — totais, os dois eixos e o trabalho de classificar. Existe para a tela trocar de período sem ir ao servidor.';

-- ── conferência ─────────────────────────────────────────────────────────────
-- Janela por janela contra a conta que já existia. Tem de bater em tudo.
select j ->> 'rotulo' as janela,
       (j ->> 'leads')::int as leads_novo,
       case j ->> 'id'
         when '0'    then (public.metricas_atendimento(0,null,null,null) ->> 'leads')::int
         when 'ontem' then (public.metricas_atendimento(null,null,null,null,
                              ((now() at time zone 'America/Bahia') - interval '1 day')::date,
                              ((now() at time zone 'America/Bahia') - interval '1 day')::date) ->> 'leads')::int
         when 'tudo' then (public.metricas_atendimento(null,null,null,null) ->> 'leads')::int
         else (public.metricas_atendimento((j ->> 'id')::int,null,null,null) ->> 'leads')::int
       end as leads_antigo,
       (j ->> 'classificadas')::int as classificadas
  from jsonb_array_elements(public.metricas_janelas_completo()) j;
