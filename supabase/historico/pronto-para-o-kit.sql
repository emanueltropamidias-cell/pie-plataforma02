-- ============================================================================
-- ESTOU PRONTO PARA O KIT SAIR AMANHÃ?
-- ============================================================================
--
-- Só lê. Não altera nada. Rode antes de liberar o kit.
--
-- ── DUAS LIÇÕES QUE ESTE ARQUIVO JÁ CUSTOU ──────────────────────────────────
--
-- 1. A coluna do estado da conexão é `conexao`, e não `estado`. Escrevi de
--    memória, o 42703 derrubou o script inteiro, e o editor do Supabase roda
--    tudo em UMA transação — um erro no fim apaga até o que já tinha passado.
--
-- 2. O editor mostra só o resultado da ÚLTIMA consulta. Três `select`
--    separados viravam um resultado só, e os dois primeiros sumiam. Por isso
--    aqui é UM `union all`: tudo numa grade, nada perdido.
--
-- Todas as colunas são texto porque `union` exige tipo igual. É grade para
-- gente ler, não para máquina consumir.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OS NÚMEROS: QUAL ESTÁ VIVO, E QUAL SÓ PARECE VIVO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `ativo` é decisão nossa; `conexao` é o que a Evolution respondeu. Número com
-- ativo = true e conexao <> 'open' é o pior caso: o PIE distribui lead para ele
-- e o envio falha na mão da atendente.
select '1. NUMEROS'                       as bloco,
       n.apelido                          as item,
       n.instancia                        as detalhe,
       case when n.ativo then 'ativo' else 'desligado' end
         || ' · ' || n.conexao            as situacao,
       count(c.id)::text                  as quantidade
  from public.numeros n
  left join public.conversas c on c.numero_id = n.id
 group by n.id, n.apelido, n.instancia, n.ativo, n.conexao, n.ordem

union all

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. QUANTA GENTE O KIT ALCANÇA DE VERDADE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A trava nova exige `ultima_entrada_at` — a pessoa tem de ter ESCRITO.
--
-- Mas "escreveu alguma vez" não é "escreveu esta semana". Quem falou há três
-- meses e sumiu é contato frio: mandar mídia política para ele pesa no chip
-- quase como mandar para desconhecido.
--
-- A primeira linha é a que importa: é ela que diz quantas pessoas o kit pode
-- alcançar amanhã sem risco.
select '2. ALCANCE',
       case
         when c.ultima_entrada_at is null                       then 'd. nunca escreveu — kit BLOQUEADO'
         when c.ultima_entrada_at >= now() - interval '7 days'  then 'a. escreveu nos ultimos 7 dias'
         when c.ultima_entrada_at >= now() - interval '30 days' then 'b. entre 7 e 30 dias'
         else                                                        'c. mais de 30 dias — frio'
       end,
       '',
       '',
       count(*)::text
  from public.conversas c
 where c.tipo = 'lead'
 group by 2

union all

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A COLUNA DA JANELA CHEGOU A SER PREENCHIDA?
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Se `janela-24h.sql` nunca rodou, `ultima_entrada_at` está vazia para TODO
-- MUNDO — e aí a trava nova barra a operação inteira, não só os 400 manuais.
--
-- "com entrada" perto de zero com "mensagens recebidas" alto é exatamente esse
-- caso, e é o único achado aqui capaz de travar amanhã por inteiro.
select '3. JANELA',
       'conversas com ultima_entrada_at',
       'de ' || (select count(*) from public.conversas)::text || ' conversas',
       (select count(*) from public.mensagens where direcao = 'inbound')::text
         || ' mensagens recebidas na base',
       (select count(*) from public.conversas where ultima_entrada_at is not null)::text

 order by 1, 2;
