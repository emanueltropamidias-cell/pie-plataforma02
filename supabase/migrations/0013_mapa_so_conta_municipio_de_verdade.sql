-- ============================================================================
-- O MAPA SÓ CONTA MUNICÍPIO QUE EXISTE — E MOSTRA O RESTO NUMA LISTA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. NÃO apaga nem altera nenhuma
-- pessoa: só muda o que a função AGRUPA e o que ela devolve.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- O mapa mostrava 569 municípios. A Bahia tem 417.
--
--     grafias na base ............ 569
--     são município da Bahia ..... 380
--     não são .................... 189   (307 pessoas)
--
-- E o que não é: `Chapada Diamantina` (região, 15 pessoas), `Pernambuco` (14),
-- `São Paulo` (11), `Minas Gerais` (10), `Bahia` (6), `Não Informou` (6).
--
-- ── POR QUE ENTRAM ──────────────────────────────────────────────────────────
--
-- `municipio_oficial` conserta o que reconhece e DEIXA PASSAR o que não
-- reconhece, só ajeitando as maiúsculas. "pernambuco" vira "Pernambuco" e entra
-- como se fosse município da Bahia.
--
-- Já existe `municipios_nao_reconhecidos()`, que lista exatamente isso. Alguém
-- construiu o diagnóstico e nada age sobre ele.
--
-- ── A DUPLICATA QUE ISTO FECHA ──────────────────────────────────────────────
--
-- A correção existia — escrita DUAS VEZES em TypeScript, no `mapa/page.tsx` e
-- no `painel-leads.tsx`, com o mesmo comentário copiado. E faltava na terceira
-- tela: o filtro de município do /leads continuava oferecendo "Pernambuco" e
-- "Não Informou" como se fossem opções de município baiano.
--
-- Duas cópias e um esquecimento é o padrão desta base. A regra passa a morar
-- aqui, onde os três leem — e tela nova não tem como nascer errada.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- `mapa` e `porMunicipio` passam a trazer SÓ município reconhecido. As grafias
-- soltas vão para `aRevisar`, com nome e quantidade, para virarem uma lista de
-- trabalho em vez de sumirem no meio de 569 linhas.
--
-- NINGUÉM É APAGADO. As 307 pessoas continuam na base, com o telefone e o nome
-- delas, e agora são achaveis — antes estavam escondidas à vista.

create or replace function public.painel_territorio()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $function$
  with pessoas as (
    select
      nullif(btrim(l.municipio), '')   as municipio,
      nullif(btrim(l.bairro), '')      as bairro,
      nullif(btrim(l.created_via), '') as origem,
      coalesce(l.tipo, 'lead')         as tipo,
      l.telefone, l.parent_id, l.created_at,
      -- ── POR JUNÇÃO, NÃO POR LINHA ──────────────────────────────────────
      --
      -- Isto era um `exists (select 1 from municipios_ba ...)` avaliado POR
      -- LIDERANÇA — 8.158 vezes. A função levava 648 ms e era chamada 1.137
      -- vezes, a segunda que mais pesou no banco.
      --
      -- Como junção, os 417 municípios entram uma vez, viram hash, e cada
      -- liderança consulta isso de graça.
      (mb.nome is not null) as vale
    from public.liderancas l
    left join public.municipios_ba mb
      on mb.chave = public.chave_municipio(nullif(btrim(l.municipio), ''))
    where l.tipo is distinct from 'contato'
  ),
  leads as (
    select * from pessoas where tipo in ('lead', 'lideranca')
  ),
  -- Daqui para baixo, "município" quer dizer município da Bahia. O resto vai
  -- para `aRevisar` e não polui contagem nenhuma.
  por_mun as (
    select municipio, count(*) as qtd
      from pessoas where municipio is not null and vale
     group by municipio
  ),
  por_bairro as (
    select municipio, bairro, count(*) as qtd
      from pessoas where municipio is not null and vale and bairro is not null
     group by municipio, bairro
  ),
  -- ── OS BAIRROS, AGRUPADOS DE UMA VEZ ──────────────────────────────────────
  --
  -- A lista de bairros era montada por uma subconsulta DENTRO do `jsonb_agg`
  -- dos municípios: uma consulta por município, 386 vezes.
  --
  -- `row_number` corta os doze primeiros de cada município numa passada, e o
  -- `jsonb_agg` monta as 386 listas juntas. Depois é só juntar por nome.
  bairros_do as (
    select municipio,
           jsonb_agg(jsonb_build_object('nome', bairro, 'qtd', qtd)
                     order by qtd desc, bairro) as lista
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
      select jsonb_agg(
        jsonb_build_object('municipio', m.municipio, 'qtd', m.qtd,
                           'bairros', coalesce(b.lista, '[]'::jsonb))
        order by m.qtd desc
      )
        from por_mun m
        left join bairros_do b on b.municipio = m.municipio
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

    -- ── AS GRAFIAS QUE NÃO SÃO MUNICÍPIO DAQUI ────────────────────────────
    --
    -- Lista de TRABALHO, e não descarte: cada linha é gente de verdade com
    -- telefone, esperando alguém dizer de qual cidade ela é. Ordenada por
    -- quantidade porque consertar "Pernambuco" resolve 14 de uma vez.
    'aRevisar', coalesce((
      select jsonb_agg(jsonb_build_object('nome', t.municipio, 'qtd', t.qtd) order by t.qtd desc, t.municipio)
        from (select municipio, count(*) as qtd from pessoas
               where municipio is not null and not vale group by municipio) t
    ), '[]'::jsonb),

    -- Os números que as telas recalculavam por conta. Agora vêm prontos.
    'municipiosAlcancados', (select count(*) from por_mun),
    'municipiosDaBahia',    (select count(*) from public.municipios_ba),
    'pessoasARevisar',      (select count(*) from pessoas where municipio is not null and not vale),

    'total',        (select count(*) from leads),
    'comTelefone',  (select count(*) from leads where telefone is not null),
    'vinculados',   (select count(*) from leads where parent_id is not null),
    'novosSemana',  (select count(*) from leads where created_at >= now() - interval '7 days'),
    'semMunicipio', (select count(*) from pessoas where municipio is null)
  )
$function$;

comment on function public.painel_territorio is
  'O território da campanha. "Município" aqui quer dizer município da Bahia: o que não está na lista dos 417 vai para aRevisar, com nome e quantidade. A regra mora aqui e não nas telas — estava escrita duas vezes em TypeScript e faltava numa terceira.';

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- `municipiosAlcancados` tem de ser <= 417. Se passar, a checagem não está
-- pegando. E `total` não pode ter mudado: ninguém sai da base por causa disto.
select (public.painel_territorio()->>'total')::int                 as pessoas_no_mapa,
       (public.painel_territorio()->>'municipiosAlcancados')::int  as alcancados,
       (public.painel_territorio()->>'municipiosDaBahia')::int     as na_bahia,
       (public.painel_territorio()->>'pessoasARevisar')::int       as pessoas_a_revisar,
       (public.painel_territorio()->>'semMunicipio')::int          as sem_municipio,
       jsonb_array_length(public.painel_territorio()->'porMunicipio') as grafias_no_filtro,
       jsonb_array_length(public.painel_territorio()->'aRevisar')     as grafias_a_revisar;
