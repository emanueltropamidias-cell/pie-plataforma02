-- ============================================================================
-- OLHAR A SAÚDE DO BANCO SEM GASTAR CONEXÃO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria uma função de leitura.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- Toda vez que eu diagnostico alguma coisa, abro uma conexão de SESSÃO com o
-- banco — do mesmo bolo de 60 que o login, o Realtime, o Storage e as 18
-- atendentes dividem.
--
-- Hoje isso cobrou caro: no meio da crise em que o pool estava esgotado, eu
-- rodei dezenas de consultas para entender o que estava acontecendo. Estava
-- competindo com a equipe pelo recurso que faltava, e a minha própria consulta
-- acabou recebendo o erro que eu investigava:
--
--     unable to check out connection from the pool after 15000ms
--
-- Com esta função, a checagem passa a ir pelo PostgREST — HTTP, pelo mesmo
-- caminho que a plataforma já usa, sem abrir sessão nova. Vigiar deixa de
-- piorar o que se está vigiando.
--
-- ── POR QUE SÓ SUPERVISÃO LÊ ────────────────────────────────────────────────
--
-- Ela devolve contagem de conexões e nomes de serviço. Não é segredo grave, mas
-- é informação de infraestrutura, e atendente não tem o que fazer com ela.

create or replace function public.folga_do_banco()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'teto',        (select setting::int from pg_settings where name = 'max_connections'),
    'em_uso',      (select count(*) from pg_stat_activity),
    'ativas',      (select count(*) from pg_stat_activity where state = 'active'),
    'ociosas',     (select count(*) from pg_stat_activity where state = 'idle'),
    -- Transação aberta e parada é o que realmente vaza conexão: ela segura a
    -- vaga e a trava, e não está fazendo nada. Acima de um minuto é sintoma.
    'presas',      (select count(*) from pg_stat_activity
                     where state = 'idle in transaction'
                       and state_change < now() - interval '1 minute'),
    'folga',       (select (select setting::int from pg_settings where name='max_connections')
                           - count(*) from pg_stat_activity),
    -- Quanto tempo o banco está de pé. Depois de um restart ele fica frio e
    -- lento por alguns minutos — sem este número, a lentidão do banco frio
    -- parece defeito novo.
    'ligado_ha_min', (select round(extract(epoch from (now() - pg_postmaster_start_time()))/60)::int),
    'cache_pct',   (select round(100.0*sum(heap_blks_hit)/nullif(sum(heap_blks_hit)+sum(heap_blks_read),0),1)
                      from pg_statio_user_tables)
  );
$function$;

comment on function public.folga_do_banco is
  'Quantas conexões sobram, quantas estão presas e há quanto tempo o banco subiu. Existe para a checagem de saúde ir por HTTP e não abrir conexão de sessão — vigiar não pode piorar o que se vigia.';

revoke all on function public.folga_do_banco() from public, anon;
grant execute on function public.folga_do_banco() to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
select public.folga_do_banco() as agora;
