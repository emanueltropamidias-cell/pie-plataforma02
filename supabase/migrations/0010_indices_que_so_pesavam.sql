-- ============================================================================
-- SETE ÍNDICES QUE SÓ PESAVAM
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. NÃO apaga dado nenhum — índice é
-- atalho de leitura, e todo atalho aqui pode ser reconstruído (a receita está
-- no fim do arquivo).
--
-- ── POR QUE ÍNDICE A MAIS DEIXA A PLATAFORMA LENTA ──────────────────────────
--
-- Índice acelera leitura e ATRASA escrita: toda vez que uma linha é inserida ou
-- alterada, o Postgres tem de atualizar TODOS os índices daquela tabela.
--
-- `conversas` tinha 25 índices, e ela leva um `update` a cada mensagem que
-- chega — última mensagem, horário, contador. São milhares por dia, cada um
-- pagando 25 atualizações de índice. `mensagens` tinha 11 e recebe insert o dia
-- inteiro.
--
-- ── COMO FOI ESCOLHIDO O QUE SAI ────────────────────────────────────────────
--
-- Pelo contador do próprio Postgres (`pg_stat_user_indexes.idx_scan`), que é
-- cumulativo desde sempre. Nada de palpite. Só saem os que são REDUNDANTES —
-- outro índice já responde a mesma pergunta — ou que NUNCA foram usados.
--
-- Os que ficaram de fora de propósito, por serem julgamento e não fato:
-- `conversas_a_cadastrar` (3 usos), `conversas_por_chegada` (16),
-- `conversas_status` (17). Pouco usados não é o mesmo que redundantes; a tela
-- que depende deles pode ser rara e importante.

-- ─────────────────────────────────────────────────────────────────────────────
-- MENSAGENS — a tabela que mais recebe escrita
-- ─────────────────────────────────────────────────────────────────────────────

-- btree(wa_id) WHERE wa_id IS NOT NULL — 6.965 usos, 4,3 MB.
-- `mensagens_wa_id_key` é ÚNICO na mesma coluna e tem 107.196 usos. Um índice
-- único em `wa_id` responde tudo que o parcial responde: `where wa_id = x` já
-- exclui nulo sozinho. Eram dois índices sendo atualizados a cada mensagem para
-- responder a mesma pergunta.
drop index concurrently if exists public.mensagens_por_wa_id;

-- btree(conversa_id, momento) — 22.401 usos, 2,5 MB.
-- `mensagens_por_conversa_e_momento` é btree(conversa_id, momento DESC) com
-- 133.458 usos. Btree se lê nos dois sentidos: o índice DESC atende
-- `order by momento` andando de trás para frente, sem custo. O par ASC/DESC da
-- mesma coluna é duplicata que não parece duplicata.
drop index concurrently if exists public.mensagens_conversa;

-- btree(conversa_id) WHERE midia_arquivo IS NOT NULL — ZERO usos.
-- Nenhuma tela nunca pediu "as mensagens com mídia desta conversa". Quem abre a
-- conversa pede TODAS as mensagens, e aí o índice de conversa_id atende.
drop index concurrently if exists public.mensagens_com_midia;

-- ─────────────────────────────────────────────────────────────────────────────
-- CONVERSAS — a tabela que mais recebe `update`
-- ─────────────────────────────────────────────────────────────────────────────

-- btree(ultima_entrada_at DESC) WHERE encerrada_em IS NULL — ZERO usos, 1,3 MB.
-- O maior índice morto do banco.
drop index concurrently if exists public.conversas_janela;

-- btree(telefone) — 3 usos, 368 kB.
-- `conversas_por_telefone` é btree(telefone), idêntico, com 27.283 usos. E
-- ainda existe `conversas_telefone_numero`, único em (telefone, numero_id), com
-- 112.359 usos — que atende `where telefone = x` pelo prefixo. Três índices
-- para a mesma coluna; sai o que ninguém escolhe.
drop index concurrently if exists public.conversas_telefone;

-- btree(primeira_msg_at) WHERE primeira_resp_at IS NULL AND tipo = 'lead' —
-- ZERO usos. A conta de "quem ficou sem resposta" é feita por agregação na
-- tabela inteira, não por busca — e por isso este índice nunca foi escolhido.
drop index concurrently if exists public.conversas_sem_resposta;

-- btree(municipio) WHERE municipio IS NOT NULL — 651 usos.
-- `conversas_municipio` é btree(municipio) sem filtro, com 671 usos: responde
-- tudo que o parcial responde E também `where municipio is null`. O parcial é o
-- subconjunto, então é ele que sai.
drop index concurrently if exists public.conversas_por_municipio;

-- ─────────────────────────────────────────────────────────────────────────────
-- SE ALGUMA TELA FICAR LENTA, A VOLTA É ESTA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Descomente só a linha do índice em questão e rode este arquivo de novo.
-- `concurrently` nos dois sentidos: criar sem travar, apagar sem travar.
--
-- create index concurrently if not exists mensagens_por_wa_id
--   on public.mensagens (wa_id) where wa_id is not null;
-- create index concurrently if not exists mensagens_conversa
--   on public.mensagens (conversa_id, momento);
-- create index concurrently if not exists mensagens_com_midia
--   on public.mensagens (conversa_id) where midia_arquivo is not null;
-- create index concurrently if not exists conversas_janela
--   on public.conversas (ultima_entrada_at desc) where encerrada_em is null;
-- create index concurrently if not exists conversas_telefone
--   on public.conversas (telefone);
-- create index concurrently if not exists conversas_sem_resposta
--   on public.conversas (primeira_msg_at) where primeira_resp_at is null and tipo = 'lead';
-- create index concurrently if not exists conversas_por_municipio
--   on public.conversas (municipio) where municipio is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
select relname as tabela, count(*) as indices,
       pg_size_pretty(sum(pg_relation_size(indexrelid))) as tamanho_dos_indices
  from pg_stat_user_indexes
 where schemaname = 'public' and relname in ('conversas', 'mensagens')
 group by relname;
