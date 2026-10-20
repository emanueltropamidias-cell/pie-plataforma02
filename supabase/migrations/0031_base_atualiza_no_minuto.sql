-- ============================================================================
-- A BASE RECALCULA NO MINUTO SEGUINTE A QUALQUER CADASTRO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 15/09, 05:35: "A base tem que ir atualizando viu? Estou cadastrando já novas
-- pessoas e novos apoiadores."
--
-- Ela atualizava — de 10 em 10 minutos (0027). Para quem cadastra e abre a
-- Central logo em seguida, dez minutos parece número travado.
--
-- ── COMO, SEM PESAR NO WEBHOOK ──────────────────────────────────────────────
--
-- Recalcular a cada cadastro (gatilho chamando o refresh) poria 2,6 s dentro de
-- cada gravação — inclusive das mensagens que chegam pelo WhatsApp. Não.
--
-- Em vez disso, um CONTADOR: todo cadastro, edição ou exclusão em `liderancas`,
-- e toda conversa nova ou com telefone/nome/cidade mudado em `conversas`, dá um
-- `nextval` numa sequência. Sequência não trava linha nem espera transação —
-- custa quase nada e nunca bloqueia quem está gravando.
--
-- De minuto em minuto o pg_cron compara o contador com o do último cálculo. Se
-- mudou, recalcula; se não, não faz nada. O contador é lido ANTES do refresh:
-- o que chegar durante o cálculo deixa o contador à frente, e entra no minuto
-- seguinte — nada se perde.
--
-- E a cada 10 minutos recalcula de qualquer jeito, como antes: pega a "última
-- conversa" da exportação, que muda a cada mensagem e não mexe no contador.

create sequence if not exists public.base_mudancas;
revoke all on sequence public.base_mudancas from public, anon, authenticated;

alter table public.base_cache add column if not exists versao bigint not null default 0;

create or replace function public.base_marcar_mudanca()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform nextval('public.base_mudancas');
  return null;
end $$;

revoke all on function public.base_marcar_mudanca() from public, anon, authenticated;

-- Cadastro: qualquer mudança conta. Um por comando, não um por linha — importar
-- 400 fichas de uma vez é um nextval só.
drop trigger if exists base_mudou on public.liderancas;
create trigger base_mudou
  after insert or update or delete on public.liderancas
  for each statement execute function public.base_marcar_mudanca();

-- Conversa: `receber_mensagem` atualiza a conversa a CADA mensagem. Contar todo
-- update deixaria a base "mudada" o tempo inteiro. Conta só o que muda o número
-- da base: conversa nova, e telefone, nome ou cidade citada que mudaram.
drop trigger if exists base_mudou_conversa_nova on public.conversas;
create trigger base_mudou_conversa_nova
  after insert on public.conversas
  for each statement execute function public.base_marcar_mudanca();

drop trigger if exists base_mudou_conversa on public.conversas;
create trigger base_mudou_conversa
  after update on public.conversas
  for each row
  when (old.telefone is distinct from new.telefone
        or old.nome is distinct from new.nome
        or old.municipio_sugerido is distinct from new.municipio_sugerido
        or old.tipo is distinct from new.tipo)
  execute function public.base_marcar_mudanca();

create or replace function public.atualizar_base_cache(p_forcar boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  t0 timestamptz := clock_timestamp();
  v_versao bigint;
begin
  -- Dois cálculos ao mesmo tempo só gastariam o dobro.
  if not pg_try_advisory_xact_lock(hashtext('atualizar_base_cache')) then
    return false;
  end if;

  select last_value into v_versao from public.base_mudancas;

  if not p_forcar
     and v_versao = (select versao from public.base_cache where id = 1)
     and (select atualizado_em from public.base_cache where id = 1) > now() - interval '10 minutes' then
    return false;
  end if;

  refresh materialized view concurrently public.base_pessoas_mv;
  refresh materialized view concurrently public.conversas_por_telefone_mv;
  update public.base_cache
     set atualizado_em = t0,
         versao = v_versao,
         segundos = round(extract(epoch from clock_timestamp() - t0)::numeric, 1)
   where id = 1;
  return true;
end $$;

-- A versão sem argumento (0027) continua existindo e passa a forçar. Sem
-- default no argumento de propósito: se alguém rodar a 0027 de novo, as duas
-- assinaturas convivem sem ambiguidade — o pior que acontece é o agendamento
-- voltar a ser de 10 em 10 minutos.
create or replace function public.atualizar_base_cache()
returns void
language sql
security definer
set search_path = public
as $$ select public.atualizar_base_cache(true); $$;

revoke all on function public.atualizar_base_cache() from public, anon, authenticated;
revoke all on function public.atualizar_base_cache(boolean) from public, anon, authenticated;

select cron.unschedule('base-pre-calculada')
 where exists (select 1 from cron.job where jobname = 'base-pre-calculada');
select cron.schedule('base-pre-calculada', '* * * * *', 'select public.atualizar_base_cache(false)');

-- ── conferência ─────────────────────────────────────────────────────────────
select jobname, schedule, command from cron.job where jobname = 'base-pre-calculada';
select tgname, tgrelid::regclass as tabela from pg_trigger
 where tgname in ('base_mudou', 'base_mudou_conversa_nova', 'base_mudou_conversa') order by 1;
