-- ============================================================================
-- FAXINA AUTOMÁTICA, DE HORA EM HORA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- O Postgres nunca altera linha no lugar: todo `update` escreve uma nova e
-- marca a velha como morta. As mortas ficam ocupando espaço, e a mesma consulta
-- passa a ler mais páginas para achar o mesmo dado.
--
-- `conversas` leva um `update` a cada mensagem que chega — última mensagem,
-- horário, contador. São milhares por dia, e cada um deixa uma linha morta.
--
-- ── A PRIMEIRA VERSÃO DISTO ESTAVA ERRADA, E O ERRO IMPORTA ─────────────────
--
-- Eu escrevi uma função `faxina_do_banco()` que olhava quais tabelas estavam
-- sujas e limpava só aquelas. Ela nunca poderia funcionar:
--
--     VACUUM cannot be executed from a function
--
-- `vacuum` não roda dentro de transação, e TODO corpo de função é uma
-- transação. Não era o meu teste que estava no lugar errado — era a função.
-- Chamada pelo agendador ela falharia igual, e falharia CALADA, dentro do log
-- do cron que ninguém abre. A plataforma ficaria suja com uma faxina agendada
-- no painel dizendo que estava tudo certo.
--
-- Então a adaptação some e o trabalho se divide em dois, cada um na camada que
-- consegue fazê-lo.
--
-- ── CAMADA 1: O AUTOVACUUM PASSA A ACORDAR CEDO ─────────────────────────────
--
-- O Postgres já limpa sozinho, o problema é QUANDO. O padrão é esperar 20% da
-- tabela virar lixo. Em `conversas`, 20% de 10.707 são 2.141 linhas mortas
-- acumuladas antes de ele se mexer — e até lá toda leitura paga por elas.
--
-- Baixando para 2% + 200 linhas, ele acorda com ~414. Isso é adaptação DE
-- VERDADE: contínua, sem agendamento, e com freio de custo embutido para não
-- afogar a máquina Nano.
--
-- Para `mensagens` o que importa é outro número. Ela quase não recebe `update`
-- — ela CRESCE. E é o mapa de visibilidade, que só o vacuum atualiza, que
-- permite a `supervisao_janelas()` contar 71 mil linhas pelo índice (307 ms) em
-- vez de varrer 330 MB (2.228 ms). Por isso o ajuste dela é o de INSERÇÃO: a
-- cada ~2 mil mensagens novas, o mapa se atualiza.
--
-- ── CAMADA 2: A HORA CERTA, PELO pg_cron ────────────────────────────────────
--
-- O autovacuum é ótimo e pode ser adiado: ele tem um número limitado de
-- trabalhadores e cede a vez quando a máquina aperta. O `pg_cron` é a garantia
-- de que, aconteça o que acontecer, de hora em hora aquilo passa.
--
-- Aqui o `vacuum` funciona porque o agendador executa o comando no topo, e não
-- de dentro de função — é a mesma razão que derrubou a versão anterior, vista
-- do outro lado.
--
-- Uma tabela por tarefa, porque dois comandos na mesma vão juntos numa
-- transação implícita, e aí o `vacuum` volta a ser proibido.
--
-- ── E CUSTA QUANTO ──────────────────────────────────────────────────────────
--
-- Medido hoje, com a base suja desde o restart:
--
--     mensagens ....... 16.732 ms      conversa_tags ...... 243 ms
--     conversas ........ 1.333 ms      numeros ............. 97 ms
--     liderancas ......... 898 ms
--
-- E esse é o caso RUIM. O vacuum pula as páginas que já estão marcadas como
-- limpas, então a passagem seguinte só olha o que mudou desde a anterior — em
-- uma hora, algumas centenas de linhas. O preço de manter limpo é uma fração
-- do preço de limpar depois de sujo.

create extension if not exists pg_cron;

-- ─────────────────────────────────────────────────────────────────────────────
-- A FUNÇÃO QUEBRADA SAI
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Nome bom para função que não funciona é armadilha: daqui a três meses alguém
-- a encontra no banco, chama, e recebe um erro que não explica nada.
select cron.unschedule('faxina-do-banco')
 where exists (select 1 from cron.job where jobname = 'faxina-do-banco');

drop function if exists public.faxina_do_banco();

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMADA 1 — O AUTOVACUUM ACORDA CEDO NAS TABELAS QUENTES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só nestas. Tabela parada com o padrão de fábrica está certa do jeito que
-- está, e mexer no que não incomoda é criar diferença para explicar depois.

-- Um `update` por mensagem recebida. É a mais suja da base, de longe.
alter table public.conversas set (
  autovacuum_vacuum_scale_factor  = 0.02,
  autovacuum_vacuum_threshold     = 200,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold    = 200
);

-- Cresce, quase não muda. O que interessa é o mapa de visibilidade em dia, para
-- a contagem da supervisão continuar saindo pelo índice.
alter table public.mensagens set (
  autovacuum_vacuum_insert_scale_factor = 0.02,
  autovacuum_vacuum_insert_threshold    = 2000,
  autovacuum_analyze_scale_factor       = 0.02,
  autovacuum_analyze_threshold          = 500
);

-- Marcar e desmarcar etiqueta é `insert` e `delete` o dia inteiro.
alter table public.conversa_tags set (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 200,
  autovacuum_analyze_scale_factor = 0.05
);

-- Cresce devagar e recebe `update` de sobra: município, etiqueta, indicação. É
-- o caso clássico em que o autovacuum padrão passa DIAS sem acordar.
alter table public.liderancas set (
  autovacuum_vacuum_scale_factor  = 0.05,
  autovacuum_vacuum_threshold     = 200,
  autovacuum_analyze_scale_factor = 0.05
);

-- Dezoito linhas que recebem escrita de estado de conexão. Dezoito linhas
-- mortas já são 100% da tabela — e o padrão de 20% nunca a alcança com o
-- mínimo de 50 linhas que ele também exige.
alter table public.numeros set (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold    = 20
);

-- ─────────────────────────────────────────────────────────────────────────────
-- CAMADA 2 — A PASSAGEM DE HORA EM HORA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Minutos espalhados, e nenhum no zero: a hora cheia é quando a plataforma tem
-- mais gente entrando e mais tarefa automática do Supabase rodando. Espalhar
-- também evita que cinco faxinas disputem a mesma máquina ao mesmo tempo.
--
-- `unschedule` antes de cada uma: `schedule` com o mesmo nome atualiza, mas em
-- versão antiga duplica — e duas faxinas na mesma tabela ficam uma esperando a
-- outra, segurando conexão do mesmo bolo de 60 que a equipe usa.
select cron.unschedule(jobname)
  from cron.job
 where jobname in ('faxina-conversas','faxina-conversa-tags','faxina-liderancas',
                   'faxina-numeros','faxina-mensagens');

select cron.schedule('faxina-conversas',     '10 * * * *', 'vacuum (analyze) public.conversas');
select cron.schedule('faxina-conversa-tags', '15 * * * *', 'vacuum (analyze) public.conversa_tags');
select cron.schedule('faxina-liderancas',    '20 * * * *', 'vacuum (analyze) public.liderancas');
select cron.schedule('faxina-numeros',       '25 * * * *', 'vacuum (analyze) public.numeros');

-- A cara por último e sozinha no fim da hora, longe das outras quatro.
select cron.schedule('faxina-mensagens',     '40 * * * *', 'vacuum (analyze) public.mensagens');

-- ─────────────────────────────────────────────────────────────────────────────
-- OLHAR SE A FAXINA ESTÁ ACONTECENDO, SEM GASTAR CONEXÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Irmã de `folga_do_banco()` (migração 0017) e pela mesma razão: conferir tem
-- de ir por HTTP, senão a checagem tira conexão do bolo que a equipe divide.
--
-- Esta é de LEITURA. Ela não limpa nada — é justamente por não tentar limpar
-- que ela pode existir como função.
create or replace function public.lixo_do_banco()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select jsonb_build_object(
    'tabelas', (
      select coalesce(jsonb_agg(t order by t->>'mortas' desc), '[]'::jsonb)
        from (
          select jsonb_build_object(
                   'tabela',  relname,
                   'vivas',   n_live_tup,
                   'mortas',  n_dead_tup,
                   'pct',     round(100.0*n_dead_tup/nullif(n_live_tup+n_dead_tup,0),1),
                   'limpeza', greatest(last_vacuum, last_autovacuum)
                 ) as t
            from pg_stat_user_tables
           where schemaname = 'public' and n_dead_tup > 0
           order by n_dead_tup desc
           limit 10
        ) s
    ),
    -- As últimas passagens do agendador. `status` vem 'succeeded' ou 'failed' —
    -- foi a falha calada dentro desta tabela que a versão anterior teria
    -- produzido para sempre.
    'ultimas_faxinas', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'tarefa',  j.jobname,
               'quando',  d.start_time,
               'status',  d.status,
               'levou_s', round(extract(epoch from (d.end_time - d.start_time))::numeric, 1)
             ) order by d.start_time desc), '[]'::jsonb)
        from (select * from cron.job_run_details order by start_time desc limit 10) d
        join cron.job j on j.jobid = d.jobid
    ),
    -- ── DUAS FALHAS DIFERENTES, E CONFUNDI-LAS DÁ ALARME FALSO ──────────────
    --
    -- Medido em 12/09: das duas primeiras passagens, uma saiu
    -- `succeeded / VACUUM / 0,62s` e a outra `failed / job startup timeout`,
    -- em 10,67s — que é o teto de 10 segundos que o pg_cron dá para a tarefa
    -- conseguir CONEXÃO antes de desistir.
    --
    -- A segunda não é faxina quebrada: é a máquina Nano com o pool apertado, a
    -- tarefa não achou vaga e nem chegou a começar. Some sozinha na hora
    -- seguinte, e a camada do autovacuum cobre o buraco — ela roda por
    -- trabalhador interno do Postgres e não disputa o pool com ninguém.
    --
    -- `vacuum` que COMEÇOU e falhou é outra história, e essa sim é defeito.
    'nao_largou_24h', (
      select count(*) from cron.job_run_details
       where status <> 'succeeded'
         and return_message like '%startup timeout%'
         and start_time > now() - interval '24 hours'
    ),
    'falhas_24h', (
      select count(*) from cron.job_run_details
       where status <> 'succeeded'
         and coalesce(return_message,'') not like '%startup timeout%'
         and start_time > now() - interval '24 hours'
    )
  );
$function$;

comment on function public.lixo_do_banco is
  'Quanto lixo cada tabela tem e se as faxinas agendadas estão passando. Leitura pura, por HTTP — vigiar não pode tirar conexão de quem está atendendo. Ver folga_do_banco() na 0017.';

revoke all on function public.lixo_do_banco() from public, anon;
grant execute on function public.lixo_do_banco() to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- A faxina em si NÃO é chamada aqui: `vacuum` não roda dentro de transação, e
-- este arquivo roda inteiro numa só. Para limpar na mão, agora:
--
--     node scripts/faxina.mjs
--
select jobname, schedule, active, command
  from cron.job
 where jobname like 'faxina-%'
 order by jobname;

select relname as tabela, reloptions as ajustes
  from pg_class
 where relnamespace = 'public'::regnamespace
   and reloptions is not null
 order by relname;

select public.lixo_do_banco() as agora;
