-- ============================================================================
-- AS ABAS QUE CADA CONTA PODE USAR
-- ============================================================================
--
-- Em 20/10/2026 o Emanuel pediu: ao criar o usuário, marcar as abas que ele
-- usa — "quero que a pessoa utilize só essa aba". Até aqui o acesso era só pelo
-- PAPEL (admin, usuário, supervisor, atendente), e quem era "usuário" via a
-- plataforma inteira.
--
-- `modulos` guarda as abas liberadas: dashboard, atendimento, trafego, base,
-- estrategia, liderancas, gabinete (as mesmas de src/lib/modulos.ts).
--
--   null    = todas (o comportamento de antes; ninguém perde acesso hoje)
--   lista   = só essas
--
-- Admin ignora a lista: quem administra contas precisa ver tudo, ou poderia se
-- trancar para fora da própria tela de usuários.
--
-- ── O QUE ISTO TRAVA E O QUE NÃO TRAVA ──────────────────────────────────────
--
-- É trava de TELA: menu, atalho e endereço digitado. O dado por baixo continua
-- com a trava de papel que já existia (RLS, perfil_equipe()). Ver
-- src/app/(app)/layout.tsx.
-- ────────────────────────────────────────────────────────────────────────────

alter table public.profiles add column if not exists modulos text[];

comment on column public.profiles.modulos is
  'Abas liberadas para a conta (src/lib/modulos.ts). null = todas. Admin ignora.';

alter table public.profiles drop constraint if exists profiles_modulos_validos;
alter table public.profiles add constraint profiles_modulos_validos check (
  modulos is null
  or modulos <@ array['dashboard','atendimento','trafego','base','estrategia','liderancas','gabinete']::text[]
);

-- A pessoa pode editar a própria linha (nome, por exemplo). Sem isto ela
-- poderia se liberar todas as abas com um update — a mesma brecha que esta
-- trava já fechava para papel e status.
create or replace function public.profiles_trava_privilegio()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  if new.modulos is distinct from old.modulos then
    raise exception 'somente um administrador pode alterar as abas liberadas';
  end if;
  return new;
end;
$function$;

-- ── conferência ─────────────────────────────────────────────────────────────
select role, count(*) as contas, count(modulos) as com_abas_restritas
  from public.profiles
 group by 1
 order by 1;
