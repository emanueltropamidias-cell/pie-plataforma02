-- ============================================================================
-- QUANTO A EQUIPE CLASSIFICOU HOJE — contado pelo DIA DA MARCAÇÃO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria uma função de leitura.
--
-- ── O RELATO ────────────────────────────────────────────────────────────────
--
-- 19/09: "Eu estou marcando vários apoiadores, porém está marcando só 276
-- ainda."
--
-- Conferido: a equipe marcou 604 apoiadores hoje, e as 604 marcações FICARAM —
-- nenhuma se perdeu. A tela mostra 276 e está certa. Ela responde outra
-- pergunta.
--
-- ── AS DUAS PERGUNTAS ───────────────────────────────────────────────────────
--
-- A tela conta pelo dia em que o LEAD CHEGOU. Marcar hoje alguém que escreveu
-- em 27/08 joga esse apoiador na coluna de AGOSTO:
--
--     Paulo Ribeiro ......... marcado 19/09 14:10 · chegou 27/08
--     José Antonio .......... marcado 19/09 16:42 · chegou 28/08
--     José Nicolau .......... marcado 19/09 13:37 · chegou 29/08
--
-- Das 604 marcações de hoje, 330 foram em gente de dias anteriores. Mais da
-- metade do trabalho do dia vai para trás no calendário — e por isso a coluna
-- "Hoje" parece travada.
--
-- Isso é CORRETO para "o tráfego de terça trouxe quantos apoiadores?": a
-- resposta não pode mudar porque alguém classificou tarde.
--
-- Mas "quanto a equipe produziu hoje?" é outra pergunta, e ninguém respondia.
--
-- ── POR QUE UMA FUNÇÃO NOVA E NÃO UM PARÂMETRO NAS ANTIGAS ──────────────────
--
-- Porque mexer no significado dos números que já estão na tela é exatamente
-- como eu quebrei os menus da caixa ontem: uma mudança "pequena" no lugar
-- errado. Esta função não toca em nada que já existe — se ela estiver errada,
-- o pior que acontece é um número novo errado ao lado de números certos.

create or replace function public.classificacoes_no_periodo(
  p_dias      integer default 1,
  p_atendente uuid    default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with lim as (
    -- p_dias = 1 é "hoje": da meia-noite da Bahia até agora. É o mesmo recorte
    -- que a tela chama de Hoje, para os dois números serem comparáveis.
    select case
             when p_dias <= 1
               then date_trunc('day', now() at time zone 'America/Bahia')
                      at time zone 'America/Bahia'
             else now() - make_interval(days => p_dias)
           end as desde
  ),
  marcas as (
    select t.valor                as status,
           ct.marcada_por         as quem,
           ct.conversa_id
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
      cross join lim
     where t.eixo in ('status', 'perfil')
       and ct.marcada_em >= lim.desde
       and (p_atendente is null or ct.marcada_por = p_atendente)
  )
  select jsonb_build_object(
    'total',  (select count(*) from marcas),
    'pessoas',(select count(distinct conversa_id) from marcas),
    'status', coalesce((
       select jsonb_object_agg(status, n)
         from (select status, count(*) as n from marcas group by 1) x
    ), '{}'::jsonb),
    'por_atendente', coalesce((
       select jsonb_agg(jsonb_build_object('nome', nome, 'marcou', n) order by n desc)
         from (
           select coalesce(p.nome, '(sem conta)') as nome, count(*) as n
             from marcas m left join public.profiles p on p.id = m.quem
            group by 1
         ) y
    ), '[]'::jsonb)
  );
$function$;

comment on function public.classificacoes_no_periodo is
  'Quanto a equipe CLASSIFICOU no período, contado pelo dia da marcação — não pelo dia em que o lead chegou. Responde "quanto produzimos hoje", que as métricas não respondiam: lá, marcar hoje alguém que chegou em agosto conta em agosto.';

revoke all on function public.classificacoes_no_periodo(integer, uuid) from public, anon;
grant execute on function public.classificacoes_no_periodo(integer, uuid) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
select public.classificacoes_no_periodo(1, null) as hoje;
