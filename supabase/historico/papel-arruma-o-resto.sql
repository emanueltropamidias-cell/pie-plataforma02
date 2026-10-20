-- ============================================================================
-- TROCAR O PAPEL ARRUMA O RESTO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE ESTAVA QUEBRADO ───────────────────────────────────────────────────
--
-- A tela de usuários troca o papel com um `update profiles set role = ...`. Só
-- isso. E papel de atendimento não vive só em `profiles`:
--
--   atendentes            quem existe como atendente e pode receber conversa
--   departamento_membros  de qual setor ela faz parte
--   numeros.atendente_id  qual chip é dela
--   conversas.atendente_id  o que está na mão dela agora
--
-- Promover o Diego a admin deixava ele em TODAS essas: continuava na fila de
-- distribuição, continuava dono de número, e as conversas abertas dele ficavam
-- presas — porque "Aguardando" agora é do número de cada atendente, então
-- ninguém mais as veria.
--
-- Lead esperando por alguém que não atende mais é lead perdido, e nada na tela
-- diria isso.
--
-- ── POR QUE NO BANCO, E NÃO NA TELA ─────────────────────────────────────────
--
-- Porque são quatro tabelas e três telas diferentes podem trocar papel. Quem
-- escrever a quarta não vai lembrar desta lista. No gatilho, lembra sozinho.

create or replace function public.papel_arruma_o_resto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_atende_antes boolean := coalesce(old.role, '') in ('atendente', 'supervisor');
  v_atende_agora boolean := coalesce(new.role, '') in ('atendente', 'supervisor');
  v_setor bigint;
begin
  if v_atende_antes = v_atende_agora then
    return new;
  end if;

  -- ── ENTROU NO ATENDIMENTO ────────────────────────────────────────────────
  if v_atende_agora then
    insert into public.atendentes (id, nome, disponivel)
    values (new.id, coalesce(new.nome, 'sem nome'), true)
    on conflict (id) do update set disponivel = true;

    select id into v_setor
      from public.departamentos
     where padrao and ativo
     limit 1;

    if v_setor is not null then
      insert into public.departamento_membros (departamento_id, atendente_id)
      values (v_setor, new.id)
      on conflict (departamento_id, atendente_id) do nothing;
    end if;

    return new;
  end if;

  -- ── SAIU DO ATENDIMENTO ──────────────────────────────────────────────────
  --
  -- A ORDEM IMPORTA. Soltar as conversas ANTES de apagar a linha de atendente:
  -- depois de apagada não há mais como saber quais eram dela.
  --
  -- Só as ABERTAS voltam para a fila. As encerradas guardam o nome de quem
  -- atendeu — é histórico, e é de lá que sai o crédito por atendente na
  -- métrica. Apagar isso seria reescrever o que a pessoa fez.
  update public.conversas
     set atendente_id = null, atribuido_em = null, atualizado_em = now()
   where atendente_id = new.id
     and encerrada_em is null;

  -- O chip volta a ser de ninguém, e a tela de Números mostra isso.
  update public.numeros set atendente_id = null where atendente_id = new.id;

  delete from public.departamento_membros where atendente_id = new.id;
  delete from public.atendentes where id = new.id;

  return new;
end $$;

drop trigger if exists profiles_papel_arruma_o_resto on public.profiles;
create trigger profiles_papel_arruma_o_resto
  after update of role on public.profiles
  for each row execute function public.papel_arruma_o_resto();

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE JÁ ESTÁ TORTO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Quem trocou de papel antes deste gatilho existir. O Diego é o caso conhecido;
-- pode haver outros de dias atrás.
update public.conversas c
   set atendente_id = null, atribuido_em = null, atualizado_em = now()
  from public.profiles p
 where p.id = c.atendente_id
   and coalesce(p.role, '') not in ('atendente', 'supervisor')
   and c.encerrada_em is null;

update public.numeros n
   set atendente_id = null
  from public.profiles p
 where p.id = n.atendente_id
   and coalesce(p.role, '') not in ('atendente', 'supervisor');

delete from public.departamento_membros dm
 using public.profiles p
 where p.id = dm.atendente_id
   and coalesce(p.role, '') not in ('atendente', 'supervisor');

delete from public.atendentes a
 using public.profiles p
 where p.id = a.id
   and coalesce(p.role, '') not in ('atendente', 'supervisor');

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFERÊNCIA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Tem de vir VAZIA: ninguém na tabela de atendentes com papel que não atende.
select p.nome, p.email, p.role
  from public.atendentes a
  join public.profiles p on p.id = a.id
 where coalesce(p.role, '') not in ('atendente', 'supervisor');

select p.nome, coalesce(p.role, '—') as papel,
       count(*) filter (where c.encerrada_em is null) as abertas_com_ela
  from public.profiles p
  left join public.conversas c on c.atendente_id = p.id
 group by 1, 2
 order by 3 desc nulls last
 limit 15;
