-- Quantas pessoas Lutiane e Maiana cadastraram HOJE (fuso America/Bahia).
--
-- Duas camadas, porque elas NÃO dão o mesmo número — e a diferença não é bug,
-- é o que cada uma significa:
--
--   liderancas.created_at  = pessoa que NASCEU na base hoje.
--   conversas.cadastrado_em = trabalho de cadastro feito hoje.
--
-- `cadastrar_manual` faz UPDATE quando o telefone já existe (a pessoa já tinha
-- escrito antes). Nesse caso `liderancas.created_at` continua a data antiga, e
-- só a conversa recebe o carimbo de hoje. Contar por `liderancas` SUBCONTA o
-- trabalho delas. A métrica do PIE conta por `conversas.cadastrado_por`.

with elas as (
  select id, nome
    from public.profiles
   where nome ilike '%lutiane%' or nome ilike '%maiana%'
),
hoje as (
  select date_trunc('day', now() at time zone 'America/Bahia')
           at time zone 'America/Bahia' as inicio
)

-- ── CAMADA 1: o que a métrica do PIE mostra ────────────────────────────────
select 'conversas (métrica do PIE)' as camada,
       e.nome,
       count(*) as pessoas
  from public.conversas c
  join elas e on e.id = c.cadastrado_por
  cross join hoje h
 where c.cadastrado_em >= h.inicio
 group by e.nome

union all

-- ── CAMADA 2: pessoas novas de verdade na base ─────────────────────────────
select 'liderancas (nasceram hoje)',
       e.nome,
       count(*)
  from public.liderancas l
  join elas e on e.id = l.cadastrado_por
  cross join hoje h
 where l.created_at >= h.inicio
 group by e.nome

union all

-- ── CAMADA 3: as que já existiam e elas cadastraram hoje ───────────────────
-- (a diferença entre as duas de cima; é aqui que mora a subcontagem)
select 'já existiam, cadastradas hoje',
       e.nome,
       count(*)
  from public.conversas c
  join elas e on e.id = c.cadastrado_por
  join public.liderancas l on l.id = c.lideranca_id
  cross join hoje h
 where c.cadastrado_em >= h.inicio
   and l.created_at < h.inicio
 group by e.nome

 order by 1, 2;
