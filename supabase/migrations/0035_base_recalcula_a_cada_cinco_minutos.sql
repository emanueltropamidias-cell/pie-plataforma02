-- ============================================================================
-- A BASE PRÉ-CALCULADA DEIXA DE SER DE MINUTO EM MINUTO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca um horário.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- 17/09, tela de Métricas, para a coordenação:
--
--     canceling statement due to statement timeout
--
-- E os quatro números grandes zerados, com o gráfico embaixo funcionando. Ou
-- seja: parte da tela respondia e parte estourava o tempo.
--
-- ── A MEDIÇÃO ───────────────────────────────────────────────────────────────
--
-- `metricas_atendimento` sozinha leva 0,7s como dono e 1,1s pela conta logada,
-- com a segurança por linha ligada. Nada perto de estourar.
--
-- Mas `atualizar_base_cache` roda de MINUTO EM MINUTO e reconstrói duas tabelas
-- materializadas. Medido em `pg_stat_statements`:
--
--     3.236 execuções · 7.027 segundos no total · quase DUAS HORAS de banco
--     nas últimas 3h: 180 execuções, média 3,56s, pior caso 8,94s
--
-- O teto de quem está logado é 8 segundos (`statement_timeout` do papel
-- `authenticated`). O pior caso do recálculo é 8,94. Os dois se encostam: a
-- métrica que pediria 1,1s espera a CPU que está reconstruindo a base e
-- atravessa o teto.
--
-- Três segundos e meio a cada sessenta é 6% da máquina gastos o tempo todo em
-- recalcular o que quase ninguém está olhando naquele segundo.
--
-- ── O QUE MUDA, E O QUE SE PERDE ────────────────────────────────────────────
--
-- Passa a rodar a cada CINCO minutos. O custo cai para 1,2% da máquina.
--
-- O que se perde: a Base pode mostrar um número com até cinco minutos de
-- atraso, em vez de um. Quem cadastra alguém e corre para a tela de Base pode
-- não se ver ali na hora.
--
-- Isto CONTRARIA de propósito a decisão da migração 0031, que existia para
-- recalcular "no minuto seguinte a qualquer cadastro". A intenção era boa e o
-- preço só apareceu depois, medido: um número cinco minutos velho é um
-- desconforto; a tela de Métricas fora do ar é trabalho parado.
--
-- A função continua conferindo antes: se nada mudou e faz menos de 10 minutos,
-- ela nem recalcula. E `atualizar_base_cache(true)` força na hora, para quem
-- precisar do número fresco depois de um cadastro.
--
-- ── O QUE ESTE ARQUIVO NÃO RESOLVE ──────────────────────────────────────────
--
-- Não PROVEI que a disputa por CPU foi a causa do timeout de hoje — provei que
-- os dois números se encostam e que a conta é cara. Se a tela estourar de novo
-- depois disto, a causa é outra e a investigação recomeça.

select cron.unschedule('base-pre-calculada')
 where exists (select 1 from cron.job where jobname = 'base-pre-calculada');

select cron.schedule('base-pre-calculada', '*/5 * * * *',
                     'select public.atualizar_base_cache(false)');

-- ── conferência ─────────────────────────────────────────────────────────────
select jobname, schedule, active from cron.job order by jobname;
