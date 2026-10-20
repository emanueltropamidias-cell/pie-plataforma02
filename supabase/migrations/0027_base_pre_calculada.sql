-- ============================================================================
-- A BASE PRÉ-CALCULADA DE 10 EM 10 MINUTOS — para as telas não pararem
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O RISCO QUE ISTO FECHA ──────────────────────────────────────────────────
--
-- As funções da Base, da exportação e do mapa (0022 a 0026) calculavam tudo NA
-- HORA, direto das conversas e dos cadastros. Isso é o que as mantém sempre
-- certas — e é o que as deixa mais lentas a cada conversa nova. Medido em 15/09,
-- com 12.826 conversas:
--
--   estimativa do mapa   2,3 s     exportar a base   1,7 s
--   resumo da Base       1,4 s     painel do mapa    0,9 s
--
-- O Supabase corta consulta de usuário logado em 8 s, e a tela mostra ZERO —
-- o mesmo sintoma da Base zerada da manhã. Na semana de 07/09 entraram 6.510
-- conversas: a estimativa do mapa estouraria em cerca de 30 dias nesse ritmo,
-- e em cerca de 10 a 3 mil leads por dia.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
--
-- As duas contas pesadas passam a ficar prontas:
--
--   base_pessoas_mv            uma pessoa por telefone, com o lugar dela
--   conversas_por_telefone_mv  um telefone por linha, com a cidade citada,
--                              o nome do WhatsApp e a última conversa
--
-- O pg_cron refaz as duas a cada 10 minutos, e as telas leem pronto — o tempo
-- delas deixa de crescer com a base. O preço é o número poder estar até 10
-- minutos atrasado, o que para Base e mapa não muda decisão nenhuma. A tela
-- mostra a hora da última atualização (`base_cache_atualizada`).
--
-- `refresh ... concurrently` não trava a leitura enquanto refaz: quem abre a
-- Base durante a atualização vê a versão anterior, nunca uma tela vazia. Para
-- isso cada view precisa de um índice único — o telefone.
--
-- As contagens baratas (fichas, sem telefone, repetidas) seguem ao vivo.

-- ── 1. As duas contas prontas ───────────────────────────────────────────────

create materialized view if not exists public.base_pessoas_mv as
  select * from public.base_pessoas;

create unique index if not exists base_pessoas_mv_tel on public.base_pessoas_mv (tel);
create index if not exists base_pessoas_mv_local on public.base_pessoas_mv (local);

create materialized view if not exists public.conversas_por_telefone_mv as
  select right(public.so_digitos(c.telefone), 11) as tel,
         (array_agg(c.municipio_sugerido order by c.ultima_msg_at desc nulls last)
            filter (where nullif(btrim(c.municipio_sugerido), '') is not null))[1] as cidade_citada,
         (array_agg(nullif(btrim(c.nome), '') order by c.ultima_msg_at desc nulls last)
            filter (where nullif(btrim(c.nome), '') is not null))[1] as nome_wa,
         max(c.ultima_msg_at) as ultima
    from public.conversas c
   where length(public.so_digitos(c.telefone)) between 10 and 13
   group by 1;

create unique index if not exists conversas_por_telefone_mv_tel on public.conversas_por_telefone_mv (tel);

-- Telefone de 12 mil pessoas: a tela não lê direto, só pelas funções que
-- conferem perfil_equipe().
revoke all on public.base_pessoas_mv from public, anon, authenticated;
revoke all on public.conversas_por_telefone_mv from public, anon, authenticated;

-- ── 2. A hora da última atualização ─────────────────────────────────────────

create table if not exists public.base_cache (
  id integer primary key default 1 check (id = 1),
  atualizado_em timestamptz,
  segundos numeric
);
insert into public.base_cache (id, atualizado_em) values (1, now()) on conflict (id) do nothing;
alter table public.base_cache enable row level security;
drop policy if exists "base_cache ler" on public.base_cache;
create policy "base_cache ler" on public.base_cache for select to authenticated using (true);

create or replace function public.atualizar_base_cache()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t0 timestamptz := clock_timestamp();
begin
  refresh materialized view concurrently public.base_pessoas_mv;
  refresh materialized view concurrently public.conversas_por_telefone_mv;
  update public.base_cache
     set atualizado_em = now(),
         segundos = round(extract(epoch from clock_timestamp() - t0)::numeric, 1)
   where id = 1;
end $$;

revoke all on function public.atualizar_base_cache() from public, anon, authenticated;

-- ATENÇÃO: a 0031 trocou isto por "de minuto em minuto, se algo mudou". Rodar
-- esta de novo volta para 10 em 10 — rode a 0031 depois.
-- ── 3. De 10 em 10 minutos ──────────────────────────────────────────────────
-- Minuto 3, 13, 23...: fora dos minutos da faxina (10, 15, 20, 25) para as duas
-- não disputarem a mesma leitura das conversas.
select cron.unschedule('base-pre-calculada')
 where exists (select 1 from cron.job where jobname = 'base-pre-calculada');
select cron.schedule('base-pre-calculada', '3,13,23,33,43,53 * * * *', 'select public.atualizar_base_cache()');

-- ── 4. As funções leem pronto ───────────────────────────────────────────────

create or replace function public.base_resumo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when public.perfil_equipe() then jsonb_build_object(
    'completos',     (select count(*) from base_pessoas_mv where local = 'bahia' and nome is not null),
    'outro_estado',  (select count(*) from base_pessoas_mv where local = 'outro_estado'),
    'sem_municipio', (select count(*) from base_pessoas_mv where local in ('vazio', 'a_corrigir')
                        or (local = 'bahia' and nome is null)),
    'a_corrigir',    (select count(*) from base_pessoas_mv where local = 'a_corrigir'),
    'so_numero',     (select count(*) from conversas_por_telefone_mv f
                       where not exists (select 1 from base_pessoas_mv b where b.tel = f.tel)),
    'sem_telefone',  (select count(*) from liderancas where coalesce(telefone_digitos, '') = ''),
    'repetidas',     (select count(*) - count(distinct right(telefone_digitos, 11))
                        from liderancas where coalesce(telefone_digitos, '') <> ''),
    'fichas',        (select count(*) from liderancas),
    'atualizado_em', (select atualizado_em from base_cache where id = 1)
  ) else null end
$$;

create or replace function public.base_exportar(p_tipo text default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with todas as (
    select b.tel, b.nome, b.municipio, b.bairro,
           case when b.local = 'bahia' and b.nome is not null then 'completos'
                when b.local = 'outro_estado' then 'outro_estado'
                else 'sem_municipio' end as tipo,
           (b.local = 'a_corrigir') as municipio_a_corrigir,
           b.origem, f.ultima, b.created_at as cadastro
      from base_pessoas_mv b left join conversas_por_telefone_mv f on f.tel = b.tel
    union all
    select f.tel, f.nome_wa, null, null, 'so_numero', false, 'conversa', f.ultima, null
      from conversas_por_telefone_mv f
     where not exists (select 1 from base_pessoas_mv b where b.tel = f.tel)
    union all
    select null, nullif(btrim(nome), ''), nullif(btrim(municipio), ''), nullif(btrim(bairro), ''),
           'sem_telefone', false, nullif(btrim(created_via), ''), null, created_at
      from liderancas
     where coalesce(telefone_digitos, '') = ''
  )
  select case when public.perfil_equipe() then
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'telefone', tel, 'nome', nome, 'municipio', municipio, 'bairro', bairro,
               'tipo', tipo, 'municipio_a_corrigir', municipio_a_corrigir,
               'origem', origem, 'ultima_conversa', ultima, 'cadastro', cadastro)
             order by tipo, municipio nulls last, nome nulls last)
        from todas
       where (p_tipo is null and tipo <> 'sem_telefone') or tipo = p_tipo
    ), '[]'::jsonb)
  else null end
$$;

create or replace function public.mapa_estimativa_ddd()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with confirmados as (
    select mb.nome as municipio, dm.ddd, count(*)::numeric as qtd
      from base_pessoas_mv b
      join municipios_ba mb on mb.chave = chave_municipio(b.municipio)
      join ddd_municipio dm on dm.chave = mb.chave
     where b.local = 'bahia' and b.nome is not null
     group by mb.nome, dm.ddd
  ),
  por_ddd as (
    select ddd, sum(qtd) as total from confirmados group by ddd
  ),
  sem_lugar as materialized (
    select tel from base_pessoas_mv
     where local in ('vazio', 'a_corrigir') or (local = 'bahia' and nome is null)
    union
    select c.tel from conversas_por_telefone_mv c
     where not exists (select 1 from base_pessoas_mv b where b.tel = c.tel)
  ),
  citada as materialized (
    select c.tel, mb.nome as municipio
      from conversas_por_telefone_mv c
      join municipios_ba mb on mb.chave = chave_municipio(c.cidade_citada)
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
    'foraDaBahia', (select coalesce(sum(qtd), 0)::int from com_ddd where ddd not in (select ddd from por_ddd)),
    'semLugar',    (select count(*)::int from sem_lugar),
    'atualizado_em', (select atualizado_em from base_cache where id = 1)
  ) else null end
$$;

-- painel_territorio: só a CTE `unicas` troca de fonte. O resto é a 0024.
create or replace function public.painel_territorio()
returns jsonb
language sql
stable
set search_path to 'public', 'pg_temp'
as $$
  with pessoas as (
    select
      nullif(btrim(l.municipio), '')   as municipio,
      nullif(btrim(l.bairro), '')      as bairro,
      nullif(btrim(l.created_via), '') as origem,
      coalesce(l.tipo, 'lead')         as tipo,
      l.telefone, l.parent_id, l.created_at,
      (mb.nome is not null) as vale
    from public.liderancas l
    left join public.municipios_ba mb
      on mb.chave = public.chave_municipio(nullif(btrim(l.municipio), ''))
    where l.tipo is distinct from 'contato'
  ),
  leads as (
    select * from pessoas where tipo in ('lead', 'lideranca')
  ),
  unicas as (
    select b.local, b.bairro, b.municipio as escrito, mb.nome as municipio
      from public.base_pessoas_mv b
      left join public.municipios_ba mb on mb.chave = public.chave_municipio(b.municipio)
     where b.nome is not null
  ),
  por_mun as (
    select municipio, count(*) as qtd from unicas where local = 'bahia' group by municipio
  ),
  por_bairro as (
    select municipio, bairro, count(*) as qtd
      from unicas where local = 'bahia' and bairro is not null
     group by municipio, bairro
  ),
  bairros_do as (
    select municipio,
           jsonb_agg(jsonb_build_object('nome', bairro, 'qtd', qtd) order by qtd desc, bairro) as lista
      from (
        select municipio, bairro, qtd,
               row_number() over (partition by municipio order by qtd desc, bairro) as pos
          from por_bairro
      ) x
     where pos <= 12
     group by municipio
  )
  select jsonb_build_object(
    'mapa', coalesce((
      select jsonb_agg(jsonb_build_object('municipio', m.municipio, 'qtd', m.qtd,
                                          'bairros', coalesce(b.lista, '[]'::jsonb))
                       order by m.qtd desc)
        from por_mun m left join bairros_do b on b.municipio = m.municipio
    ), '[]'::jsonb),
    'porMunicipio', coalesce((
      select jsonb_agg(jsonb_build_object('nome', t.municipio, 'qtd', t.qtd) order by t.qtd desc)
        from (select municipio, count(*) as qtd from leads
               where municipio is not null and vale group by municipio) t
    ), '[]'::jsonb),
    'porOrigem', coalesce((
      select jsonb_agg(jsonb_build_object('nome', t.origem, 'qtd', t.qtd) order by t.qtd desc)
        from (select origem, count(*) as qtd from leads where origem is not null group by origem) t
    ), '[]'::jsonb),
    'aRevisar', coalesce((
      select jsonb_agg(jsonb_build_object('nome', t.escrito, 'qtd', t.qtd) order by t.qtd desc, t.escrito)
        from (select escrito, count(*) as qtd from unicas where local = 'a_corrigir' group by escrito) t
    ), '[]'::jsonb),
    'outroEstado', coalesce((
      select jsonb_agg(jsonb_build_object('nome', t.escrito, 'qtd', t.qtd) order by t.qtd desc, t.escrito)
        from (select escrito, count(*) as qtd from unicas where local = 'outro_estado' group by escrito) t
    ), '[]'::jsonb),
    'municipiosAlcancados', (select count(*) from por_mun),
    'municipiosDaBahia',    (select count(*) from public.municipios_ba),
    'pessoasNoMapa',        (select coalesce(sum(qtd), 0) from por_mun),
    'pessoasARevisar',      (select count(*) from unicas where local = 'a_corrigir'),
    'pessoasOutroEstado',   (select count(*) from unicas where local = 'outro_estado'),
    'total',        (select count(*) from leads),
    'comTelefone',  (select count(*) from leads where telefone is not null),
    'vinculados',   (select count(*) from leads where parent_id is not null),
    'novosSemana',  (select count(*) from leads where created_at >= now() - interval '7 days'),
    'semMunicipio', (select count(*) from pessoas where municipio is null)
  )
$$;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Sem begin/rollback (ver 0022).

select (select count(*) from base_pessoas_mv)::int as pessoas_prontas,
       (select count(*) from conversas_por_telefone_mv)::int as telefones_de_conversa,
       (select count(*) from base_pessoas_mv where local = 'bahia' and nome is not null)::int as completos_bahia;

select jobname, schedule, active from cron.job where jobname = 'base-pre-calculada';

select (painel_territorio() ->> 'pessoasNoMapa')::int as pessoas_no_mapa;
