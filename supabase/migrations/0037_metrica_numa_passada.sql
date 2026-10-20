-- ============================================================================
-- A MÉTRICA VOLTA A ABRIR — DE NOVO, E AGORA PELA CLASSE
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca o corpo de três funções.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- A tela de métricas voltou a não abrir:
--
--     canceling statement due to statement timeout
--
-- com os quatro cartões em zero e o gráfico de barras desenhado normalmente
-- logo abaixo. O gráfico é outra chamada, mais barata — foi a única que coube
-- no tempo. Cartão zerado ao lado de gráfico cheio é a assinatura disto.
--
-- ── ISTO RESPONDE A PERGUNTA QUE 0035 DEIXOU EM ABERTO ──────────────────────
--
-- Ontem (17/09) o mesmo erro apareceu nesta mesma tela, e a resposta foi
-- `0035_base_recalcula_a_cada_cinco_minutos.sql`: o recálculo da Base rodava de
-- minuto em minuto, gastava 6% da máquina e encostava no teto de 8 s, então
-- passou a rodar de cinco em cinco.
--
-- Aquele arquivo foi honesto e escreveu, com todas as letras:
--
--     "Não PROVEI que a disputa por CPU foi a causa do timeout de hoje —
--      provei que os dois números se encostam e que a conta é cara. Se a tela
--      estourar de novo depois disto, a causa é outra e a investigação
--      recomeça."
--
-- A tela estourou de novo hoje, 18/09. Então a causa era outra, e a
-- investigação recomeçou — é o que este arquivo é.
--
-- A causa está abaixo, e ela é das funções, não da disputa por CPU. O que 0035
-- fez continua valendo por si (6% da máquina em recálculo é caro de qualquer
-- jeito), mas NÃO era o que derrubava as métricas. Voltar o recálculo para um
-- minuto é uma decisão separada desta, e não está tomada aqui.
--
-- ── O QUE 0014 CONSERTOU, E O QUE ELE NÃO VIU ───────────────────────────────
--
-- 0014 tirou um `max()` de dentro de um `lateral` e mediu 88 ms. A medida
-- estava certa e mentia: foi feita como `postgres`, que NÃO PASSA POR RLS.
--
-- Medido de novo como `authenticated`, que é quem a tela usa:
--
--     metricas_janelas_completo() ......  5.699 ms   (401 ms como postgres)
--     metricas_atendimento(30) .........  1.954 ms   (981 ms como postgres)
--
-- O teto de `authenticated` é 8 s, e a tela dispara as duas EM PARALELO com
-- outras quatro. Não cabia.
--
-- Conferência de velocidade rodada como superusuário não vale para esta base.
-- Toda medida daqui em diante é com `set local role authenticated` e um
-- `request.jwt.claims` de gente de verdade — é o que a conferência no fim faz.
--
-- ── A CLASSE: CHAMADA QUE DEVIA SER UMA, FEITA POR LINHA ────────────────────
--
-- Três defeitos, todos a mesma coisa — trabalho constante repetido linha a
-- linha — e nenhum deles estava onde o comentário de 0014 dizia:
--
-- 1. `metricas_desde()` e `metricas_ateh()` NÃO SÃO INLINADAS. Função SQL com
--    cláusula `SET` (as duas têm `SET search_path`) o Postgres nunca dobra no
--    corpo de quem chama: vira chamada de verdade, com `procost` 100, avaliada
--    A CADA LINHA. São quatro chamadas por conversa — 68 mil chamadas, 486 ms
--    numa varredura que sozinha custa 5 ms.
--
--    O plano denuncia sem disfarce: `Seq Scan on conversas cost=0.00..18078`
--    numa tabela de 765 páginas, que deveria custar ~1.100.
--
--    Elas devolvem O MESMO VALOR para todas as linhas. Agora saem uma vez, de
--    uma CTE de uma linha só, e viram InitPlan.
--
-- 2. `metricas_janelas_completo` varria a base 28 VEZES — sete janelas vezes
--    quatro subconsultas correlacionadas, cada uma reabrindo a CTE. Agora é
--    uma passada por eixo, com a régua das janelas em `join` e `group by`.
--
-- 3. A CTE `marcacoes` era reexecutada nas sete janelas, e dentro dela o
--    `join tags` virou NESTED LOOP com SEQ SCAN em `tags` 52.568 VEZES — o
--    planejador estimou `rows=1` onde vinham 7.510. Foram 4,9 dos 5,7 s.
--
--    `tags` tem 20 linhas. O problema não é o tamanho dela: é que cada
--    varredura reavalia as políticas de RLS `tags le` e `tags equipe`, e essas
--    duas chamam `perfil_atendimento()` / `perfil_supervisao()` SEM o
--    `(select ...)` que as transformaria em InitPlan. São ~2 milhões de
--    consultas a `profiles` para ler 20 linhas.
--
--    Aqui as etiquetas de status são lidas UMA vez, numa CTE materializada, e
--    o join vira `tag_id in (...)`.
--
-- ── O QUE NÃO ENTRA NESTE ARQUIVO ───────────────────────────────────────────
--
-- As políticas de RLS destravadas do item 3 são de outra camada e valem para a
-- aplicação inteira, não só para esta tela. São 47 políticas em ~20 tabelas
-- chamando `perfil_*()` / `auth.uid()` por linha; só `conversas`, `mensagens` e
-- `conversa_tags` foram embrulhadas em `(select ...)` algum dia. Isso é uma
-- varredura própria, com prova própria, e NÃO está consertado aqui.
--
-- Este arquivo deixa as métricas de pé sem depender daquilo.
--
-- ── O RESULTADO MEDIDO NÃO PODE MUDAR ───────────────────────────────────────
--
-- A conferência no fim compara as funções novas com o que a tela mostrava, em
-- nove recortes. Número diferente aqui significa que o conserto de velocidade
-- quebrou a contagem, e aí o arquivo não serve.

-- ── 1. metricas_atendimento ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.metricas_atendimento(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- ── AS DUAS PONTAS DA JANELA, CALCULADAS UMA VEZ ─────────────────────────
  --
  -- Isto estava escrito direto no `where`, quatro vezes. `metricas_desde` e
  -- `metricas_ateh` têm cláusula `SET`, e função SQL com `SET` o Postgres NÃO
  -- INLINA — cada aparição virava uma chamada de verdade, por linha: 68 mil
  -- chamadas, 486 ms numa varredura de 5 ms.
  --
  -- O valor é o mesmo para todas as linhas. Numa CTE de uma linha só ele vira
  -- InitPlan: calculado uma vez, antes da varredura começar.
  with limites as materialized (
    select public.metricas_desde(p_dias, p_de) as desde,
           public.metricas_ateh(p_ate)         as ateh
  ),
  -- A data do trabalho, numa passada só (ver 0014). Sem `materialized` de
  -- propósito: com atendente escolhida o planejador precisa poder empurrar
  -- `quem = p_atendente` para dentro da view e usar índice. Materializar aqui
  -- custou 5,2 s no recorte por atendente contra 114 ms sem.
  trabalho_dela as (
    select t.conversa_id, t.quando
      from public.trabalho_conversa t
     where p_atendente is not null and t.quem = p_atendente
  ),
  bruto as (
    select c.tipo, c.status_lead, c.demandas,
           -- SEM pessoa escolhida: quando o lead CHEGOU.
           -- COM pessoa: quando ELA trabalhou. Ver 0011.
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
  recorte as materialized (
    select tipo, status_lead, demandas
      from bruto
     where ((select desde from limites) is null
            or em >= (select desde from limites))
       and ((select ateh from limites) is null
            or em <  (select ateh from limites))
  ),
  -- O eixo zero: lead e disparo separados, numa varredura só.
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
  -- O eixo 2 é independente: zero, uma ou várias demandas por pessoa. Por isso
  -- ele SAI de um unnest e nunca fecha 100% — somar os dois eixos é o erro
  -- clássico, e o formato separado na tela é o que impede a soma.
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
  -- As etiquetas de status, lidas UMA vez. Era `join tags t ... where
  -- t.eixo = 'status'`, e o planejador transformava isso em varredura de
  -- `tags` por linha de `conversa_tags` — com as políticas de RLS de `tags`
  -- chamando `perfil_*()` a cada linha de cada varredura.
  tags_status as materialized (
    select t.id from public.tags t where t.eixo = 'status'
  ),
  -- ── O TRABALHO DA EQUIPE, QUE É OUTRA PERGUNTA ─────────────────────────
  --
  -- Os eixos acima medem O TRÁFEGO: dos leads que ENTRARAM no período, quantos
  -- são apoiadores. A soma fecha 100% e é isso que faz o painel bater.
  --
  -- Este mede o TRABALHO: quantas pessoas a equipe classificou no período,
  -- inclusive gente que chegou antes. A janela é `marcada_em` — quando o
  -- trabalho foi feito, e não quando a pessoa chegou. Somá-lo às barras faria
  -- o eixo passar de 100% dos leads, e painel que não fecha ninguém confia.
  --
  -- O crédito segue a regra do resto: quem marcou, e na falta dele (marcação
  -- antiga, de antes de `marcada_por` ser gravado) quem está com a conversa.
  trabalho as (
    select count(distinct c.id) as classificadas
      from public.conversa_tags ct
      join public.conversas c on c.id = ct.conversa_id
     where ct.tag_id in (select id from tags_status)
       and ((select desde from limites) is null
            or ct.marcada_em >= (select desde from limites))
       and ((select ateh from limites) is null
            or ct.marcada_em <  (select ateh from limites))
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

-- ── 2. metricas_janelas_completo ────────────────────────────────────────────

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
  -- Sem `materialized`: ver a nota em `metricas_atendimento`.
  trabalho_dela as (
    select t.conversa_id, t.quando
      from public.trabalho_conversa t
     where p_atendente is not null and t.quem = p_atendente
  ),
  -- `materialized` aqui é DE PROPÓSITO e é o ponto do arquivo: quatro CTEs
  -- abaixo leem esta. Sem a marca, o Postgres pode reexecutar a varredura de
  -- `conversas` em cada uma.
  base as materialized (
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
  tags_status as materialized (
    select t.id from public.tags t where t.eixo = 'status'
  ),
  marcacoes as materialized (
    select ct.conversa_id, ct.marcada_em
      from public.conversa_tags ct
      join public.conversas c on c.id = ct.conversa_id
     where ct.tag_id in (select id from tags_status)
       and (p_atendente is null
            or coalesce(ct.marcada_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
  -- ── UMA PASSADA POR EIXO, E NÃO UMA POR JANELA ───────────────────────────
  --
  -- Antes cada janela abria a sua própria subconsulta para cada número: sete
  -- vezes quatro, 28 varreduras da base.
  --
  -- Agora a régua entra em `join`: cada conversa encontra de uma vez TODAS as
  -- janelas que a contêm, e o `group by` fecha os sete números juntos. O
  -- `left join` é o que garante janela vazia aparecendo como zero em vez de
  -- sumir da lista.
  totais as (
    select j.ordem,
           count(*) filter (where b.tipo = 'lead')    as leads,
           count(*) filter (where b.tipo = 'disparo') as disparos
      from janelas j
      left join base b
        on b.em >= j.ini and (j.fim is null or b.em < j.fim)
     group by j.ordem
  ),
  status_cont as (
    select j.ordem, b.status_lead as s, count(*) as n
      from janelas j
      join base b on b.em >= j.ini and (j.fim is null or b.em < j.fim)
     where b.status_lead is not null
     group by 1, 2
  ),
  status_j as (
    select ordem, jsonb_object_agg(s, n) as status from status_cont group by 1
  ),
  dem_cont as (
    select j.ordem, dd as dem, count(*) as n
      from janelas j
      join base b on b.em >= j.ini and (j.fim is null or b.em < j.fim)
      cross join lateral unnest(b.demandas) as dd
     group by 1, 2
  ),
  dem_j as (
    select ordem, jsonb_object_agg(dem, n) as demandas from dem_cont group by 1
  ),
  class_j as (
    select j.ordem, count(distinct m.conversa_id) as n
      from janelas j
      left join marcacoes m
        on m.marcada_em >= j.ini and (j.fim is null or m.marcada_em < j.fim)
     group by j.ordem
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id',            j.id,
             'rotulo',        j.rotulo,
             'leads',         coalesce(t.leads, 0),
             'disparos',      coalesce(t.disparos, 0),
             'status',        coalesce(sj.status, '{}'::jsonb),
             'demandas',      coalesce(dj.demandas, '{}'::jsonb),
             'classificadas', coalesce(cj.n, 0)
           ) order by j.ordem), '[]'::jsonb)
    from janelas j
    left join totais   t  on t.ordem  = j.ordem
    left join status_j sj on sj.ordem = j.ordem
    left join dem_j    dj on dj.ordem = j.ordem
    left join class_j  cj on cj.ordem = j.ordem;
$function$
;

-- ── 3. leads_por_dia ────────────────────────────────────────────────────────
--
-- O gráfico foi o único que coube no tempo, então ninguém olharia para ele.
-- Mas ele tem o MESMO defeito 1: `metricas_desde` chamada dentro do `where`,
-- por linha. Deixar de fora porque "esse ainda abre" é consertar sintoma.

CREATE OR REPLACE FUNCTION public.leads_por_dia(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with limites as materialized (
    select public.metricas_desde(greatest(p_dias, 1), null) as desde
  ),
  regua as (
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
       and coalesce(c.primeira_msg_at, c.criado_em) >= (select desde from limites)
       -- O mesmo crédito da tela: quem trabalhou, e não quem recebeu a fila.
       -- Regra diferente aqui faria o gráfico discordar dos números acima.
       and (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
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
$function$
;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- COMO `authenticated`, que é quem a tela usa. Rodar isto como `postgres` não
-- prova nada: foi essa a falha de medida de 0014, e é ela que trouxe o timeout
-- de volta. O `set local role` abaixo é o ponto do bloco.
--
-- O teto de `authenticated` é 8 s POR CHAMADA, e a tela dispara seis em
-- paralelo. A régua aqui é a soma: tem de caber com folga larga, não raspando.

do $$
declare
  u uuid; a uuid; t0 timestamptz; total numeric := 0; ms numeric;
  d jsonb; soma int;
begin
  select p.id into u from public.profiles p
   where p.status = 'ativo'
     and coalesce(p.role,'usuario') in ('admin','usuario','supervisor')
   limit 1;
  if u is null then
    raise notice 'sem supervisor ativo para conferir — ignorado na instalação inicial';
    return;
  end if;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', u, 'role','authenticated')::text, true);
  select t.quem into a from public.trabalho_conversa t
   group by t.quem order by count(*) desc limit 1;

  set local role authenticated;

  t0 := clock_timestamp(); d := public.metricas_atendimento(30);
  ms := round(extract(epoch from clock_timestamp()-t0)*1000); total := total + ms;
  raise notice 'metricas_atendimento(30) ......... % ms', ms;

  -- O eixo 1 tem de FECHAR o total de leads: uma categoria por pessoa. Se a
  -- soma passar, alguma conversa está sendo contada duas vezes; se faltar, é
  -- gente sem classificação — e aí a tela mostra o resto como não classificado.
  select coalesce(sum(value::int), 0) into soma
    from jsonb_each_text(d->'status');
  raise notice '  leads=%  soma do eixo de status=%  (a soma nunca pode PASSAR)',
               d->>'leads', soma;
  if soma > (d->>'leads')::int then
    raise exception 'o eixo de status passou do total de leads: % > %',
                    soma, d->>'leads';
  end if;

  t0 := clock_timestamp(); perform public.metricas_janelas_completo();
  ms := round(extract(epoch from clock_timestamp()-t0)*1000); total := total + ms;
  raise notice 'metricas_janelas_completo() ...... % ms', ms;

  t0 := clock_timestamp(); perform public.metricas_janelas_completo(a);
  ms := round(extract(epoch from clock_timestamp()-t0)*1000); total := total + ms;
  raise notice 'metricas_janelas_completo(pessoa)  % ms', ms;

  t0 := clock_timestamp(); perform public.leads_por_dia(30);
  ms := round(extract(epoch from clock_timestamp()-t0)*1000); total := total + ms;
  raise notice 'leads_por_dia(30) ................ % ms', ms;

  raise notice '--- soma: % ms (o teto de authenticated é 8.000 ms POR CHAMADA)', total;

  -- Antes deste arquivo, só `metricas_janelas_completo()` sozinha levava de
  -- 5.700 a 8.700 ms. Se a soma das quatro voltar a passar de 2 s, alguma coisa
  -- regrediu e a tela está a caminho do timeout de novo.
  if total > 2000 then
    raise exception 'as métricas voltaram a ficar lentas: % ms somados', total;
  end if;
end $$;

-- As sete janelas, do jeito que a tela lê. "Tudo" tem de ser o maior de todos,
-- e nenhuma janela pode sumir da lista — eram sete antes e são sete agora.
select x->>'rotulo'        as janela,
       x->>'leads'         as leads,
       x->>'classificadas' as classificadas,
       x->'status'->>'apoiador' as apoiadores
  from jsonb_array_elements(public.metricas_janelas_completo()) x;
