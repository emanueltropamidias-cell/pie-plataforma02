-- ============================================================================
-- O CANDIDATO É O SEQUENCIAL DO TSE, NÃO O NÚMERO DE URNA
-- ============================================================================
--
-- A 0055 identificava o candidato por (ano, turno, uf, cargo, numero). Numa
-- eleição geral isso basta: só existe um "1022" para deputado federal na Bahia.
-- Numa eleição MUNICIPAL, não: o vereador 55123 existe em cada uma das 417
-- cidades, e o prefeito 55 em todas onde o PSD lançou candidato.
--
-- Medido em 20/10/2026, depois da importação de 2024:
--
--   candidaturas no arquivo do TSE (BA)   35.209
--   candidaturas no banco                  3.910
--   prefeito "UBERLANDIA" (55)             votos em 224 municípios, 1,6 milhão
--
-- Ou seja: cada número guardou UM candidato, e os votos de todos os outros
-- com o mesmo número foram somados nele. Nenhum erro na importação — o
-- `on conflict` engoliu as repetições calado.
--
-- O sequencial (SQ_CANDIDATO) é único por candidatura e se repete entre o 1º e
-- o 2º turno, por isso a chave passa a ser (ano, turno, sq_candidato). A
-- unidade eleitoral (SG_UE / NM_UE) entra para a tela saber dizer "Prefeito de
-- Ilhéus" em vez de só "Prefeito".
--
-- Os dados de 2024 estão errados por construção e são apagados aqui. Não há
-- perda: são cópia do arquivo público do TSE, e `importar-tse.mjs` refaz.
-- 2022 está correto (um número por cargo no estado) e fica.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.eleicao_candidatos add column if not exists sg_ue text;
alter table public.eleicao_candidatos add column if not exists nm_ue text;

comment on column public.eleicao_candidatos.sg_ue is
  'Unidade eleitoral do TSE: a UF na eleição geral, o código do município na municipal.';
comment on column public.eleicao_candidatos.nm_ue is
  'Nome da unidade eleitoral: o estado na eleição geral, a cidade na municipal.';

delete from public.eleicao_candidatos where ano = 2024;

-- Na eleição geral a unidade é o próprio estado.
update public.eleicao_candidatos
   set sg_ue = uf
 where sg_ue is null;

alter table public.eleicao_candidatos alter column sq_candidato set not null;
alter table public.eleicao_candidatos alter column sg_ue set not null;

alter table public.eleicao_candidatos
  drop constraint if exists eleicao_candidatos_ano_turno_uf_cargo_numero_key;

alter table public.eleicao_candidatos
  drop constraint if exists eleicao_candidatos_ano_turno_sq_key;
alter table public.eleicao_candidatos
  add constraint eleicao_candidatos_ano_turno_sq_key unique (ano, turno, sq_candidato);

-- A tela devolve sq e unidade junto com o raio-x: a foto é achada pelo
-- sequencial, e o cargo municipal precisa da cidade para fazer sentido.
create or replace function public.obter_raio_x_candidato(p_candidato_id bigint)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with resumo as (
    select
      c.id,
      c.ano,
      c.turno,
      c.uf,
      c.sg_ue,
      c.nm_ue,
      c.cargo,
      c.numero,
      c.sq_candidato,
      c.nome_urna,
      c.nome_completo,
      c.partido_sigla,
      c.coligacao,
      c.situacao,
      c.foto_url,
      coalesce(sum(v.votos), 0)::bigint as total_votos,
      count(v.id) filter (where v.votos > 0)::integer as municipios_com_voto
    from public.eleicao_candidatos c
    left join public.eleicao_votos_municipio v on v.candidato_id = c.id
    where c.id = p_candidato_id
    group by c.id
  ),
  votos_mapa as (
    select jsonb_object_agg(v.municipio, v.votos) as mapa
    from public.eleicao_votos_municipio v
    where v.candidato_id = p_candidato_id
  ),
  top_cidades as (
    select jsonb_agg(jsonb_build_object(
      'municipio', v.municipio,
      'votos', v.votos,
      'codigo_tse', v.codigo_tse
    )) as ranking
    from (
      select v.municipio, v.votos, v.codigo_tse
      from public.eleicao_votos_municipio v
      where v.candidato_id = p_candidato_id and v.votos > 0
      order by v.votos desc
      limit 20
    ) v
  )
  select jsonb_build_object(
    'candidato', row_to_json(r),
    'votos_por_municipio', coalesce(m.mapa, '{}'::jsonb),
    'top_municipios', coalesce(t.ranking, '[]'::jsonb)
  )
  from resumo r
  cross join votos_mapa m
  cross join top_cidades t;
$$;

-- ── conferência ─────────────────────────────────────────────────────────────
select ano, uf, count(*) as candidaturas, count(distinct sq_candidato) as sequenciais
  from public.eleicao_candidatos
 group by 1, 2
 order by 1, 2;
