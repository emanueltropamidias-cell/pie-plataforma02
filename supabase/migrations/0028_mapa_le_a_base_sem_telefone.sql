-- ============================================================================
-- O MAPA VOLTA A LER A BASE — sem ganhar acesso a telefone nenhum
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O DEFEITO, E ELE É MEU ──────────────────────────────────────────────────
--
-- Na 0024 o `painel_territorio()` passou a contar pessoas lendo a view
-- `base_pessoas` — e a mesma migração tirou dessa view a leitura do usuário
-- logado, de propósito, porque ela tem o telefone de 12 mil pessoas.
--
-- Só que `painel_territorio()` NÃO é security definer: roda com a permissão de
-- quem abriu a tela. Para a equipe logada, a leitura era recusada ("permission
-- denied for materialized view base_pessoas_mv", depois da 0027). Os testes
-- rodaram como `postgres` e passaram; só um teste com sessão de usuário logado,
-- em 15/09, mostrou a recusa.
--
-- Não apareceu zero na tela porque `lerTerritorio()` tem uma conta reserva para
-- quando a função falha. Mas a reserva conta FICHAS — então Dashboard, Leads e
-- Mapa voltaram a mostrar os números antigos, justamente os que a 0024 corrigiu.
--
-- ── O CONSERTO NÃO ABRE A BASE ──────────────────────────────────────────────
--
-- Dar leitura da view para `authenticated` resolveria em uma linha e poria o
-- telefone de todo mundo ao alcance de qualquer conta logada — atendente e
-- liderança inclusive — pela API, sem tela nenhuma no meio.
--
-- Em vez disso, `base_geo()`: security definer, devolve SÓ o que o mapa usa
-- (lugar, bairro, município escrito e o oficial), nada de nome nem telefone, e
-- só para perfil_equipe(). O painel continua rodando com a permissão de quem
-- abriu, e lê as pessoas por essa porta estreita.

create or replace function public.base_geo()
returns table (local text, bairro text, escrito text, municipio text)
language sql
stable
security definer
set search_path = public
as $$
  select b.local, b.bairro, b.municipio, mb.nome
    from base_pessoas_mv b
    left join municipios_ba mb on mb.chave = chave_municipio(b.municipio)
   where b.nome is not null
     and public.perfil_equipe()
$$;

revoke all on function public.base_geo() from public, anon;
grant execute on function public.base_geo() to authenticated, service_role;

-- painel_territorio: só a CTE `unicas` muda — lê `base_geo()` em vez da view.
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
  unicas as materialized (
    select * from public.base_geo()
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
-- Sem begin/rollback (ver 0022). O teste que importa — com sessão de usuário
-- logado, que é o que faltou na 0024 — roda à parte, com --teste.
select proname as funcao, prosecdef as security_definer
  from pg_proc
 where pronamespace = 'public'::regnamespace and proname in ('base_geo', 'painel_territorio')
 order by 1;
