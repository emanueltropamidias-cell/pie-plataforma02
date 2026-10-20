-- ============================================================================
-- RLS — a última defesa do banco
-- ============================================================================
--
-- POR QUE ISTO EXISTE. A chave anônima do Supabase é pública por natureza: ela
-- viaja no navegador de quem abre a plataforma, e qualquer pessoa consegue lê-la
-- no código-fonte da página. Ela não é um segredo e nunca foi. O que impede
-- alguém de pegar essa chave e conversar direto com a API do banco, pulando a
-- plataforma inteira, é só uma coisa: a RLS de cada tabela.
--
-- As tabelas com dado pessoal — liderancas à frente de todas, com nome,
-- telefone e município de milhares de pessoas — foram criadas direto no painel
-- e nunca passaram por migração. Se alguma estiver com RLS desligada, ela está
-- aberta. Este arquivo fecha e, mais importante, deixa a regra VERSIONADA: para
-- de depender de alguém lembrar de conferir um botão no painel.
--
-- ----------------------------------------------------------------------------
-- COMO APLICAR, e por favor leia antes
-- ----------------------------------------------------------------------------
--
-- Supabase > SQL Editor > cole este arquivo > Run.
--
-- Ligar RLS com política errada DERRUBA a plataforma para quem está usando —
-- e há gente usando de verdade. Então:
--
--   1. Rode primeiro o bloco de CONFERÊNCIA no fim do arquivo. Ele não altera
--      nada e mostra quais tabelas estão hoje sem RLS.
--   2. Rode este arquivo.
--   3. Teste, nesta ordem, com uma conta comum (não admin):
--         entrar na plataforma · abrir Território · abrir CRM ·
--         cadastrar uma liderança · abrir Demandas
--      Se qualquer tela ficar vazia, é política faltando: o bloco de socorro
--      no fim desliga tudo e devolve o estado anterior.
--
-- A SERVICE_ROLE_KEY ignora RLS por definição. O webhook do WhatsApp e a
-- importação de CSV continuam funcionando sem alteração nenhuma.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Os dois porteiros
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER de propósito. A política de `liderancas` precisa consultar
-- `profiles` para saber se a pessoa está ativa; se essa consulta passasse pela
-- RLS de profiles, que por sua vez consulta profiles, o Postgres entraria em
-- recursão infinita e derrubaria toda consulta. Rodando como dono, a função lê
-- a tabela por baixo da RLS e devolve só um sim ou não.
--
-- `set search_path` fixo não é enfeite: sem ele, quem controlasse o search_path
-- da sessão poderia criar um `profiles` falso num schema à frente e fazer a
-- função responder o que quisesse.

create or replace function public.perfil_ativo()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'ativo'
  );
$$;

create or replace function public.perfil_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'ativo'
  );
$$;

revoke all on function public.perfil_ativo() from public;
revoke all on function public.perfil_admin() from public;
grant execute on function public.perfil_ativo() to authenticated;
grant execute on function public.perfil_admin() to authenticated;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. profiles — quem é quem
-- ─────────────────────────────────────────────────────────────────────────────
-- Leitura liberada entre a equipe ativa porque a tela de Conversas mostra o
-- nome de quem registrou cada atendimento; sem isso a coluna fica vazia. Quem
-- ainda está pendente enxerga apenas a própria linha — precisa disso para a
-- tela de "aguardando aprovação" funcionar.

alter table public.profiles enable row level security;

drop policy if exists "profiles leitura" on public.profiles;
create policy "profiles leitura" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.perfil_ativo());

-- O upsert que a tela /pendente faz ao criar a conta. Só a própria linha.
drop policy if exists "profiles cria a propria linha" on public.profiles;
create policy "profiles cria a propria linha" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles atualizacao" on public.profiles;
create policy "profiles atualizacao" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.perfil_admin())
  with check (id = auth.uid() or public.perfil_admin());

-- A TRAVA QUE A RLS SOZINHA NÃO DÁ.
--
-- A política acima deixa a pessoa editar a própria linha — e precisa deixar,
-- senão ninguém cria a conta. Só que `role` e `status` moram nessa mesma linha:
-- sem esta trava, qualquer usuário pendente rodaria um update em si mesmo
-- virando admin ativo, e entraria na plataforma inteira sem ninguém aprovar.
--
-- RLS não resolve isso porque `with check` enxerga a linha nova, nunca a
-- antiga: ela não sabe dizer "esse valor MUDOU". Trigger sabe, porque recebe
-- OLD e NEW lado a lado.

create or replace function public.profiles_trava_privilegio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.perfil_admin() then
    return new;                                   -- admin muda o que precisar
  end if;
  if new.role is distinct from old.role then
    raise exception 'somente um administrador pode alterar o papel';
  end if;
  if new.status is distinct from old.status then
    raise exception 'somente um administrador pode alterar o status';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_trava_privilegio on public.profiles;
create trigger profiles_trava_privilegio
  before update on public.profiles
  for each row execute function public.profiles_trava_privilegio();

-- Na criação da conta a pessoa também não escolhe o próprio papel.
create or replace function public.profiles_nasce_pendente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.perfil_admin() then
    new.status := 'pendente';
    new.role := coalesce(nullif(new.role, 'admin'), 'usuario');
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_nasce_pendente on public.profiles;
create trigger profiles_nasce_pendente
  before insert on public.profiles
  for each row execute function public.profiles_nasce_pendente();


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As tabelas de trabalho
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma regra para todas: só equipe APROVADA. É a mesma trava que o layout da
-- área logada já aplica na tela — a diferença é que agora ela vale também para
-- quem tentar falar direto com a API, que é justamente o caminho que a tela não
-- protege.
--
-- Não há política por dono porque `liderancas` não tem coluna de dono: ninguém
-- registra quem cadastrou cada pessoa. Fica anotado como dívida, não como
-- descuido — para separar por responsável seria preciso primeiro criar a
-- coluna e preencher o passado.

do $$
declare
  t text;
  tabelas text[] := array[
    'liderancas', 'demandas', 'registros_disparo', 'metas_campanha',
    'metricas_trafego', 'campanhas_trafego', 'conjuntos_trafego',
    'criativos_trafego', 'trafego_sync'
  ];
begin
  foreach t in array tabelas loop
    -- to_regclass devolve nulo em vez de erro quando a tabela não existe:
    -- assim este arquivo roda inteiro mesmo num banco que ainda não tem tudo.
    if to_regclass('public.' || t) is null then
      raise notice 'tabela %.% não existe — pulando', 'public', t;
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || ' equipe ativa', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.perfil_ativo())
        with check (public.perfil_ativo())
    $f$, t || ' equipe ativa', t);

    -- As políticas antigas de demandas liberavam para qualquer conta logada,
    -- inclusive a que ainda não foi aprovada. Saem.
    execute format('drop policy if exists %I on public.%I', 'demandas leitura', t);
    execute format('drop policy if exists %I on public.%I', 'demandas escrita', t);
    execute format('drop policy if exists %I on public.%I', 'demandas atualizacao', t);
    execute format('drop policy if exists %I on public.%I', 'demandas exclusao', t);

    raise notice 'RLS ligada em public.%', t;
  end loop;
end $$;


-- municipios_ba é lista pública de municípios do IBGE, sem dado de ninguém.
-- Continua legível por todo mundo — o mapa da home depende disso.
alter table public.municipios_ba enable row level security;
drop policy if exists "municipios_leitura" on public.municipios_ba;
create policy "municipios_leitura" on public.municipios_ba
  for select to authenticated, anon using (true);


-- ============================================================================
-- CONFERÊNCIA — rode isto ANTES e DEPOIS. Não altera nada.
-- ============================================================================
-- select relname as tabela,
--        case when relrowsecurity then 'ligada' else '>>> DESLIGADA <<<' end as rls,
--        (select count(*) from pg_policies p
--          where p.schemaname = 'public' and p.tablename = c.relname) as politicas
--   from pg_class c
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'r'
--  order by relrowsecurity, relname;
--
-- Depois de aplicar, nenhuma tabela deve aparecer como DESLIGADA.


-- ============================================================================
-- SOCORRO — se alguma tela ficar vazia depois de aplicar
-- ============================================================================
-- Desliga a RLS e devolve o estado anterior. Use sem hesitar: plataforma no ar
-- vale mais que RLS perfeita, e dá para voltar com calma depois.
--
-- do $$ declare t text; begin
--   foreach t in array array['liderancas','demandas','registros_disparo',
--     'metas_campanha','metricas_trafego','campanhas_trafego',
--     'conjuntos_trafego','criativos_trafego','trafego_sync','profiles'] loop
--     if to_regclass('public.'||t) is not null then
--       execute format('alter table public.%I disable row level security', t);
--     end if;
--   end loop;
-- end $$;
-- drop trigger if exists profiles_trava_privilegio on public.profiles;
-- drop trigger if exists profiles_nasce_pendente on public.profiles;
