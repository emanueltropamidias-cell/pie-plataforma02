-- ============================================================================
-- O FUNIL DO TRÁFEGO: do que a Meta entrega ao cadastro
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── PARA QUE ISTO EXISTE ────────────────────────────────────────────────────
--
-- A aba Tráfego nova cruza o que a Meta diz (conversas iniciadas, gasto) com o
-- que acontece DEPOIS, e o depois só o PIE sabe: quantas conversas chegaram,
-- quantas foram respondidas, quantas viraram cadastro. Em 14/09 a Meta iniciou
-- 1.328 conversas, 1.107 chegaram, 460 foram respondidas e 281 viraram cadastro
-- — e o custo por cadastro tinha ido de R$ 7,53 (06/09) para R$ 20,89.
--
-- A tela não pode contar isso sozinha: seriam 12 mil conversas atravessando a
-- rede para virar 30 números. Conta o banco, e devolve os 30 números.
--
-- ── AS MESMAS DEFINIÇÕES DAS MÉTRICAS ───────────────────────────────────────
--
--   o dia     coalesce(primeira_msg_at, criado_em), no fuso America/Bahia —
--             idêntico a `metricas_janelas_completo` e à supervisão. Um funil
--             que contasse o dia de outro jeito desencontraria da aba de
--             atendimento, e aí a coordenação teria dois números para o
--             mesmo dia.
--   chegou    tipo = 'lead'. Disparo que a campanha abriu não é gente que veio.
--
-- E um limite que a tela precisa dizer: "chegou" inclui TODA origem — orgânico,
-- QR, indicação. A Evolution não informa se a conversa veio de anúncio; só a
-- API oficial informa. Por isso é "chegaram no PIE", e não "leads do tráfego".
--
-- ── O RITMO POR HORA ────────────────────────────────────────────────────────
--
-- A projeção de fechamento do dia ("no ritmo de hoje, fecha em ~1.400") divide
-- o que já chegou pela fração do dia que COSTUMA ter chegado até esta hora. Essa
-- fração vem das chegadas reais dos últimos 14 dias fechados, e não de uma
-- divisão por 24: a campanha recebe 4% das conversas entre 0h e 5h e 10% só às
-- 12h — dividir por igual projetaria o dobro às 9 da manhã.

create or replace function public.trafego_funil(p_dias integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with lim as (
    select (date_trunc('day', now() at time zone 'America/Bahia') - make_interval(days => greatest(p_dias, 1)))
             at time zone 'America/Bahia' as desde,
           date_trunc('day', now() at time zone 'America/Bahia') at time zone 'America/Bahia' as hoje
  ),
  base as (
    select coalesce(c.primeira_msg_at, c.criado_em) as em, c.primeira_resp_at, c.cadastrado_em
      from conversas c, lim
     where c.tipo = 'lead'
       and coalesce(c.primeira_msg_at, c.criado_em) >= lim.desde
  ),
  dias as (
    select (em at time zone 'America/Bahia')::date as dia,
           count(*)::int as chegaram,
           count(*) filter (where primeira_resp_at is not null)::int as respondidas,
           count(*) filter (where cadastrado_em is not null)::int as cadastros
      from base group by 1
  ),
  horas as (
    select extract(hour from (em at time zone 'America/Bahia'))::int as hora, count(*)::numeric as n
      from base, lim
     where em >= lim.hoje - interval '14 days' and em < lim.hoje
     group by 1
  )
  select case when public.perfil_equipe() then
    jsonb_build_object(
      'dias', coalesce((select jsonb_agg(jsonb_build_object('dia', dia, 'chegaram', chegaram,
                                                            'respondidas', respondidas, 'cadastros', cadastros)
                                         order by dia) from dias), '[]'::jsonb),
      -- fração ACUMULADA do dia até o fim de cada hora, 0..23
      'ritmo', coalesce((
        select jsonb_agg(round(acum / nullif(total, 0), 4) order by h)
          from (
            select g.h,
                   sum(coalesce(ho.n, 0)) over (order by g.h) as acum,
                   sum(coalesce(ho.n, 0)) over () as total
              from generate_series(0, 23) g(h)
              left join horas ho on ho.hora = g.h
          ) x), '[]'::jsonb)
    )
  else null end
$$;

revoke all on function public.trafego_funil(integer) from public, anon;
grant execute on function public.trafego_funil(integer) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Rodando pelo script a sessão é `postgres`, sem usuário logado, e
-- perfil_equipe() é falso — a função devolveria nulo. Então a conferência lê
-- as mesmas contas diretamente, para os últimos 7 dias.

select (coalesce(primeira_msg_at, criado_em) at time zone 'America/Bahia')::date as dia,
       count(*)::int as chegaram,
       count(*) filter (where primeira_resp_at is not null)::int as respondidas,
       count(*) filter (where cadastrado_em is not null)::int as cadastros
  from conversas
 where tipo = 'lead'
   and coalesce(primeira_msg_at, criado_em) >= now() - interval '7 days'
 group by 1 order by 1;
