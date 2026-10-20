-- ============================================================================
-- CONTAR NO BANCO, E NÃO DEPOIS DE TRAZER TUDO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE ESTAS DUAS TELAS FAZIAM ───────────────────────────────────────────
--
-- METAS puxava as 6.531 lideranças INTEIRAS — sete viagens ao banco e mais de
-- um megabyte na rede — para montar um `{cidade: quantos}`. Um `group by`.
--
-- PLACAR (e o mesmo bloco no Dashboard) puxava as 208 lideranças e os 1.784
-- contatos para somar, em JavaScript, quantos cada uma trouxe.
--
-- O `paginar` que embrulha as duas está certo e continua necessário onde a
-- tela precisa das LINHAS. Aqui ela nunca precisou: precisava do resultado.
--
-- ── POR QUE ISSO É MAIS QUE LENTIDÃO ────────────────────────────────────────
--
-- É o mesmo defeito que o comentário do `metas/page.tsx` já denunciava: o
-- PostgREST devolve mil linhas e NÃO AVISA. O `paginar` foi a defesa contra
-- isso. Só que a defesa custa uma viagem por mil linhas, e a base cresce todo
-- dia — a conta ficava mais lenta a cada cadastro novo.
--
-- Contando no banco, o custo para de crescer com a base.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. METAS: QUANTOS CADASTRADOS POR CIDADE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A chave sai sem acento e em minúscula porque é assim que a tela cruza com a
-- lista de metas — a mesma regra do `normCidade` em `src/lib/raiz-continua.ts`.
-- Contato anônimo não conta, que é a regra que já estava lá.
create or replace function public.cadastros_por_cidade()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(chave, n), '{}'::jsonb)
    from (
      select lower(public.unaccent_simples(btrim(municipio))) as chave,
             count(*) as n
        from public.liderancas
       where coalesce(tipo, 'lideranca') <> 'contato'
         and municipio is not null
         and btrim(municipio) <> ''
       group by 1
    ) x;
$$;

comment on function public.cadastros_por_cidade is
  'Quantos cadastrados por cidade, sem acento e em minúscula. Substitui puxar as 6.531 lideranças para contar no navegador.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. PLACAR DAS LIDERANÇAS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Quantas pessoas cada liderança indicou, com o recorte dos últimos sete dias
-- ao lado — que é o que separa quem TROUXE de quem trouxe ONTEM.
create or replace function public.placar_liderancas()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', l.id, 'nome', l.nome, 'municipio', l.municipio,
               'pessoas', coalesce(c.total, 0),
               'semana',  coalesce(c.semana, 0)
             )
             order by coalesce(c.total, 0) desc, l.nome
           ),
           '[]'::jsonb
         )
    from public.liderancas l
    left join (
      select parent_id,
             count(*) as total,
             count(*) filter (where created_at >= now() - interval '7 day') as semana
        from public.liderancas
       where tipo = 'contato' and parent_id is not null
       group by parent_id
    ) c on c.parent_id = l.id
   where coalesce(l.tipo, 'lideranca') = 'lideranca';
$$;

comment on function public.placar_liderancas is
  'Quantas pessoas cada liderança indicou, total e nos últimos 7 dias. Substitui somar 1.992 linhas no navegador.';

-- O `left join` agrupa por quem indicou; sem índice é varredura a cada carga.
create index if not exists liderancas_por_indicador
  on public.liderancas (parent_id)
  where parent_id is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
select (select count(*) from jsonb_object_keys(public.cadastros_por_cidade())) as cidades_com_cadastro,
       (select sum(v::int) from jsonb_each_text(public.cadastros_por_cidade()) as t(k, v)) as pessoas_contadas,
       (select count(*) from public.liderancas
         where coalesce(tipo,'lideranca') <> 'contato'
           and municipio is not null and btrim(municipio) <> '')      as conferencia_direta,
       jsonb_array_length(public.placar_liderancas())                 as liderancas_no_placar;
