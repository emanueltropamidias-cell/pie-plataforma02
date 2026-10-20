-- ============================================================================
-- AS MÉTRICAS CONTAM O MULTIPLICADOR NO LUGAR NOVO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca o corpo de duas funções.
--
-- Companheira da 0037, que tirou multiplicador do eixo `status` e o pôs em
-- `perfis`. Sem esta, o número some das telas no mesmo instante — e conserto
-- que apaga um número da tela não é conserto.
--
-- ── O QUE MUDA, EXATAMENTE ──────────────────────────────────────────────────
--
-- A contagem de status passa a somar os perfis. O FORMATO da resposta não muda:
-- a tela continua lendo `status.multiplicador`, e por isso nenhuma linha de
-- interface precisou ser tocada. Muda de ONDE o número vem.
--
-- ── A CONSEQUÊNCIA, ASSUMIDA ────────────────────────────────────────────────
--
-- Quem é apoiador E multiplicador entra nas DUAS fatias, e a soma passa de
-- 100%. O comentário antigo de `metricas_atendimento` dizia "uma categoria por
-- pessoa, e por isso a soma FECHA o total" — deixou de valer no dia em que se
-- pediu que a pessoa pudesse ser as duas coisas. O comentário foi corrigido
-- junto, porque comentário que mente é pior que comentário nenhum.

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
    select c.id, c.tipo, c.status_lead, c.demandas, c.perfis,
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
  
    union all
    -- ── O PERFIL ENTRA NA MESMA CONTAGEM DO STATUS ──────────────────────
    --
    -- De propósito: a tela lê `status.multiplicador` desde sempre, e conserto
    -- que apaga um número da tela não é conserto. O formato da resposta não
    -- muda; o que muda é DE ONDE o multiplicador vem.
    --
    -- Quem é apoiador E multiplicador aparece nas duas fatias, e a soma passa
    -- de 100%. É o preço de deixar a pessoa ser as duas coisas — que foi
    -- exatamente o que se pediu.
    select j.ordem, pf.perfil as s, count(*) as n
      from janelas j
      join base b on b.em >= j.ini and (j.fim is null or b.em < j.fim)
      cross join lateral unnest(b.perfis) as pf(perfil)
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
    select c.tipo, c.status_lead, c.demandas, c.perfis,
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
    select tipo, status_lead, demandas, perfis
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
  -- O eixo 1: status (um por pessoa) MAIS perfil (lista). Ver 0037.
  eixo1 as (
    select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) as status
      from (
        select status_lead as s, count(*) as n
          from recorte
         where status_lead is not null
         group by 1
        union all
        -- O perfil entra AQUI, na mesma contagem, porque a tela lê
        -- `status.multiplicador` desde sempre. Muda de onde vem o número, não
        -- o formato — conserto que apaga um número da tela não é conserto.
        --
        -- Consequência assumida: quem é apoiador E multiplicador conta nas
        -- duas fatias, e a soma passa de 100%. O comentário acima, que dizia
        -- "uma categoria por pessoa, e por isso a soma FECHA o total", deixou
        -- de valer no dia em que se pediu que a pessoa pudesse ser as duas.
        select pf.perfil as s, count(*) as n
          from recorte
          cross join lateral unnest(perfis) as pf(perfil)
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
