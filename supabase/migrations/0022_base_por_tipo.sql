-- ============================================================================
-- A BASE CONTADA POR PESSOA, NOS TRÊS TIPOS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
--
-- A central chamava de "Na base" o número de LINHAS de `liderancas`: 9.117 em
-- 15/09. Não são 9.117 pessoas:
--
--     4.369  com nome, telefone e município
--   + 2.680  com nome e telefone, sem município
--   +   241  fichas repetidas (o mesmo telefone mais de uma vez)
--   + 1.827  fichas SEM telefone — não recebem mensagem nem cruzam com nada
--   = 9.117
--
-- E faltava justamente o grupo maior: 5.090 pessoas que CONVERSARAM com a
-- campanha e nunca foram registradas. Elas não estavam em número nenhum. O
-- Emanuel descobriu que o 12.502 da aba Métricas e o 9.117 da base não somavam
-- — e não somavam porque um conta conversas e o outro conta linhas.
--
-- ── OS TRÊS TIPOS, NAS PALAVRAS DO EMANUEL ──────────────────────────────────
--
--   1  nome, telefone e município      cadastrada
--   2  nome e telefone                 cadastrada sem município
--   3  só o número                     conversou e não foi registrada
--
-- Uma pessoa é um telefone, nos últimos 11 dígitos. As duas tabelas guardam o
-- número em formatos diferentes — `conversas.telefone` com o 55 do país,
-- `liderancas.telefone_digitos` sem — e comparadas direto quase não casavam
-- (465 em comum de 10.411). Quando o mesmo telefone tem mais de uma ficha, vale
-- a mais completa: a que tem município ganha da que não tem.
--
-- ── O QUE ESTE NÚMERO AINDA NÃO SABE ────────────────────────────────────────
--
-- O nono dígito: "71 9 9999-9999" e "71 9999-9999" são a mesma pessoa e contam
-- como duas. O plano de juntar esses casos existe e não foi executado (apaga
-- cadastro). Até lá o total fica um pouco acima do real.

create or replace function public.base_resumo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select distinct on (right(telefone_digitos, 11))
           right(telefone_digitos, 11) as tel,
           nullif(btrim(nome), '') is not null as tem_nome,
           nullif(btrim(municipio), '') is not null as tem_municipio
      from liderancas
     where coalesce(telefone_digitos, '') <> ''
     order by right(telefone_digitos, 11),
              (nullif(btrim(municipio), '') is not null) desc,
              (nullif(btrim(nome), '') is not null) desc
  ),
  falou as (
    select distinct right(so_digitos(telefone), 11) as tel
      from conversas
     where length(so_digitos(telefone)) between 10 and 13
  )
  select case when public.perfil_equipe() then jsonb_build_object(
    'completos',     (select count(*) from base where tem_nome and tem_municipio),
    'sem_municipio', (select count(*) from base where not tem_municipio),
    'so_numero',     (select count(*) from falou f where not exists (select 1 from base b where b.tel = f.tel)),
    'sem_telefone',  (select count(*) from liderancas where coalesce(telefone_digitos, '') = ''),
    'repetidas',     (select count(*) - count(distinct right(telefone_digitos, 11))
                        from liderancas where coalesce(telefone_digitos, '') <> ''),
    'fichas',        (select count(*) from liderancas)
  ) else null end
$$;

revoke all on function public.base_resumo() from public, anon;
grant execute on function public.base_resumo() to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- A PRIMEIRA VERSÃO DESTE ARQUIVO NUNCA CRIOU A FUNÇÃO, e o erro importa.
--
-- A conferência simulava a sessão de um admin dentro de `begin ... rollback`.
-- Só que o scripts/rodar-sql.mjs roda o arquivo INTEIRO numa transação: aquele
-- `rollback` desfez tudo desde a primeira linha, inclusive o `create function`.
-- E o script ainda imprimiu os números certos e "OK" — calculados antes do
-- desfazer. A central da Base foi ao ar chamando uma função que não existia, e
-- mostrou zero em tudo.
--
-- Agora a conferência prova que a função EXISTE, que é o que importa aqui. O
-- resultado dela depende de um usuário logado e só se confere na tela.

select proname as funcao_criada, pg_get_function_result(oid) as devolve
  from pg_proc
 where proname = 'base_resumo' and pronamespace = 'public'::regnamespace;
