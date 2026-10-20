-- ============================================================================
-- CADA NÚMERO TEM UMA DONA
-- ============================================================================
--
-- Rode DEPOIS de varios-numeros.sql. Pode rodar de novo sem medo.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- Cada atendente passa a ter o número dela. O lead que escreve para o número da
-- Thami JÁ NASCE COM A THAMI — não passa por "Aguardando", não precisa ser
-- puxado.
--
-- ── ISSO NÃO É O PLANTÃO DE VOLTA ───────────────────────────────────────────
--
-- Vale registrar, porque parece.
--
-- O plantão distribuía por CARGA: o sistema escolhia uma atendente disponível
-- pela proporção de conversas abertas. Isso exigia manter a chave de
-- disponibilidade em dia — chave esquecida ligada mandava lead para quem tinha
-- saído, chave esquecida desligada fazia o sistema não achar ninguém. Era um
-- estado a mais para alguém lembrar de manter, num lugar onde ninguém lembra.
--
-- Aqui não há escolha nem estado. O lead chegou pelo número da Thami; é da
-- Thami. É a mesma coisa que o WhatsApp dela tocar — e é justamente por isso
-- que não dá para desalinhar.
--
-- ── A FILA NÃO SOME ─────────────────────────────────────────────────────────
--
-- "Aguardando" continua existindo, e continua importando em dois casos:
--
--   · número sem dona ainda (recém-cadastrado, ou a menina saiu da equipe);
--   · conversa transferida para a fila de propósito.
--
-- Na prática ela vai ficar quase sempre vazia — e é bom que fique: fila cheia
-- passa a significar "tem número órfão", que é uma informação útil.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A COLUNA
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.numeros
  add column if not exists atendente_id uuid
    references public.atendentes(id) on delete set null;

comment on column public.numeros.atendente_id is
  'De quem é este número. O lead que entra por ele já nasce com ela.';

-- Uma dona por número, e um número por dona. O índice único do segundo lado
-- existe para impedir o erro silencioso de apontar dois números para a mesma
-- pessoa e depois não entender por que a fila dela dobrou.
create unique index if not exists numeros_uma_dona
  on public.numeros (atendente_id)
  where atendente_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O LEAD NASCE COM DONA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Gatilho `before insert`, junto do que já preenche nome e município da base.
-- Ordem alfabética decide qual roda primeiro no Postgres — por isso este se
-- chama `conversa_nasce_com_dona`, depois de `conversa_nasce_conhecida`. Os
-- dois mexem em campos diferentes, então a ordem não muda o resultado; fica
-- registrado para quem for acrescentar um terceiro.
create or replace function public.conversa_nasce_com_dona()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dona uuid;
begin
  -- Já tem dono (transferência, cadastro manual): não mexe.
  if new.atendente_id is not null or new.numero_id is null then
    return new;
  end if;

  select n.atendente_id into v_dona
    from public.numeros n
   where n.id = new.numero_id and n.ativo;

  if v_dona is not null then
    new.atendente_id := v_dona;
    new.atribuido_em := now();
  end if;

  return new;
end $$;

drop trigger if exists conversa_nasce_com_dona on public.conversas;
create trigger conversa_nasce_com_dona
  before insert on public.conversas
  for each row execute function public.conversa_nasce_com_dona();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A RLS PRECISA DEIXAR ELA VER O QUE É DELA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A regra já era "o que está comigo, ou o que não está com ninguém". Continua
-- valendo sem mudança nenhuma — o lead nasce com ela, então ela enxerga.
--
-- Só a lista de números precisa ser legível para a atendente saber o apelido do
-- número na ficha. Isso já foi concedido em varios-numeros.sql.

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O PAINEL PASSA A DIZER DE QUEM É
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists public.numeros_painel;

create view public.numeros_painel
with (security_invoker = on) as
  select
    n.id, n.apelido, n.telefone, n.instancia, n.provedor,
    n.cor, n.ativo, n.ordem, n.departamento_id, n.atendente_id,
    a.nome                                                      as atendente,
    (select count(*) from public.conversas c
      where c.numero_id = n.id and c.encerrada_em is null)      as abertas,
    -- Com dona, isto tende a zero. Passa a significar "número órfão" — o que é
    -- exatamente o alarme que a coordenação precisa.
    (select count(*) from public.conversas c
      where c.numero_id = n.id and c.encerrada_em is null
        and c.atendente_id is null)                             as aguardando,
    (select count(*) from public.conversas c
      where c.numero_id = n.id
        and c.primeira_msg_at > now() - interval '24 hours')     as leads_24h,
    -- Quantos leads NOVOS hoje: é o que mede o risco de banimento daquele
    -- número, e o que a tela usa para gritar acima do limite seguro.
    (select count(*) from public.conversas c
      where c.numero_id = n.id
        and c.primeira_msg_at > date_trunc('day', now() at time zone 'America/Bahia'))
                                                                as leads_hoje,
    (select max(c.ultima_msg_at) from public.conversas c
      where c.numero_id = n.id)                                 as ultima_atividade
  from public.numeros n
  left join public.atendentes a on a.id = n.atendente_id;

revoke all on public.numeros_painel from anon;
grant select on public.numeros_painel to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. ADOTAR O QUE JÁ CHEGOU
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Conversa que já está na fila SEM DONO, de um número que agora tem dona, passa
-- para ela. Sem isto, a menina liga o número dela e continua vendo "Aguardando"
-- cheio de leads que já eram para serem dela.
--
-- Só as ABERTAS e SEM DONO. Conversa que outra pessoa já assumiu não muda de
-- mão — quem está no meio de um atendimento termina o atendimento.
update public.conversas c
   set atendente_id = n.atendente_id,
       atribuido_em = coalesce(c.atribuido_em, now())
  from public.numeros n
 where n.id = c.numero_id
   and n.atendente_id is not null
   and n.ativo
   and c.atendente_id is null
   and c.encerrada_em is null;

-- ── conferência ─────────────────────────────────────────────────────────────
select apelido, instancia, coalesce(atendente, '— sem dona —') as dona,
       ativo, abertas, aguardando, leads_hoje
  from public.numeros_painel
 order by ordem, apelido;
