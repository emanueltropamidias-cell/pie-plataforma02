-- ============================================================================
-- A SOMATÓRIA DE TODAS AS BASES — contar junto, sem juntar
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- 15/09, logo depois de subir a base do mandato (29.347 pessoas): "tinha que
-- ter uma somatória de todas as bases que nós temos".
--
-- ── SOMAR NÃO É MISTURAR ────────────────────────────────────────────────────
--
-- Esta função só CONTA. Não grava nada, não move ninguém de gaveta, não devolve
-- nome nem telefone — só números. As bases continuam separadas como a 0029
-- garante; o que muda é que agora dá para ver o tamanho de tudo junto.
--
-- ── POR QUE DOIS TOTAIS ─────────────────────────────────────────────────────
--
-- A mesma pessoa pode estar na base da campanha E na do mandato. Somar as
-- bases conta essa pessoa duas vezes. Então saem os dois:
--
--   soma     o que cada base diz, somado — a conta que qualquer um faria
--   unicas   telefones diferentes em todas as bases — quantas pessoas de fato
--
-- A diferença entre os dois é quem está em mais de uma base. E para cada base
-- de fora, `novas`: quantas pessoas dela a campanha AINDA NÃO tem — o que ela
-- acrescenta de verdade.
--
-- A base da campanha entra com a mesma régua da Central da base
-- (`base_resumo`): cadastros com telefone + quem só conversou.

create or replace function public.bases_somatoria()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with campanha as (
    select tel from base_pessoas_mv where tel is not null
    union
    select tel from conversas_por_telefone_mv where tel is not null
  ),
  externas as (
    select base_id, telefone as tel from bases_externas_pessoas where telefone is not null
  ),
  todas as (
    select 'campanha'::text as base, tel from campanha
    union all
    select base_id::text, tel from externas
  ),
  por_tel as (
    select tel, count(distinct base) as bases from todas group by tel
  ),
  por_base as (
    select b.id, b.nome, b.situacao,
           count(e.tel) as pessoas,
           count(e.tel) filter (where not exists (select 1 from campanha c where c.tel = e.tel)) as novas
      from bases_externas b
      left join externas e on e.base_id = b.id
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
    'fora_da_campanha',(select count(*) from por_tel p
                          where not exists (select 1 from campanha c where c.tel = p.tel))
  ) end
$$;

revoke all on function public.bases_somatoria() from public, anon;
grant execute on function public.bases_somatoria() to authenticated;
