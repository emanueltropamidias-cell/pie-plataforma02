-- ============================================================================
-- EXPORTAR A BASE, NOS TRÊS TIPOS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- A central da Base passou a contar pessoas nos três tipos (0022). O Emanuel
-- abriu e perguntou pela exportação — e ela tem de sair com a MESMA regra do
-- número da tela, senão a planilha diz 12 mil e o painel diz outra coisa.
--
--   tipo 1   nome, telefone e município       ficha na base
--   tipo 2   nome e telefone, sem município     ficha na base
--   tipo 3   só o número                        conversou e não foi registrado;
--                                               o nome é o do WhatsApp
--   tipo 0   ficha sem telefone                 não entra no total da tela
--
-- ── POR QUE JSON NUMA CHAMADA, E NÃO LINHA A LINHA ──────────────────────────
--
-- O PostgREST devolve no máximo 1.000 linhas por chamada. Paginando, cada página
-- recalcularia os três tipos do zero — 1,4 s cada, 14 páginas, e a exportação
-- passaria do tempo da função da Vercel. Em JSON é uma linha só, uma vez.
--
-- `p_tipo` nulo = os três tipos com telefone (o total da tela). 0 = sem telefone.

create or replace function public.base_exportar(p_tipo integer default null)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select distinct on (right(telefone_digitos, 11))
           right(telefone_digitos, 11) as tel,
           nullif(btrim(nome), '') as nome,
           nullif(btrim(municipio), '') as municipio,
           nullif(btrim(bairro), '') as bairro,
           nullif(btrim(created_via), '') as origem,
           created_at
      from liderancas
     where coalesce(telefone_digitos, '') <> ''
     order by right(telefone_digitos, 11),
              (nullif(btrim(municipio), '') is not null) desc,
              (nullif(btrim(nome), '') is not null) desc
  ),
  falou as (
    select right(so_digitos(telefone), 11) as tel,
           (array_agg(nullif(btrim(nome), '') order by ultima_msg_at desc nulls last))[1] as nome_wa,
           max(ultima_msg_at) as ultima
      from conversas
     where length(so_digitos(telefone)) between 10 and 13
     group by 1
  ),
  todas as (
    select b.tel, b.nome, b.municipio, b.bairro,
           case when b.municipio is not null then 1 else 2 end as tipo,
           b.origem, f.ultima, b.created_at as cadastro
      from base b left join falou f on f.tel = b.tel
    union all
    select f.tel, f.nome_wa, null, null, 3, 'conversa', f.ultima, null
      from falou f
     where not exists (select 1 from base b where b.tel = f.tel)
    union all
    select null, nullif(btrim(nome), ''), nullif(btrim(municipio), ''), nullif(btrim(bairro), ''),
           0, nullif(btrim(created_via), ''), null, created_at
      from liderancas
     where coalesce(telefone_digitos, '') = ''
  )
  select case when public.perfil_equipe() then
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'telefone', tel, 'nome', nome, 'municipio', municipio, 'bairro', bairro,
               'tipo', tipo, 'origem', origem, 'ultima_conversa', ultima, 'cadastro', cadastro)
             order by tipo, municipio nulls last, nome nulls last)
        from todas
       where (p_tipo is null and tipo in (1, 2, 3)) or tipo = p_tipo
    ), '[]'::jsonb)
  else null end
$$;

revoke all on function public.base_exportar(integer) from public, anon;
grant execute on function public.base_exportar(integer) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Sem begin/rollback: o rodar-sql.mjs roda o arquivo numa transação só, e um
-- rollback aqui desfaria a função (foi o que zerou a Base em 15/09). A prova é
-- a função existir; o conteúdo depende de usuário logado e se confere na tela.
select proname as funcao_criada from pg_proc
 where proname = 'base_exportar' and pronamespace = 'public'::regnamespace;
