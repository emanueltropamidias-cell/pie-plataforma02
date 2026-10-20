-- ============================================================================
-- A COBERTURA DO TSE VEM PRONTA, NÃO CALCULADA A CADA ABERTURA DE TELA
-- ============================================================================
--
-- `eleicao_cobertura()` (0057) contava, a cada abertura da Central de
-- Estratégia, as cidades distintas em ~360 mil linhas de voto: 1,3 a 2 s com
-- o banco calmo. Em 20/10/2026, com importação rodando ao mesmo tempo, a
-- chamada falhou — e a página tratava falha como "nada importado": 2022, 2024
-- e 2026 apareceram como "sem dados", com tudo no banco.
--
-- O número só muda quando se importa, então fica guardado numa visão
-- materializada. Os importadores (importar-tse.mjs, importar-tse-locais.mjs)
-- chamam `atualizar_eleicao_cobertura()` no fim. A leitura cai para ~1 ms.
-- ────────────────────────────────────────────────────────────────────────────

drop materialized view if exists public.eleicao_cobertura_mv;
create materialized view public.eleicao_cobertura_mv as
  with c as (
    select ano, uf, count(*) as candidaturas
      from public.eleicao_candidatos
     group by 1, 2
  ),
  m as (
    select ano, uf, count(distinct municipio) as municipios
      from public.eleicao_votos_municipio
     group by 1, 2
  )
  select c.ano, c.uf, c.candidaturas, coalesce(m.municipios, 0) as municipios
    from c
    left join m using (ano, uf);

create unique index eleicao_cobertura_mv_key on public.eleicao_cobertura_mv (ano, uf);

-- A visão não fica exposta pela API; quem lê é a função.
revoke all on public.eleicao_cobertura_mv from anon, authenticated;

create or replace function public.eleicao_cobertura()
returns table (ano integer, uf text, candidaturas bigint, municipios bigint)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ano, uf, candidaturas, municipios
    from public.eleicao_cobertura_mv
   order by 1, 2;
$$;

grant execute on function public.eleicao_cobertura() to authenticated, service_role;

create or replace function public.atualizar_eleicao_cobertura()
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  refresh materialized view concurrently public.eleicao_cobertura_mv;
$$;

revoke all on function public.atualizar_eleicao_cobertura() from public, anon, authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
select * from public.eleicao_cobertura();
