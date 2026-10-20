-- ============================================================================
-- ÍNDICE SOBRE O TELEFONE CANÔNICO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria índice.
-- RODAR TAMBÉM NA INSTALAÇÃO DO MANASSÉS.
--
-- ── POR QUE ─────────────────────────────────────────────────────────────────
--
-- `fone_canonico()` é a regra única de telefone da plataforma: tira pontuação,
-- tira o 55 e acrescenta o nono dígito. Toda comparação de pessoa passa por
-- ela, porque as colunas guardam telefone em quatro formatos diferentes e
-- comparar cru já errou por 7.171 pessoas uma vez.
--
-- O custo estava escondido. Medido em 29/09, em `bases_externas_pessoas`:
--
--   só ler a tabela ......... 75 ms
--   + fone_canonico ....... 4.285 ms
--
-- São 57 vezes mais caro, e o motivo é simples: a função roda uma vez por
-- linha, com três expressões regulares dentro. Em 58 mil linhas isso é meio
-- milhão de regexes.
--
-- Isso estourou o teto de 8 segundos da sessão `authenticated` quando a
-- exportação de todas as bases juntou tudo: 13,2 s.
--
-- ── POR QUE DÁ PARA INDEXAR ─────────────────────────────────────────────────
--
-- `fone_canonico` é IMMUTABLE — mesma entrada, mesma saída, sempre. É o que o
-- Postgres exige para guardar o RESULTADO dela num índice. Se um dia a regra
-- do nono dígito mudar, estes índices precisam ser recriados, e é por isso que
-- este comentário existe.
--
-- ── E POR QUE NAS TRÊS TABELAS ──────────────────────────────────────────────
--
-- Porque o cruzamento de gente sempre envolve as três: quem está na base
-- externa, quem tem ficha, e quem conversou. Indexar uma e deixar as outras
-- deixaria a consulta rápida na metade e lenta na outra — que é o mesmo que
-- lenta.

create index if not exists bases_externas_pessoas_fone_canonico
  on public.bases_externas_pessoas (public.fone_canonico(telefone))
  where telefone is not null;

create index if not exists liderancas_fone_canonico
  on public.liderancas (public.fone_canonico(telefone))
  where telefone is not null;

-- Em `conversas` fica de fora quem veio sem número de verdade (`lid.*`): são
-- 545 linhas que nunca casam com nada e só engordariam o índice.
create index if not exists conversas_fone_canonico
  on public.conversas (public.fone_canonico(telefone))
  where telefone is not null and telefone not like 'lid.%';

analyze public.bases_externas_pessoas;
analyze public.liderancas;
analyze public.conversas;

-- ── conferência ─────────────────────────────────────────────────────────────
select indexname, tablename
  from pg_indexes
 where schemaname = 'public' and indexname like '%fone_canonico'
 order by tablename;
