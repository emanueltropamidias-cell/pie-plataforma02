-- Painel e mapa em uma consulta só.
--
-- Antes: a página lia as ~29 mil linhas em blocos de 1000 (o limite do
-- PostgREST) e somava no servidor Node. Eram ~30 idas ao banco por
-- carregamento, com a base inteira trafegando à toa. Agora o Postgres agrupa
-- onde os dados estão e devolve algumas centenas de linhas prontas.

-- 1) Índices ------------------------------------------------------------------

create index if not exists liderancas_tipo_criado_idx
  on public.liderancas (tipo, created_at desc);

create index if not exists liderancas_municipio_idx
  on public.liderancas (municipio)
  where municipio is not null;

create index if not exists liderancas_parent_idx
  on public.liderancas (parent_id)
  where parent_id is not null;

-- Busca por nome/telefone usa ILIKE '%texto%', que índice comum não atende.
-- Trigrama resolve — é o que faz a busca da lista responder de imediato.
create extension if not exists pg_trgm;

create index if not exists liderancas_nome_trgm_idx
  on public.liderancas using gin (nome gin_trgm_ops);

create index if not exists liderancas_telefone_trgm_idx
  on public.liderancas using gin (telefone gin_trgm_ops);

-- 2) Agregado -----------------------------------------------------------------

create or replace function public.painel_territorio()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with pessoas as (
  -- Contato anônimo do QR é clique, não pessoa identificada num território.
  select
    nullif(btrim(municipio), '')   as municipio,
    nullif(btrim(bairro), '')      as bairro,
    nullif(btrim(created_via), '') as origem,
    coalesce(tipo, 'lead')         as tipo,
    telefone,
    parent_id,
    created_at
  from public.liderancas
  where tipo is distinct from 'contato'
),
leads as (
  -- ── LIDERANÇA É MUNÍCIPE ──────────────────────────────────────────────────
  --
  -- Era `tipo = 'lead'`. O cabeçalho dizia 290 e a lista dizia 83: dois números
  -- para a mesma pergunta, na mesma tela. Quem confere um pelo outro conclui
  -- que o sistema está errado, e conclui certo.
  --
  -- Consertei isso no banco no dia e ESQUECI O ARQUIVO. Quem rodasse este
  -- script de novo trazia o defeito de volta — e ninguém desconfiaria, porque
  -- rodar um arquivo do repositório é o gesto mais seguro que existe.
  --
  -- Corrigido aqui em 28/08, junto com a regra do Emanuel: a mudança tem que
  -- valer em todas as camadas, e o arquivo é uma delas.
  select * from pessoas where tipo in ('lead', 'lideranca')
),
por_mun as (
  select municipio, count(*) as qtd
  from pessoas
  where municipio is not null
  group by municipio
),
por_bairro as (
  select municipio, bairro, count(*) as qtd
  from pessoas
  where municipio is not null and bairro is not null
  group by municipio, bairro
)
select jsonb_build_object(
  'mapa', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'municipio', m.municipio,
        'qtd', m.qtd,
        'bairros', coalesce((
          select jsonb_agg(jsonb_build_object('nome', b.bairro, 'qtd', b.qtd))
          from (
            select bairro, qtd from por_bairro b2
            where b2.municipio = m.municipio
            order by qtd desc, bairro
            limit 12
          ) b
        ), '[]'::jsonb)
      )
      order by m.qtd desc
    )
    from por_mun m
  ), '[]'::jsonb),

  'porMunicipio', coalesce((
    select jsonb_agg(jsonb_build_object('nome', t.municipio, 'qtd', t.qtd) order by t.qtd desc)
    from (
      select municipio, count(*) as qtd from leads where municipio is not null group by municipio
    ) t
  ), '[]'::jsonb),

  'porOrigem', coalesce((
    select jsonb_agg(jsonb_build_object('nome', t.origem, 'qtd', t.qtd) order by t.qtd desc)
    from (
      select origem, count(*) as qtd from leads where origem is not null group by origem
    ) t
  ), '[]'::jsonb),

  'total',       (select count(*) from leads),
  'comTelefone', (select count(*) from leads where telefone is not null),
  'vinculados',  (select count(*) from leads where parent_id is not null),
  'novosSemana', (select count(*) from leads where created_at >= now() - interval '7 days'),
  'semMunicipio',(select count(*) from pessoas where municipio is null)
)
$$;

grant execute on function public.painel_territorio() to authenticated, anon;

-- 3) KPIs do painel geral -----------------------------------------------------

create or replace function public.resumo_geral()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'liderancas',  count(*) filter (where tipo = 'lideranca'),
    'leads',       count(*) filter (where tipo = 'lead'),
    'votos',       coalesce(sum(votos_comprometidos), 0),
    'municipios',  count(distinct nullif(btrim(municipio), ''))
  )
  from public.liderancas;
$$;

grant execute on function public.resumo_geral() to authenticated, anon;
