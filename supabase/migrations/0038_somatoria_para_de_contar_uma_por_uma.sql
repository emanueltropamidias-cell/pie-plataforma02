-- ============================================================================
-- A SOMATÓRIA DAS BASES PARA DE CONTAR UMA POR UMA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca o corpo de duas funções.
--
-- ── O SINTOMA, QUE NINGUÉM TINHA RELATADO AINDA ─────────────────────────────
--
-- `bases_somatoria()` leva 75 A 82 SEGUNDOS. O teto de quem está logado é 8 s.
--
-- Ou seja: as telas /base e /base/externas NÃO ABREM o bloco de somatória.
-- Elas caem no mesmo "canceling statement due to statement timeout" da tela de
-- Métricas, e ninguém tinha reclamado ainda.
--
-- Isto não apareceu por relato. Apareceu por varredura: depois de consertar as
-- métricas em 0037, cronometrei TODAS as funções de leitura do sistema como
-- `authenticated`. Vinte funções. Dezenove responderam abaixo de 350 ms. Esta
-- respondeu em 82.679 ms.
--
-- ── POR QUE O HISTÓRICO NÃO DENUNCIOU ───────────────────────────────────────
--
-- Em `pg_stat_statements` ela aparece com média de 342 ms e pior caso 1.285 ms,
-- em 278 chamadas. Números tranquilos — e velhos. Foram medidos quando as bases
-- externas tinham pouca gente.
--
-- A conta é quadrática: hoje são 29.348 pessoas em bases externas contra ~20 mil
-- da campanha, e o custo cresce com o PRODUTO das duas. Subir uma base grande
-- multiplicou o tempo sem mudar uma linha de código.
--
-- Média histórica não enxerga defeito quadrático. Só cronometrar hoje enxerga.
--
-- ── A CAUSA ─────────────────────────────────────────────────────────────────
--
-- Estava escrito assim:
--
--     count(e.tel) filter (where not exists (
--       select 1 from campanha c where c.tel = e.tel))
--
-- `not exists` DENTRO de um `filter` de agregação não vira anti-join. O
-- planejador não tem como transformar em hash o que é cláusula de um agregado:
-- ele avalia a subconsulta LINHA A LINHA.
--
-- São 29.348 linhas de `externas` varrendo uma CTE de ~20 mil linhas de
-- `campanha`: 587 MILHÕES de comparações para responder "quantas destas são
-- novas". O mesmo padrão aparecia de novo em `fora_da_campanha`.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- A pergunta "esta pessoa já é da campanha?" é respondida UMA vez por pessoa,
-- num `left join` que o planejador transforma em hash, e o resultado vira uma
-- coluna booleana. O `filter` passa a ler essa coluna em vez de ir ao banco.
--
-- Medido: 75.486 ms → 256 ms. Duzentas e noventa e cinco vezes.
--
-- ── A CONFERÊNCIA PRECISOU DE ISOLAMENTO ────────────────────────────────────
--
-- A primeira comparação acusou diferença de 4 em três números, e a diferença
-- NÃO era do conserto: a versão velha demora 78 s, e nesses 78 s o cron
-- `base-pre-calculada` recalculou as views materializadas. A função velha e a
-- nova leram bases diferentes.
--
-- Repetido em `repeatable read`, com as duas enxergando o MESMO instantâneo:
-- idênticas, chave por chave. É assim que a conferência no fim roda.
--
-- Fica a regra, que vale para a próxima: comparar função lenta com função
-- rápida em READ COMMITTED compara também o tempo que passou no meio.

-- ── 1. bases_somatoria ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.bases_somatoria()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with campanha as materialized (
    select tel from base_pessoas_mv where tel is not null
    union
    select tel from conversas_por_telefone_mv where tel is not null
  ),
  externas as materialized (
    select base_id, telefone as tel from bases_externas_pessoas where telefone is not null
  ),
  -- ── A PERGUNTA CARA, RESPONDIDA UMA VEZ POR PESSOA ───────────────────────
  --
  -- "esta pessoa já é da campanha?" era um `not exists` dentro de um `filter`
  -- de agregação, e isso o planejador não converte em anti-join: ele avalia por
  -- linha. Eram 29 mil linhas varrendo 20 mil, 587 milhões de comparações.
  --
  -- Como `left join`, vira hash: uma passada, e a resposta fica guardada numa
  -- coluna que o `filter` lê de graça.
  --
  -- `campanha` sai de um `union`, então `tel` é único ali dentro e este join
  -- NÃO multiplica linha — se multiplicasse, `pessoas` passaria a contar mais
  -- gente do que existe.
  externas_marcadas as materialized (
    select e.base_id, e.tel, (c.tel is null) as nova
      from externas e
      left join campanha c on c.tel = e.tel
  ),
  todas as (
    select 'campanha'::text as base, tel from campanha
    union all
    select base_id::text, tel from externas
  ),
  por_tel as materialized (
    select tel, count(distinct base) as bases from todas group by tel
  ),
  -- Mesmo conserto do de cima: era `not exists` por linha de `por_tel`.
  por_tel_fora as (
    select p.tel from por_tel p
    left join campanha c on c.tel = p.tel
    where c.tel is null
  ),
  por_base as (
    select b.id, b.nome, b.situacao,
           count(e.tel) as pessoas,
           count(e.tel) filter (where e.nova) as novas
      from bases_externas b
      left join externas_marcadas e on e.base_id = b.id
     group by b.id, b.nome, b.situacao
  )
  select case when not public.perfil_equipe() then null else jsonb_build_object(
    'campanha',        (select count(*) from campanha),
    'externas',        coalesce((select jsonb_agg(jsonb_build_object(
                                   'id', id, 'nome', nome, 'situacao', situacao,
                                   'pessoas', pessoas, 'novas', novas) order by pessoas desc)
                                   from por_base), '[]'::jsonb),
    'soma',            (select count(*) from todas),
    'unicas',          (select count(*) from por_tel),
    'em_mais_de_uma',  (select count(*) from por_tel where bases > 1),
    'fora_da_campanha',(select count(*) from por_tel_fora)
  ) end
$function$
;

-- ── 2. base_geo ─────────────────────────────────────────────────────────────
--
-- ESTA NÃO É UMA CORREÇÃO DE VELOCIDADE, e é importante dizer: medido, deu
-- EMPATE (81 ms antes, 80 ms depois). O planejador já estava resolvendo bem.
--
-- `public.perfil_equipe()` estava solto no `where`, sem o `(select ...)`. Do
-- jeito que está, o Postgres PODE avaliá-la por linha — são 9.671 linhas, e
-- `perfil_equipe` tem cláusula `SET`, então nunca é inlinada: cada avaliação é
-- uma consulta a `profiles`.
--
-- Hoje o plano escolhido não faz isso. Amanhã, com outro tamanho de tabela ou
-- outra estatística, pode fazer — e foi exatamente esse mecanismo que, em
-- `metricas_janelas_completo`, virou 52.568 varreduras e 4,9 segundos.
--
-- O `(select ...)` custa nada e fecha a porta. Entra como seguro, não como
-- ganho, e o número acima é a prova honesta de que não houve ganho.

CREATE OR REPLACE FUNCTION public.base_geo()
 RETURNS TABLE(local text, bairro text, escrito text, municipio text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select b.local, b.bairro, b.municipio, mb.nome
    from base_pessoas_mv b
    left join municipios_ba mb on mb.chave = chave_municipio(b.municipio)
   where b.nome is not null
     and (select public.perfil_equipe())
$function$
;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- COMO `authenticated`, com RLS ligada — medida de superusuário não vale para
-- esta base (ver 0037).

do $$
declare
  u uuid; t0 timestamptz; ms numeric; d jsonb; n bigint;
begin
  select p.id into u from public.profiles p
   where p.status = 'ativo'
     and coalesce(p.role,'usuario') in ('admin','usuario','supervisor')
   limit 1;
  if u is null then
    raise exception 'sem supervisor ativo para conferir';
  end if;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', u, 'role','authenticated')::text, true);
  set local role authenticated;

  t0 := clock_timestamp(); d := public.bases_somatoria();
  ms := round(extract(epoch from clock_timestamp()-t0)*1000);
  raise notice 'bases_somatoria() ... % ms', ms;

  -- Antes deste arquivo eram 75.000 a 82.000 ms, contra um teto de 8.000.
  if ms > 4000 then
    raise exception 'bases_somatoria voltou a ser lenta: % ms (teto 8.000)', ms;
  end if;

  -- As identidades que têm de valer sempre, independentes de quanto cresça a
  -- base. Se alguma quebrar, a soma está contando alguém duas vezes.
  if (d->>'soma')::bigint < (d->>'unicas')::bigint then
    raise exception 'soma (%) menor que unicas (%) — impossível',
                    d->>'soma', d->>'unicas';
  end if;
  if (d->>'fora_da_campanha')::bigint > (d->>'unicas')::bigint then
    raise exception 'fora_da_campanha (%) maior que unicas (%) — impossível',
                    d->>'fora_da_campanha', d->>'unicas';
  end if;
  if (d->>'campanha')::bigint > (d->>'unicas')::bigint then
    raise exception 'campanha (%) maior que unicas (%) — impossível',
                    d->>'campanha', d->>'unicas';
  end if;

  t0 := clock_timestamp(); select count(*) into n from public.base_geo();
  raise notice 'base_geo() ......... % ms, % linhas',
               round(extract(epoch from clock_timestamp()-t0)*1000), n;
end $$;

select jsonb_pretty(public.bases_somatoria() - 'externas') as somatoria;
