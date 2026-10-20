-- ============================================================================
-- OS PAPÉIS DO ATENDIMENTO — supervisor e atendente
-- ============================================================================
--
-- Rode DEPOIS de `crm.sql` e `trancar-base.sql`.
--
-- Hoje existem dois papéis de verdade: `admin` (as 7 contas da equipe, que veem
-- tudo) e `lideranca` (as 43 do portal, que veem a própria rede). Não há nada
-- entre os dois — e é justamente onde a atendente precisa ficar.
--
-- Ela precisa de MENOS que a equipe: nada de Lideranças, Rede, Tráfego,
-- Estratégia. A base de 29 mil pessoas não é ferramenta de atendimento; é o
-- ativo que a campanha inteira protege, e vazamento por ali não se desfaz.
--
-- E de MAIS que a liderança: as conversas, as mensagens, as etiquetas e o
-- roteiro — o material do turno dela.
--
-- ── TRÊS FUNÇÕES, TRÊS CÍRCULOS ─────────────────────────────────────────────
--
--   perfil_equipe()       admin e usuário interno. Vê a plataforma toda.
--   perfil_supervisao()   equipe MAIS supervisor. Manda no atendimento: monta o
--                         fluxo, cria etiqueta, define quem está de plantão.
--   perfil_atendimento()  supervisão MAIS atendente. Abre a caixa de entrada.
--   (liderança)           nenhuma delas. Só a própria sub-rede.
--
-- Os círculos são concêntricos: quem é da equipe supervisiona, quem
-- supervisiona atende. O contrário nunca — a atendente não monta o fluxo, e o
-- supervisor não abre a base de 29 mil.
--
-- POR QUE O SUPERVISOR NÃO VÊ A BASE. Ele manda no atendimento, não na
-- campanha. Quem coordena plantão precisa da fila, do roteiro e do painel —
-- não da lista de pessoas nem do gasto de tráfego. Menos gente com acesso à
-- base é menos superfície, e o cargo não perde nada com isso.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `perfil_equipe` passa a excluir o atendente
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sem esta linha o papel novo não protegeria nada: `atendente` não é
-- 'lideranca' e não tem vínculo com a rede, então passaria pela regra antiga
-- como se fosse da casa — e leria as 29 mil.

create or replace function public.perfil_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') not in ('lideranca', 'atendente', 'supervisor')
      and (
        p.role = 'admin'
        or not exists (select 1 from public.liderancas l where l.auth_uid = p.id)
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Quem pode atender
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.perfil_supervisao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') not in ('lideranca', 'atendente')
  );
$$;

create or replace function public.perfil_atendimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') <> 'lideranca'
  );
$$;

revoke all on function public.perfil_equipe() from public;
revoke all on function public.perfil_supervisao() from public;
revoke all on function public.perfil_atendimento() from public;
grant execute on function public.perfil_equipe() to authenticated;
grant execute on function public.perfil_supervisao() to authenticated;
grant execute on function public.perfil_atendimento() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As tabelas do atendimento abrem para o papel novo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só estas. `liderancas`, `demandas`, `metricas_trafego` e as demais continuam
-- em `perfil_equipe()` — a atendente não as alcança nem digitando o endereço.

do $$
declare
  t text;
  tabelas text[] := array[
    'conversas', 'mensagens', 'conversa_tags', 'atribuicoes'
  ];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists %I on public.%I', t || ' equipe', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.perfil_atendimento())
        with check (public.perfil_atendimento())
    $f$, t || ' equipe', t);
  end loop;
end $$;

-- Catálogo de etiquetas, roteiro e lista de atendentes: a atendente LÊ, o
-- SUPERVISOR escreve. Ela precisa ver as etiquetas para aplicar e o roteiro
-- para seguir — mas montar o fluxo e definir o plantão é decisão de quem
-- coordena, e é exatamente essa a fronteira do papel novo.
do $$
declare
  t text;
  tabelas text[] := array['tags', 'fluxos', 'fluxo_passos', 'atendentes'];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists %I on public.%I', t || ' equipe', t);
    execute format('drop policy if exists %I on public.%I', t || ' le', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (public.perfil_atendimento())
    $f$, t || ' le', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.perfil_supervisao())
        with check (public.perfil_supervisao())
    $f$, t || ' equipe', t);
  end loop;
end $$;

-- A atendente liga e desliga o próprio plantão sem ser da equipe. É o
-- interruptor que impede lead novo de cair em quem foi almoçar.
drop policy if exists "atendentes proprio" on public.atendentes;
create policy "atendentes proprio" on public.atendentes
  for update to authenticated
  using (id = auth.uid() or public.perfil_supervisao())
  with check (id = auth.uid() or public.perfil_supervisao());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A PROVA
-- ─────────────────────────────────────────────────────────────────────────────

select * from (
  select 1 as ordem, 'ATENDIMENTO (atendente alcanca)' as bloco,
         tablename as tabela, policyname as politica
  from pg_policies
  where schemaname = 'public' and qual like '%perfil_atendimento%'

  union all
  select 2, 'SO EQUIPE (atendente NAO alcanca)', tablename, policyname
  from pg_policies
  where schemaname = 'public' and qual like '%perfil_equipe%'

  union all
  select 3, 'PAPEIS EM USO', coalesce(role, '(sem papel)'), count(*)::text
  from public.profiles where status = 'ativo' group by role
) prova
order by ordem, tabela, politica;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Como criar uma atendente
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Ela se cadastra normalmente pela tela de login. Depois, a coordenação roda:
--
--   update public.profiles set role = 'atendente', status = 'ativo'
--    where email = 'rita@exemplo.com';
--
-- Para supervisor, mesma coisa com role = 'supervisor'. Ele vê a caixa, a
-- equipe de plantão, as etiquetas e o construtor de fluxo — e não vê
-- lideranças nem tráfego.
--
--   insert into public.atendentes (id, nome, disponivel, capacidade)
--   select id, 'Rita Santos', true, 20 from public.profiles
--    where email = 'rita@exemplo.com'
--   on conflict (id) do update set nome = excluded.nome;
