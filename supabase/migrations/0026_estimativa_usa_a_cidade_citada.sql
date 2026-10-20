-- ============================================================================
-- A CIDADE QUE A PESSOA CITOU NA CONVERSA VEM ANTES DO DDD
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O QUE O EMANUEL APONTOU ─────────────────────────────────────────────────
--
-- A 0025 deixava fora do mapa as 1.732 pessoas sem município e com DDD de fora
-- da Bahia. Ele lembrou: tem gente que MORA na Bahia com DDD de outro estado. O
-- DDD de fora não aponta cidade nenhuma daqui — mas havia uma pista melhor que o
-- DDD, e ela já estava no banco: `conversas.municipio_sugerido`, a cidade que a
-- pessoa mencionou no atendimento (normalizada para a grafia oficial por
-- trigger).
--
-- Medido em 15/09, entre as pessoas sem município:
--
--                   pessoas   citaram cidade da Bahia
--   DDD da Bahia      6.310            1.252
--   DDD de fora       1.734              126   <- moram aqui com número de fora
--
-- ── AS TRÊS CAMADAS, DA MAIS CERTA PARA A MENOS ─────────────────────────────
--
--   confirmados   cadastro com município da Bahia              (base_pessoas)
--   citaram       sem cadastro de cidade, mas disseram a cidade
--                 na conversa — vão PARA ESSA CIDADE, sem conta
--   estimados     nenhuma pista, DDD da Bahia — distribuídos
--                 pelo DDD, proporcional aos confirmados
--
-- E quem sobra — DDD de fora e nenhuma cidade citada — não é distribuído nem
-- descartado: vira `semPista`, a lista das conversas em que a atendente precisa
-- perguntar de qual cidade a pessoa é.
--
-- A camada "citaram" é declaração da pessoa, não cadastro confirmado — por isso
-- não se soma aos confirmados. Mas também não é estimativa: vai para a cidade
-- que ela disse, e a tela mostra as três separadas.

create or replace function public.mapa_estimativa_ddd()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with bp as materialized (
    select tel, municipio, local, nome from base_pessoas
  ),
  -- As conversas UMA vez: um telefone por linha, com a cidade citada mais
  -- recente. A primeira versão desta função lia as 12 mil conversas duas vezes
  -- (quem nunca virou ficha, e quem citou cidade) e levava 4,4 s.
  conv as materialized (
    select right(so_digitos(c.telefone), 11) as tel,
           (array_agg(c.municipio_sugerido order by c.ultima_msg_at desc nulls last)
              filter (where nullif(btrim(c.municipio_sugerido), '') is not null))[1] as escrita
      from conversas c
     where length(so_digitos(c.telefone)) between 10 and 13
     group by 1
  ),
  confirmados as (
    select mb.nome as municipio, dm.ddd, count(*)::numeric as qtd
      from bp b
      join municipios_ba mb on mb.chave = chave_municipio(b.municipio)
      join ddd_municipio dm on dm.chave = mb.chave
     where b.local = 'bahia' and b.nome is not null
     group by mb.nome, dm.ddd
  ),
  por_ddd as (
    select ddd, sum(qtd) as total from confirmados group by ddd
  ),
  sem_lugar as materialized (
    select tel from bp
     where local in ('vazio', 'a_corrigir') or (local = 'bahia' and nome is null)
    union
    select c.tel from conv c
     where not exists (select 1 from bp b where b.tel = c.tel)
  ),
  -- A cidade citada mais recente de cada telefone, só se for da Bahia.
  citada as materialized (
    select c.tel, mb.nome as municipio
      from conv c
      join municipios_ba mb on mb.chave = chave_municipio(c.escrita)
  ),
  citaram as (
    select c.municipio, count(*)::numeric as qtd
      from sem_lugar s join citada c on c.tel = s.tel
     group by c.municipio
  ),
  sem_pista as (
    select s.tel, left(s.tel, 2) as ddd
      from sem_lugar s
     where length(s.tel) in (10, 11)
       and not exists (select 1 from citada c where c.tel = s.tel)
  ),
  com_ddd as (
    select ddd, count(*)::numeric as qtd from sem_pista group by ddd
  ),
  estimados as (
    select c.municipio, sum(s.qtd * c.qtd / p.total) as qtd
      from com_ddd s
      join por_ddd p on p.ddd = s.ddd
      join confirmados c on c.ddd = s.ddd
     group by c.municipio
  )
  select case when public.perfil_equipe() then jsonb_build_object(
    'citaram', coalesce((
      select jsonb_agg(jsonb_build_object('municipio', municipio, 'qtd', qtd::int) order by qtd desc)
        from citaram
    ), '[]'::jsonb),
    'pessoasCitaram', (select coalesce(sum(qtd), 0)::int from citaram),
    'estimados', coalesce((
      select jsonb_agg(jsonb_build_object('municipio', municipio, 'qtd', round(qtd, 1)) order by qtd desc)
        from estimados where qtd >= 0.05
    ), '[]'::jsonb),
    'distribuidas', (select coalesce(sum(qtd), 0)::int from com_ddd where ddd in (select ddd from por_ddd)),
    'porDdd', coalesce((
      select jsonb_agg(jsonb_build_object('ddd', s.ddd, 'pessoas', s.qtd::int) order by s.qtd desc)
        from com_ddd s where s.ddd in (select ddd from por_ddd)
    ), '[]'::jsonb),
    -- Mantém o nome antigo para a tela que já está no ar: agora é "DDD de fora
    -- E nenhuma cidade citada".
    'foraDaBahia', (select coalesce(sum(qtd), 0)::int from com_ddd where ddd not in (select ddd from por_ddd)),
    'semLugar',    (select count(*)::int from sem_lugar)
  ) else null end
$$;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Sem begin/rollback (ver 0022).
select proname as funcao_atualizada from pg_proc
 where proname = 'mapa_estimativa_ddd' and pronamespace = 'public'::regnamespace;
