-- ============================================================================
-- TRANCAR A BASE — separar equipe de liderança
-- ============================================================================
--
-- O PROBLEMA. A trava de `liderancas` é "perfil ativo", e só. Não distingue
-- papel. Quer dizer que qualquer conta aprovada pede as 29 mil pessoas à API do
-- Supabase numa chamada — nome, telefone, município, bairro. A TELA mostra só a
-- sub-rede de cada um; a API não, e é a API que importa.
--
-- É o pior tipo de vazamento: não precisa invadir nada. Basta ter login.
--
-- QUEM É EQUIPE, SEM DEPENDER DE PALPITE. A regra não olha o papel escrito na
-- conta, porque hoje quase todo mundo é "usuario" e isso não separa ninguém.
-- Olha um fato do banco: a conta está amarrada a uma linha de `liderancas`?
--
--   amarrada     -> é conta de PORTAL. Vê a própria sub-rede, e mais nada.
--   não amarrada -> é conta de EQUIPE. Vê tudo, como hoje.
--
-- Com a exceção de admin, que continua vendo tudo mesmo se também estiver
-- cadastrado na rede — é o caso da coordenação que também é liderança, e sem
-- essa saída ela se trancaria fora do próprio painel.
--
-- ORDEM: rode `diagnostico-acesso.sql` ANTES. Ele mostra quais contas ativas
-- estão amarradas a uma liderança, que são exatamente as que vão perder acesso
-- aqui. Se alguma delas for da equipe, promova a admin antes de rodar isto.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. As duas perguntas que a política faz
-- ─────────────────────────────────────────────────────────────────────────────

-- Esta conta está amarrada a uma liderança? (ou seja: entrou pelo portal)
create or replace function public.conta_de_lideranca()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.liderancas where auth_uid = auth.uid()
  );
$$;

-- Esta conta é da equipe interna?
--
-- TRÊS CONDIÇÕES, e cada uma fecha um buraco que as outras deixariam:
--
--   status = 'ativo'      a conta foi aprovada por alguém.
--   role <> 'lideranca'   o papel já existe no banco e separa portal de equipe.
--                         Conferido: as 7 contas da equipe são 'admin'; as do
--                         portal são 'lideranca'.
--   admin OU sem vínculo  papel sozinho não basta. Se uma conta antiga de
--                         portal tiver ficado como 'usuario', a regra do papel
--                         a deixaria passar; o vínculo com `liderancas` a pega.
--                         E o admin escapa dessa checagem de propósito — é a
--                         coordenação que TAMBÉM está cadastrada na rede, e sem
--                         a saída ela se trancaria fora do próprio painel.
--
-- SECURITY DEFINER com search_path fixo, como as outras: a função lê `profiles`
-- e `liderancas` por baixo da RLS, senão a política de liderancas consultaria
-- uma tabela cuja política consulta liderancas, e o Postgres entra em recursão.
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
      and coalesce(p.role, 'usuario') <> 'lideranca'
      and (
        p.role = 'admin'
        or not exists (select 1 from public.liderancas l where l.auth_uid = p.id)
      )
  );
$$;

-- A sub-rede de quem entrou pelo portal: ela e todos os descendentes.
--
-- Recursivo porque a rede tem profundidade — quem a liderança indicou, quem
-- esses indicaram, e assim por diante. Sem o `cycle`, um parent_id apontando
-- para trás por engano faria a consulta girar para sempre e derrubar o banco.
create or replace function public.minha_subarvore()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive rede as (
    select id from public.liderancas where auth_uid = auth.uid()
    union
    select l.id from public.liderancas l join rede r on l.parent_id = r.id
  ) cycle id set girou using caminho
  select id from rede;
$$;

revoke all on function public.conta_de_lideranca() from public;
revoke all on function public.perfil_equipe() from public;
revoke all on function public.minha_subarvore() from public;
grant execute on function public.conta_de_lideranca() to authenticated;
grant execute on function public.perfil_equipe() to authenticated;
grant execute on function public.minha_subarvore() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A trava nova
-- ─────────────────────────────────────────────────────────────────────────────
--
-- RLS é PERMISSIVA: as políticas se somam. Uma política larga esquecida anula
-- todas as estreitas. Por isso a antiga sai antes — não basta criar a nova.

drop policy if exists "liderancas equipe ativa" on public.liderancas;
drop policy if exists "liderancas le"          on public.liderancas;
drop policy if exists "liderancas escreve"     on public.liderancas;
drop policy if exists "liderancas atualiza"    on public.liderancas;
drop policy if exists "liderancas apaga"       on public.liderancas;

alter table public.liderancas enable row level security;

-- LEITURA
--
-- O CASE não é estilo: garante a ORDEM. Com `a or b`, o Postgres pode escolher
-- avaliar a sub-rede recursiva primeiro, e aí toda leitura da equipe pagaria
-- por uma recursão que nem precisava rodar. O CASE resolve o barato primeiro.
create policy "liderancas le" on public.liderancas
  for select to authenticated
  using (
    case
      when public.perfil_equipe() then true
      else id in (select public.minha_subarvore())
    end
  );

-- CADASTRO
--
-- A equipe cadastra qualquer pessoa. A liderança do portal só pendura gente
-- DEBAIXO da própria rede — senão ela cadastraria alguém solto, ou pior,
-- debaixo de outra liderança, e o crédito da indicação deixaria de valer.
create policy "liderancas escreve" on public.liderancas
  for insert to authenticated
  with check (
    case
      when public.perfil_equipe() then true
      else parent_id in (select public.minha_subarvore())
    end
  );

-- EDIÇÃO E EXCLUSÃO: só equipe.
--
-- Deliberado. Hoje o portal só lê, então isto não tira função de ninguém — e
-- deixar liderança editar a própria linha abriria o caminho para ela mudar o
-- próprio parent_id e se mudar de rede, levando os descendentes junto.
create policy "liderancas atualiza" on public.liderancas
  for update to authenticated
  using (public.perfil_equipe())
  with check (public.perfil_equipe());

create policy "liderancas apaga" on public.liderancas
  for delete to authenticated
  using (public.perfil_equipe());

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A PROVA — última consulta do arquivo, de propósito
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O editor do Supabase mostra APENAS o resultado da última consulta, e não
-- mostra `raise notice` nenhum. Criar política não devolve linha, então rodar
-- este arquivo dava uma tela vazia — indistinguível de não ter rodado.
--
-- Por isso a conferência vem aqui no fim, em forma de tabela: quem rodar o
-- arquivo VÊ o que aconteceu, sem precisar de uma segunda consulta.

select * from (

  select 1 as ordem,
         'TRAVA' as bloco,
         policyname as item,
         cmd as detalhe
  from pg_policies
  where schemaname = 'public' and tablename = 'liderancas'

  union all
  select 2, 'ALERTA',
         case when count(*) = 0
              then 'nenhuma politica sobrando — ok'
              else '>>> POLITICA ANTIGA AINDA EXISTE: a base continua aberta' end,
         count(*)::text
  from pg_policies
  where schemaname = 'public' and tablename = 'liderancas'
    and policyname not in ('liderancas le', 'liderancas escreve',
                           'liderancas atualiza', 'liderancas apaga')

  union all
  select 3, 'EQUIPE', 'contas que continuam vendo a base inteira',
         count(*)::text
  from public.profiles p
  left join public.liderancas l on l.auth_uid = p.id
  where p.status = 'ativo'
    and coalesce(p.role, 'usuario') <> 'lideranca'
    and (p.role = 'admin' or l.id is null)

  union all
  select 4, 'PORTAL', 'contas que passam a ver so a propria sub-rede',
         count(*)::text
  from public.profiles p
  left join public.liderancas l on l.auth_uid = p.id
  where p.status = 'ativo'
    and not (
      coalesce(p.role, 'usuario') <> 'lideranca'
      and (p.role = 'admin' or l.id is null)
    )

) prova
order by ordem, item;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3b. Conferir na PLATAFORMA, que é o que vale
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Rode logado como equipe (o SQL Editor roda como dono e ignora RLS, então
-- estas contas precisam ser conferidas PELA PLATAFORMA, abrindo as telas).
--
-- O que tem de continuar funcionando:
--   · Lideranças, Rede, Leads e o mapa carregam para a equipe
--   · o portal da liderança mostra a sub-rede dela, e só ela
--
-- E a prova de que fechou: com o token de uma conta de portal, isto
--   GET /rest/v1/liderancas?select=id&limit=100000
-- tem de devolver a sub-rede, não as 29 mil.

-- select count(*) from public.liderancas;   -- como equipe: 29 mil
-- select public.perfil_equipe();            -- true para equipe, false no portal

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Como voltar atrás, se algo travar no meio do expediente
-- ─────────────────────────────────────────────────────────────────────────────
--
-- drop policy if exists "liderancas le"       on public.liderancas;
-- drop policy if exists "liderancas escreve"  on public.liderancas;
-- drop policy if exists "liderancas atualiza" on public.liderancas;
-- drop policy if exists "liderancas apaga"    on public.liderancas;
-- create policy "liderancas equipe ativa" on public.liderancas
--   for all to authenticated
--   using (public.perfil_ativo()) with check (public.perfil_ativo());
