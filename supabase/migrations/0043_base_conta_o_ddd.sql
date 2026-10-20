-- ============================================================================
-- O CARTÃO DA BASE PASSA A DIZER O QUE SE SABE, E NÃO SÓ O QUE FALTA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca uma função de leitura.
--
-- ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
--
-- 28/09, Emanuel, duas vezes: "porque aparece 0 completos Bahia, pq?"
--
-- Ele acabara de puxar a agenda do celular do Pedro — 704 pessoas, todas com
-- nome, 681 com DDD baiano. E o cartão dizia:
--
--     0 completos na Bahia · 704 sem município · 0 só o número
--
-- Nada ali está errado. "Completo" quer dizer nome + telefone + CIDADE DA
-- BAHIA, e agenda de WhatsApp não guarda cidade: guarda nome e número. Então
-- os 704 caem em `local = 'vazio'` e o primeiro número é zero.
--
-- Mas um cartão que abre com "0" e segue com "704 sem" descreve uma base
-- inteiramente pelo que ela NÃO tem. Quem lê conclui que a importação falhou —
-- e ele concluiu, duas vezes.
--
-- ── O QUE SE SABE MESMO SEM CIDADE ──────────────────────────────────────────
--
-- O DDD. Ele não é prova de residência — a pessoa muda de estado e leva o
-- número — mas é informação de verdade, e é a única que uma agenda entrega.
-- 681 dos 704 têm DDD baiano; dizer isso é mais honesto do que dizer zero.
--
-- Por isso `ddd_bahia` entra na contagem, SEPARADO de `completos`. Não é o
-- mesmo fato e não pode virar o mesmo número: um é cidade declarada pela
-- pessoa, o outro é o prefixo do telefone dela. Juntá-los faria a base parecer
-- mapeada quando não está.
--
-- A cidade continua nula. Preencher município a partir do DDD seria inventar
-- dado — 71 cobre Salvador e mais uma dúzia de municípios da região.

create or replace function public.base_externa_contar(p_base uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pessoas',       count(*) filter (where telefone is not null),
    'completos',     count(*) filter (where telefone is not null and nome is not null and local = 'bahia'),
    'sem_municipio', count(*) filter (where telefone is not null and nome is not null and local in ('vazio', 'a_corrigir')),
    'a_corrigir',    count(*) filter (where telefone is not null and nome is not null and local = 'a_corrigir'),
    'so_numero',     count(*) filter (where telefone is not null and nome is null),
    'outro_estado',  count(*) filter (where telefone is not null and nome is not null and local = 'outro_estado'),
    'sem_telefone',  count(*) filter (where telefone is null),
    -- ── O DDD, que vale quando a cidade não existe ──────────────────────────
    --
    -- `telefone` aqui está sempre sem o 55 (é o que `base_externa_gravar`
    -- aceita: 10 ou 11 dígitos), então os dois primeiros dígitos SÃO o DDD.
    -- Nenhum `substring` esperto é preciso, e nenhum deve ser usado: no dia em
    -- que um telefone entrar com o 55 na frente, o certo é a gravação recusar,
    -- não esta conta adivinhar.
    'ddd_bahia',     count(*) filter (where telefone is not null
                                        and left(telefone, 2) in ('71','73','74','75','77')),
    'ddd_fora',      count(*) filter (where telefone is not null
                                        and left(telefone, 2) not in ('71','73','74','75','77'))
  )
  from bases_externas_pessoas where base_id = p_base
$$;

comment on function public.base_externa_contar is
  'Os números de um cartão de base. `completos` conta cidade DECLARADA da Bahia; `ddd_bahia` conta o prefixo do telefone. São fatos diferentes e ficam em campos diferentes de propósito: base vinda de agenda de WhatsApp não tem cidade nenhuma, e sem o DDD o cartão dela só saberia dizer zero.';

revoke all on function public.base_externa_contar(uuid) from public, anon, authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
-- A base do Pedro é o caso que trouxe isto à tona: 0 completos e 681 com DDD
-- baiano. Se `ddd_bahia` vier zero também, a conta está errada.
select b.nome,
       (public.base_externa_contar(b.id) ->> 'pessoas')::int   as pessoas,
       (public.base_externa_contar(b.id) ->> 'completos')::int as completos,
       (public.base_externa_contar(b.id) ->> 'ddd_bahia')::int as ddd_bahia,
       (public.base_externa_contar(b.id) ->> 'ddd_fora')::int  as ddd_fora
  from bases_externas b order by b.criada_em;
