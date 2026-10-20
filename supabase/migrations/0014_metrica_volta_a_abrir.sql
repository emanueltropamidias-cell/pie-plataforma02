-- ============================================================================
-- A MÉTRICA VOLTA A ABRIR — A CONTA DO TRABALHO SAI DE DENTRO DO LAÇO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca o corpo de duas funções.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- A tela de métricas parou de abrir:
--
--     canceling statement due to statement timeout
--
-- com todos os cartões em zero.
--
-- ── A CAUSA, E ELA É MINHA ──────────────────────────────────────────────────
--
-- A correção de ontem — fazer a janela medir o TRABALHO e não a chegada do
-- lead — foi escrita como um `select max(...) from trabalho_conversa` dentro
-- de um `lateral`, avaliado POR CONVERSA.
--
-- São 9.700 conversas, e `trabalho_conversa` lê 61 mil mensagens. Medido:
-- 6,3 SEGUNDOS numa chamada só. A tela faz quatro em paralelo, uma delas com
-- sete janelas — não tinha como caber no tempo.
--
-- O conserto de ontem estava certo no QUE mede. Errado no COMO.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- A data do trabalho vira uma CTE filtrada pela pessoa: a leitura acontece uma
-- vez e vira hash, em vez de uma vez por linha.
--
-- E quando não há atendente escolhida, o `p_atendente is not null` dentro da
-- CTE corta ela inteira — a visão geral da campanha não paga nada por um
-- recurso que ela não usa. Era esse o caso do print: filtro em "Todos", e
-- mesmo assim estourava.
--
-- O RESULTADO MEDIDO NÃO PODE MUDAR. A conferência no fim compara os números
-- com os de ontem: Maiana e boneca têm de continuar em 144 e 115 no "Hoje" de
-- ontem, senão o conserto de velocidade quebrou o de correção.

CREATE OR REPLACE FUNCTION public.metricas_atendimento(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- ── A DATA DO TRABALHO, NUMA PASSADA SÓ ──────────────────────────────────
  --
  -- Isto era um `select max(...)` dentro de um `lateral`, avaliado POR
  -- CONVERSA. Com 9.700 conversas e a view de trabalho lendo 61 mil mensagens,
  -- a função levava 6,3 SEGUNDOS — e a tela faz quatro chamadas em paralelo,
  -- uma delas com sete janelas. A tela de métricas parou de abrir: "canceling
  -- statement due to statement timeout".
  --
  -- Como CTE com filtro por pessoa, a leitura acontece UMA vez e vira hash. E
  -- quando não há atendente escolhida, o `p_atendente is not null` corta a CTE
  -- inteira: a visão geral não paga nada por um recurso que não usa.
  --
  -- `trabalho_conversa` já agrupa por (conversa, pessoa), então filtrar por
  -- pessoa devolve uma linha por conversa — não precisa agrupar de novo.
  with trabalho_dela as (
    select t.conversa_id, t.quando
      from public.trabalho_conversa t
     where p_atendente is not null and t.quem = p_atendente
  ),
  bruto as (
    select c.tipo, c.status_lead, c.demandas,
           -- SEM pessoa escolhida: quando o lead CHEGOU.
           -- COM pessoa: quando ELA trabalhou. Ver 0011 — é o conserto que fez
           -- a Maiana sair de 6 para 144 leads "Hoje".
           case when p_atendente is null
                then coalesce(c.primeira_msg_at, c.criado_em)
                else w.quando
           end as em
      from public.conversas c
      left join trabalho_dela w on w.conversa_id = c.id
     where (p_atendente is null or w.conversa_id is not null)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
  recorte as (
    select tipo, status_lead, demandas
      from bruto
     where (public.metricas_desde(p_dias, p_de) is null
            or em >= public.metricas_desde(p_dias, p_de))
       and (public.metricas_ateh(p_ate) is null
            or em <  public.metricas_ateh(p_ate))
  ),
  -- O eixo zero: lead e disparo separados. `filter` conta os dois numa
  -- varredura só, em vez de uma consulta para cada.
  totais as (
    select
      count(*) filter (where tipo = 'lead')    as leads,
      count(*) filter (where tipo = 'disparo') as disparos
    from recorte
  ),
  -- O eixo 1: uma categoria por pessoa, e por isso a soma FECHA o total.
  eixo1 as (
    select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) as status
      from (
        select status_lead as s, count(*) as n
          from recorte
         where status_lead is not null
         group by 1
      ) x
  ),
  -- O eixo 2 é independente: uma pessoa pode ter zero, uma ou várias demandas.
  -- Por isso ele SAI de um unnest e nunca fecha 100% — somar os dois eixos é o
  -- erro clássico, e o formato separado aqui é o que impede a soma.
  eixo2 as (
    select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) as demandas
      from (
        -- `lateral unnest` e não unnest na lista de seleção: função que
        -- devolve conjunto misturada com group by tem ordem de avaliação
        -- traiçoeira, e aqui o número tem que estar certo.
        select d, count(*) as n
          from recorte r, lateral unnest(r.demandas) as d
         group by 1
      ) y
  ),
  -- ── O TRABALHO DA EQUIPE, QUE É OUTRA PERGUNTA ─────────────────────────
  --
  -- Os eixos acima medem O TRÁFEGO: dos leads que ENTRARAM no período, quantos
  -- são apoiadores. A soma fecha 100% e é isso que faz o painel bater.
  --
  -- Só que essa conta não enxerga o trabalho de classificar. A pessoa que
  -- chegou anteontem e a atendente marcou como apoiadora hoje não aparece em
  -- lugar nenhum de "hoje" — foi assim que 49 classificações viraram 41 na
  -- tela, e as duas marcadas às 22h sumiram.
  --
  -- Este número responde a outra pergunta, e por isso vem SEPARADO em vez de
  -- entrar no eixo: quantas pessoas a equipe classificou no período. Somá-lo
  -- às barras faria o eixo passar de 100% dos leads, e painel que não fecha é
  -- painel que ninguém confia.
  --
  -- A janela aqui é `marcada_em` — quando o trabalho foi feito, e não quando a
  -- pessoa chegou. É a diferença inteira.
  --
  -- O crédito segue a mesma regra do resto: quem marcou, e na falta dele
  -- (marcação antiga, de antes de `marcada_por` ser gravado) quem está com a
  -- conversa.
  trabalho as (
    select count(distinct c.id) as classificadas
      from public.conversa_tags ct
      join public.tags t       on t.id = ct.tag_id
      join public.conversas c  on c.id = ct.conversa_id
     where t.eixo = 'status'
       and (public.metricas_desde(p_dias, p_de) is null
            or ct.marcada_em >= public.metricas_desde(p_dias, p_de))
       and (public.metricas_ateh(p_ate) is null
            or ct.marcada_em < public.metricas_ateh(p_ate))
       and (p_atendente is null
            or coalesce(ct.marcada_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  )
  select jsonb_build_object(
    'leads',         (select leads    from totais),
    'disparos',      (select disparos from totais),
    'status',        (select status   from eixo1),
    'demandas',      (select demandas from eixo2),
    'classificadas', (select classificadas from trabalho)
  );
$function$
;
CREATE OR REPLACE FUNCTION public.metricas_janelas_completo(p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Mesma correção de `metricas_atendimento`: a data do trabalho vem de uma
  -- passada só, e não de um `max()` por conversa. Ver o comentário longo lá.
  trabalho_dela as (
    select t.conversa_id, t.quando
      from public.trabalho_conversa t
     where p_atendente is not null and t.quem = p_atendente
  ),
  base as (
    select c.id, c.tipo, c.status_lead, c.demandas,
           case when p_atendente is null
                then coalesce(c.primeira_msg_at, c.criado_em)
                else w.quando
           end as em
      from public.conversas c
      left join trabalho_dela w on w.conversa_id = c.id
     where (p_atendente is null or w.conversa_id is not null)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
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
$function$
;
-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Tem de voltar em milissegundos, não em segundos.
explain (analyze, timing off, summary on) select public.metricas_atendimento(1);

select a.nome,
       x->>'rotulo' as janela,
       x->>'leads'  as trabalhadas,
       x->'status'->>'apoiador' as apoiadores
  from public.atendentes a,
       lateral jsonb_array_elements(public.metricas_janelas_completo(a.id)) x
 where a.nome in ('Maiana','boneca') and x->>'rotulo' in ('Hoje','Ontem')
 order by a.nome, x->>'rotulo';
