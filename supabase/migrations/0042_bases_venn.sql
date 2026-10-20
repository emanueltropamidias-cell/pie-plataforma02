-- ============================================================================
-- ESCOLHER QUAIS BASES ENTRAM NA CONTA, SEM CONTAR NINGUÉM DUAS VEZES
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria função de leitura.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 28/09, Emanuel: "adicione nas bases uma chave de seleção, essa chave junta
-- os valores da base, porque assim quebra o valor real que eu tenho".
--
-- Ele está certo, e o problema é mais antigo que o pedido. Medido em 28/09:
-- a base "Agenda dos aparelhos" tem 3.238 pessoas que também estão na base do
-- Mandato 2023, e a base "Apoiadores" inteira — 8.394 pessoas — já está em
-- `conversas`, porque foi montada a partir delas.
--
-- Somar as gavetas conta essa gente duas vezes. E é a soma que alguém repete
-- numa reunião.
--
-- ── POR QUE NÃO UMA CONSULTA POR CLIQUE ─────────────────────────────────────
--
-- O caminho óbvio seria mandar a lista de bases marcadas ao banco e receber o
-- total. Mas cada clique numa caixinha vira uma ida de rede, e a pessoa clica
-- cinco vezes seguidas experimentando combinações.
--
-- ── A SOLUÇÃO: AS REGIÕES DO DIAGRAMA, NÃO OS TOTAIS ────────────────────────
--
-- Em vez do total de cada base, esta função devolve quantas pessoas existem em
-- CADA COMBINAÇÃO EXATA de bases:
--
--   {campanha}                        → 21.109 pessoas SÓ na campanha
--   {campanha, apoiadores}            → 8.394  nas duas, e em nenhuma outra
--   {mandato, agenda}                 → 3.238  nessas duas, e só nelas
--   ...
--
-- São as regiões de um diagrama de Venn. Com quatro conjuntos há no máximo 15
-- regiões não vazias — cabem num punhado de linhas.
--
-- Com elas, o total de QUALQUER seleção é a soma das regiões que tocam a
-- seleção, e essa conta a tela faz sozinha, em memória, sem rede. Marcar e
-- desmarcar vira instantâneo, e o número continua sendo pessoas distintas.
--
-- ── O TELEFONE É COMPARADO COMO A 0030 COMPARA ──────────────────────────────
--
-- Cru, e não por `fone_canonico`. Não porque seja melhor: é para esta função
-- dar exatamente o mesmo número que `bases_somatoria` já mostra na tela. Duas
-- contas de pessoas distintas na MESMA tela, discordando por causa de
-- normalização, seria pior que o problema que isto resolve.
--
-- Fica registrado como dívida: o certo é as duas passarem a usar
-- `fone_canonico`, juntas, num passo só.

create or replace function public.bases_venn()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  with campanha as (
    select tel from base_pessoas_mv where tel is not null
    union
    select tel from conversas_por_telefone_mv where tel is not null
  ),
  todas as (
    select 'campanha'::text as base, tel from campanha
    union all
    select base_id::text, telefone from bases_externas_pessoas where telefone is not null
  ),
  -- Uma linha por pessoa, com a lista ORDENADA das bases em que ela está.
  -- Ordenar é o que faz {a,b} e {b,a} caírem na mesma região.
  por_pessoa as (
    select tel, array_agg(distinct base order by base) as bases
      from todas group by tel
  )
  select case when not public.perfil_equipe() then null else jsonb_build_object(
    -- O catálogo, para a tela saber o que desenhar e com que nome.
    'bases', jsonb_build_array(
      jsonb_build_object('id', 'campanha', 'nome', 'Base da campanha',
                         'nota', 'Cadastros e quem conversou')
    ) || coalesce((
      select jsonb_agg(jsonb_build_object('id', b.id::text, 'nome', b.nome,
                                          'nota', b.categoria)
                       order by b.criada_em)
        from bases_externas b), '[]'::jsonb),
    -- As regiões. `pessoas` nunca se sobrepõe entre linhas: cada pessoa está
    -- em exatamente uma região, que é a definição.
    'regioes', coalesce((
      select jsonb_agg(jsonb_build_object('bases', bases, 'pessoas', n)
                       order by n desc)
        from (select bases, count(*) as n from por_pessoa group by bases) r
    ), '[]'::jsonb)
  ) end
$function$;

comment on function public.bases_venn is
  'As regiões do diagrama de Venn das bases: quantas pessoas existem em cada combinação EXATA de bases. Permite à tela calcular o total de qualquer seleção somando regiões, sem ir ao banco a cada clique e sem contar ninguém duas vezes. Telefone comparado cru, igual a bases_somatoria, para as duas contas não discordarem na mesma tela.';

revoke all on function public.bases_venn() from public, anon;
grant execute on function public.bases_venn() to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
-- A soma de TODAS as regiões tem de ser igual ao `unicas` de bases_somatoria.
-- Se não for, uma das duas está errada, e é melhor descobrir aqui.
select
  (select sum((r->>'pessoas')::bigint)
     from jsonb_array_elements(public.bases_venn() -> 'regioes') r) as soma_das_regioes,
  (public.bases_somatoria() ->> 'unicas')::bigint                   as unicas_da_somatoria,
  (select sum((r->>'pessoas')::bigint)
     from jsonb_array_elements(public.bases_venn() -> 'regioes') r)
    = (public.bases_somatoria() ->> 'unicas')::bigint               as batem;
