-- ============================================================================
-- OS PAPÉIS VIRAM LISTA BRANCA — rode ANTES de criar as contas da equipe
-- ============================================================================
--
-- Rode inteiro no SQL Editor. Pode rodar de novo sem medo.
--
-- ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
--
-- A tela de usuários oferecia o papel "Atendimento", que grava a palavra
-- `atendimento` no banco. Mas TODA a trava foi escrita contra `atendente`.
--
-- As duas palavras são parecidas e o efeito é o oposto do pretendido:
--
--   `atendimento` NÃO está em ('lideranca', 'atendente', 'supervisor')
--   → perfil_equipe() devolve VERDADEIRO
--   → a atendente enxerga a plataforma inteira: as 29 mil pessoas da base,
--     o gasto de tráfego e as demandas de saúde e jurídico com nome.
--
-- Cinco contas criadas assim amanhã seriam cinco pessoas com a base na mão.
--
-- ── POR QUE LISTA BRANCA, E NÃO SÓ CORRIGIR A PALAVRA ───────────────────────
--
-- Trocar 'atendimento' por 'atendente' conserta HOJE e deixa a armadilha
-- armada. Uma regra escrita como "todo mundo, menos estes três" concede acesso
-- total a qualquer papel novo que alguém invente depois — e concede em
-- silêncio, sem erro, sem log, sem ninguém perceber.
--
-- Lista branca inverte o padrão de falha: papel desconhecido não entra. Se
-- amanhã alguém criar 'estagiario' e esquecer de me avisar, o pior que
-- acontece é a pessoa não conseguir abrir uma tela e reclamar. O pior do outro
-- jeito é a base vazar sem ninguém saber.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. OS GATILHOS PRECISAM RECONHECER QUEM NÃO TEM SESSÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `profiles_trava_privilegio` e `profiles_nasce_pendente` perguntam "quem é o
-- usuário logado?" via perfil_admin(). Existem três situações legítimas em que
-- NÃO HÁ usuário logado, e nas três o gatilho tratava como intruso:
--
--   · o SQL EDITOR do Supabase — é por onde esta migração roda;
--   · a CHAVE DE SERVIÇO, usada pela rota que cria a conta da atendente;
--   · qualquer rotina de máquina, como o webhook.
--
-- O efeito era silencioso e pior que um erro: a rota de criar conta teria
-- rebaixado toda atendente para status 'pendente' e papel 'usuario'. As cinco
-- contas nasceriam sem acesso a nada, e ninguém descobriria antes da manhã
-- seguinte.
--
-- ISTO NÃO ABRE BURACO. Quem chega sem sessão não passa pela RLS de `profiles`
-- de qualquer jeito: a política exige `id = auth.uid()` ou `perfil_equipe()`, e
-- as duas são falsas sem sessão. Só a chave de serviço atravessa a RLS — e ela
-- vive apenas no servidor, onde a rota já confere que quem pediu é admin.
--
-- O gatilho existe para impedir que um usuário LOGADO e não-admin se promova.
-- Essa proteção continua exatamente igual.
create or replace function public.sem_sessao()
returns boolean
language sql
stable
set search_path = public
as $$
  select auth.uid() is null;
$$;

create or replace function public.profiles_trava_privilegio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.perfil_admin() or public.sem_sessao() then
    return new;
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

create or replace function public.profiles_nasce_pendente()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.perfil_admin() or public.sem_sessao()) then
    new.status := 'pendente';
    new.role := coalesce(nullif(new.role, 'admin'), 'usuario');
  end if;
  return new;
end;
$$;

-- ── 1. corrigir quem já foi gravado com a palavra errada ────────────────────
update public.profiles
   set role = 'atendente'
 where role = 'atendimento';

-- ── 2. as três funções, agora por lista branca ─────────────────────────────
--
--   perfil_equipe()       admin e usuário interno — a plataforma toda
--   perfil_supervisao()   equipe + supervisor — atendimento e sua configuração
--   perfil_atendimento()  supervisão + atendente — a caixa de entrada

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
      -- Lista branca. `coalesce` porque conta antiga pode ter role nulo, e
      -- essas são da equipe: existiam antes de o campo existir.
      and coalesce(p.role, 'usuario') in ('admin', 'usuario')
      -- Conta que também é liderança na rede não é gabinete, salvo admin.
      and (
        p.role = 'admin'
        or not exists (select 1 from public.liderancas l where l.auth_uid = p.id)
      )
  );
$$;

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
      and coalesce(p.role, 'usuario') in ('admin', 'usuario', 'supervisor')
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
      and coalesce(p.role, 'usuario') in ('admin', 'usuario', 'supervisor', 'atendente')
  );
$$;

-- ── 3. a trava que impede a palavra errada de voltar ───────────────────────
--
-- A lista branca protege mesmo com papel escrito errado, mas papel errado
-- ainda tranca a pessoa para fora sem explicar por quê. Melhor recusar na
-- gravação: quem digitar 'atendimento' recebe erro na hora, em vez de
-- descobrir amanhã que a conta não abre nada.
alter table public.profiles drop constraint if exists profiles_role_conhecido;
alter table public.profiles add constraint profiles_role_conhecido
  check (role is null or role in ('admin', 'usuario', 'supervisor', 'atendente', 'lideranca'));

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- O editor mostra só o resultado da última consulta. Confira duas coisas:
-- que ninguém sobrou com papel desconhecido, e quantas contas há de cada tipo.
select
  coalesce(role, '(nulo — conta antiga, tratada como usuário)') as papel,
  count(*)                                                      as contas,
  case coalesce(role, 'usuario')
    when 'admin'      then 'plataforma toda'
    when 'usuario'    then 'plataforma toda'
    when 'supervisor' then 'so a area de atendimento'
    when 'atendente'  then 'so a caixa de entrada'
    when 'lideranca'  then 'so o portal dela'
    else '>>> DESCONHECIDO — nao entra em lugar nenhum'
  end                                                           as alcance
from public.profiles
group by 1, 3
order by 2 desc;
