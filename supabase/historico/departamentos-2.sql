-- ============================================================================
-- DEPARTAMENTOS, SEGUNDA PARTE — padrão, horário, SLA e roteamento
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- O QUE ISTO RESOLVE QUE NÃO ERA ÓBVIO:
--
--   · DEPARTAMENTO PADRÃO. Hoje conversa nova não cai em setor nenhum. Com
--     600–1000 leads por dia, isso é a fila inteira sem lugar no organograma —
--     e a transferência vira o único jeito de qualquer conversa ter setor.
--
--   · HORÁRIO DE FUNCIONAMENTO. Sem ele, o lead que escreve às 2h da manhã
--     aparece às 8h como "esperando há 6 horas, ninguém respondeu". Não é
--     verdade: ninguém estava de plantão, e é assim que o alarme mais
--     importante da operação vira barulho no primeiro dia.
--
--   · SLA POR SETOR. Quatro horas fixas para todo mundo não serve: recepção de
--     lead pago tem que responder em minutos; jurídico pode levar um dia.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. AS COLUNAS NOVAS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.departamentos
  -- Recebe o que chega sem roteamento. Só um pode ser.
  add column if not exists padrao           boolean not null default false,
  -- Desligado = ninguém recebe automaticamente; a conversa fica na fila do
  -- setor esperando alguém assumir. Serve para setor de especialista, onde a
  -- pessoa certa escolhe o caso em vez de receber por sorteio de carga.
  add column if not exists auto_atribuir    boolean not null default true,
  -- Minutos até a primeira resposta virar atraso. 15 na recepção de lead pago,
  -- 1440 no jurídico — é o mesmo alarme com régua diferente.
  add column if not exists sla_resposta_min int not null default 60
    check (sla_resposta_min between 1 and 43200),
  -- Palavras que mandam a conversa para cá. Guardadas agora e usadas pelo
  -- roteiro quando ele existir; até lá servem de documentação do setor.
  add column if not exists palavras_chave   text[] not null default '{}',
  -- O fuso mora aqui e não no código: uma campanha pode ter setor em outro
  -- estado, e horário comercial sem fuso é hora errada em silêncio.
  add column if not exists fuso             text not null default 'America/Bahia';

-- Só UM padrão, garantido pelo banco.
--
-- Índice único parcial em vez de confiar na tela: duas abas abertas marcando
-- setores diferentes ao mesmo tempo passariam por qualquer verificação feita no
-- navegador, e aí duas conversas iguais iriam para lugares diferentes.
create unique index if not exists departamento_unico_padrao
  on public.departamentos (padrao) where padrao;

-- E marcar um desmarca o outro, para a tela não precisar fazer em dois passos
-- (que é onde a queda de rede no meio deixa a operação sem padrão nenhum).
create or replace function public.departamento_um_padrao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.padrao then
    -- Não recursa: o update abaixo grava `false`, e aí o `if` é falso.
    update public.departamentos
       set padrao = false
     where id is distinct from new.id and padrao;
  end if;
  return new;
end $$;

drop trigger if exists departamento_um_padrao on public.departamentos;
create trigger departamento_um_padrao
  before insert or update of padrao on public.departamentos
  for each row execute function public.departamento_um_padrao();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. OS TURNOS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- UMA LINHA POR TURNO, e o dia está aberto quando tem pelo menos uma.
--
-- O GabiFlow separa "dias de funcionamento" de "horários por dia". São duas
-- listas que podem discordar — dia marcado como aberto e sem turno nenhum, ou
-- turno cadastrado num dia desmarcado — e aí ninguém sabe qual vence. Aqui há
-- uma fonte só: sem turno, o dia está fechado.
--
-- Vários turnos por dia porque almoço existe: 08:00–12:00 e 14:00–18:00.
create table if not exists public.departamento_turnos (
  id              bigserial primary key,
  departamento_id bigint not null references public.departamentos(id) on delete cascade,
  -- 0 = domingo, como o `dow` do Postgres. Usar a mesma convenção do banco
  -- evita a conversão a mais que sempre erra em algum lugar.
  dia             smallint not null check (dia between 0 and 6),
  abre            time not null,
  fecha           time not null,
  constraint turno_valido check (fecha > abre)
);

create index if not exists turnos_por_departamento
  on public.departamento_turnos (departamento_id, dia);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O SETOR ESTÁ ABERTO AGORA?
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Setor SEM NENHUM TURNO cadastrado é considerado SEMPRE ABERTO, não sempre
-- fechado. É a escolha que evita o pior estrago: quem cria um setor e esquece
-- de configurar horário não descobre no dia seguinte que a operação inteira
-- ficou parada — descobre que ela funcionou, e ajusta.
create or replace function public.departamento_aberto(
  p_departamento bigint,
  p_momento      timestamptz default now()
) returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_fuso  text;
  v_local timestamp;
begin
  select coalesce(d.fuso, 'America/Bahia') into v_fuso
    from public.departamentos d where d.id = p_departamento;

  -- Setor que não existe não fecha nada.
  if v_fuso is null then
    return true;
  end if;

  -- Sem nenhum turno cadastrado = sempre aberto. Ver a nota acima: é a escolha
  -- que evita parar a operação por esquecimento de configuração.
  if not exists (
    select 1 from public.departamento_turnos t
     where t.departamento_id = p_departamento
  ) then
    return true;
  end if;

  v_local := p_momento at time zone v_fuso;

  return exists (
    select 1
      from public.departamento_turnos t
     where t.departamento_id = p_departamento
       -- `dow` do Postgres: 0 = domingo. Mesma convenção da coluna, para não
       -- haver uma conversão a mais no meio — é sempre nela que se erra.
       and t.dia = extract(dow from v_local)::smallint
       and v_local::time >= t.abre
       and v_local::time <  t.fecha
  );
end $$;

grant execute on function public.departamento_aberto(bigint, timestamptz) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O PAINEL, AGORA COM O ATRASO DE VERDADE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `fora_do_sla` conta as conversas que passaram do prazo DO SETOR, e não das
-- quatro horas fixas que a tela usava para todo mundo.
create or replace view public.departamentos_painel
with (security_invoker = on) as
  select
    d.id, d.nome, d.cor, d.descricao, d.ativo, d.ordem,
    d.padrao, d.auto_atribuir, d.sla_resposta_min, d.palavras_chave, d.fuso,
    public.departamento_aberto(d.id)                           as aberto_agora,
    count(distinct m.atendente_id)                             as membros,
    count(distinct m.atendente_id) filter (where a.disponivel) as no_plantao,
    (select count(*) from public.conversas c
      where c.departamento_id = d.id and c.encerrada_em is null) as abertas,
    (select count(*) from public.conversas c
      where c.departamento_id = d.id
        and c.encerrada_em is null
        and c.atendente_id is null)                             as sem_dono,
    (select count(*) from public.conversas c
      where c.departamento_id = d.id
        and c.encerrada_em is null
        and c.primeira_resp_at is null
        and c.primeira_msg_at is not null
        and c.primeira_msg_at < now() - make_interval(mins => d.sla_resposta_min))
                                                               as fora_do_sla,
    (select count(*) from public.departamento_turnos t
      where t.departamento_id = d.id)                          as turnos
  from public.departamentos d
  left join public.departamento_membros m on m.departamento_id = d.id
  left join public.atendentes a on a.id = m.atendente_id
  group by d.id, d.nome, d.cor, d.descricao, d.ativo, d.ordem,
           d.padrao, d.auto_atribuir, d.sla_resposta_min, d.palavras_chave, d.fuso;

revoke all on public.departamentos_painel from anon;
grant select on public.departamentos_painel to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. QUEM VÊ E QUEM MEXE NOS TURNOS
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.departamento_turnos enable row level security;

drop policy if exists "turnos le" on public.departamento_turnos;
drop policy if exists "turnos mexe" on public.departamento_turnos;

create policy "turnos le" on public.departamento_turnos
  for select to authenticated using (public.perfil_atendimento());

create policy "turnos mexe" on public.departamento_turnos
  for all to authenticated
  using (public.perfil_supervisao())
  with check (public.perfil_supervisao());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. A CONVERSA NOVA CAI NO PADRÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Feito no BANCO e não no webhook: o dia em que a conversa nascer por outro
-- caminho — importação, disparo, correção manual — ela continua entrando no
-- organograma. Regra que mora só no código de uma rota vale só para aquela rota.
create or replace function public.conversa_cai_no_padrao()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.departamento_id is null then
    select d.id into new.departamento_id
      from public.departamentos d
     where d.padrao and d.ativo
     limit 1;
  end if;
  return new;
end $$;

drop trigger if exists conversa_cai_no_padrao on public.conversas;
create trigger conversa_cai_no_padrao
  before insert on public.conversas
  for each row execute function public.conversa_cai_no_padrao();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. A RECEPÇÃO VIRA O PADRÃO, E GANHA HORÁRIO COMERCIAL
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só se ainda não houver padrão nenhum: rodar de novo não desfaz sua escolha.
update public.departamentos
   set padrao = true, sla_resposta_min = 15
 where nome = 'Recepção'
   and not exists (select 1 from public.departamentos where padrao);

-- Segunda a sexta, 8h às 18h, para a Recepção — e só se ela ainda não tiver
-- turno nenhum, pelo mesmo motivo.
insert into public.departamento_turnos (departamento_id, dia, abre, fecha)
select d.id, g.dia, time '08:00', time '18:00'
  from public.departamentos d
 cross join generate_series(1, 5) as g(dia)
 where d.nome = 'Recepção'
   and not exists (
     select 1 from public.departamento_turnos t where t.departamento_id = d.id
   );

-- ── conferência ─────────────────────────────────────────────────────────────
select nome, padrao, aberto_agora, sla_resposta_min as sla_min, turnos,
       auto_atribuir, membros, no_plantao, abertas, sem_dono, fora_do_sla
  from public.departamentos_painel
 order by ordem, nome;
