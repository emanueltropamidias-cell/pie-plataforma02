-- ============================================================================
-- TODA ATENDENTE DENTRO DO SETOR GERAL
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── PARA QUE SERVE ──────────────────────────────────────────────────────────
--
-- As contas criadas ANTES de hoje gravaram só duas linhas: o perfil e a de
-- atendente. Faltou a de membro do departamento.
--
-- Quem tem conta assim consegue entrar, ver a fila e puxar lead normalmente —
-- por isso o problema passa despercebido. O que ela NÃO consegue é aparecer na
-- lista de "transferir para uma pessoa". A colega abre o menu, não acha o nome,
-- e conclui que ela ainda não tem acesso.
--
-- Daqui para frente a rota de criar conta já grava as três. Este arquivo é para
-- quem ficou para trás.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. QUEM ESTÁ DE FORA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Olhe antes de mexer. Se vier vazio, não há nada a fazer.
select a.nome, p.email, p.role
  from public.atendentes a
  left join public.profiles p on p.id = a.id
 where not exists (
   select 1 from public.departamento_membros m where m.atendente_id = a.id
 )
 order by a.nome;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. COLOCAR TODAS NO SETOR PADRÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `on conflict do nothing` para quem já está dentro: rodar de novo não duplica
-- nem derruba nada.
insert into public.departamento_membros (departamento_id, atendente_id)
select d.id, a.id
  from public.atendentes a
 cross join (
   select id from public.departamentos
    where padrao and ativo
    order by ordem
    limit 1
 ) d
on conflict (departamento_id, atendente_id) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A CHAVE DO PLANTÃO LIGADA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O plantão saiu — a chave não distribui mais conversa nenhuma. Ela só alimenta
-- a bolinha verde da supervisão e o alerta da central. Com todo mundo desligado,
-- a central acusa problema com a equipe inteira trabalhando.
update public.atendentes set disponivel = true where disponivel is not true;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Uma linha por atendente, e `no_geral` tem de ser `true` em todas.
select
  a.nome,
  p.email,
  p.role                                          as papel,
  a.disponivel,
  exists (
    select 1 from public.departamento_membros m
     where m.atendente_id = a.id
  )                                               as no_geral
  from public.atendentes a
  left join public.profiles p on p.id = a.id
 order by a.nome;
