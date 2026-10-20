-- ============================================================================
-- O ÍNDICE DE "SEM RESPOSTA" VOLTA — E COM O FORMATO CERTO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- "A caixa das meninas não voltou, demora muito para recarregar."
--
-- A caixa dispara seis consultas ao abrir. Cronometradas:
--
--     conversas da atendente ......  40 ms
--     a lista de 400 ..............  37 ms
--     contagem de SEM RESPOSTA .... 800 ms    <- vinte vezes as outras
--
-- ── A CAUSA, E ELA É MINHA ──────────────────────────────────────────────────
--
-- Na limpeza de índices eu apaguei `conversas_sem_resposta` porque o contador
-- do Postgres marcava ZERO usos.
--
-- O contador não mentiu — o índice não servia mesmo. Ele era
-- `(primeira_msg_at) where primeira_resp_at is null and tipo = 'lead'`, e a
-- consulta da caixa filtra por `primeira_resp_at is null and encerrada_em is
-- null`. O `encerrada_em` não estava no índice, então o Postgres nunca o
-- escolhia.
--
-- O erro foi meu no raciocínio, não na medição: eu li "zero usos" como "não
-- serve" e apaguei, quando o certo era perguntar POR QUE não estava sendo
-- usado. A resposta era que ele tinha o formato errado — e a consulta cara
-- continuou cara, agora sem nem a esperança de um índice.
--
-- Com a base em 10.682 conversas, essa conta passou a pesar 800 ms em CADA
-- abertura de caixa, de CADA uma das 18 atendentes.
--
-- ── O ÍNDICE CERTO ──────────────────────────────────────────────────────────
--
-- Parcial sobre as duas condições que a consulta usa de verdade. Ele cobre
-- pouca linha — só o que está aberto e sem resposta — então é pequeno e a
-- contagem vira leitura de índice.
--
-- `concurrently` porque a caixa está aberta agora: criar índice do jeito comum
-- tranca a tabela contra escrita, e escrita em `conversas` é mensagem de
-- eleitor entrando.
drop index concurrently if exists public.conversas_sem_resposta;

create index concurrently if not exists conversas_sem_resposta
  on public.conversas (ultima_msg_at desc)
  where primeira_resp_at is null and encerrada_em is null;

comment on index public.conversas_sem_resposta is
  'Quem escreveu e ainda não foi respondido, em aberto. É a conta mais cara da caixa: 800 ms sem ele, em cada abertura de cada atendente. A ordem por ultima_msg_at serve também à lista, que ordena assim.';
