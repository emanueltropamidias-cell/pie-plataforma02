-- ============================================================================
-- DEPARTAMENTOS — os setores do gabinete, e a transferência entre eles
-- ============================================================================
--
-- Rode inteiro no SQL Editor. Pode rodar de novo sem medo.
--
-- ── DEPARTAMENTO NÃO É DEMANDA ──────────────────────────────────────────────
--
-- São dois eixos diferentes e o sistema já tem o outro:
--
--   DEMANDA       o que a PESSOA pediu — saúde, jurídico, material.
--                 Vive em `conversas.demandas`, e uma pessoa pode ter várias.
--   DEPARTAMENTO  qual SETOR do gabinete está com a conversa agora —
--                 Gabinete Salvador, Equipe Interior, Jurídico externo.
--                 Uma conversa está em UM departamento por vez.
--
-- Alguém do Gabinete Salvador atende pedido de saúde e de material; alguém do
-- Interior atende os mesmos pedidos, em outra região. Misturar os dois faria o
-- relatório de demanda virar relatório de equipe, e a pergunta "quanto de saúde
-- a campanha recebeu?" passaria a depender de quem atendeu.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OS DEPARTAMENTOS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.departamentos (
  id            bigserial primary key,
  nome          text not null unique,
  cor           text not null default '#52535c',
  descricao     text,
  -- Desativar em vez de apagar: departamento apagado levaria junto o histórico
  -- de para onde as conversas foram, e é justamente esse histórico que explica
  -- por que uma conversa antiga está com quem está.
  ativo         boolean not null default true,
  ordem         int not null default 100,
  criado_em     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. QUEM ESTÁ EM CADA UM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Tabela de ligação, e não uma coluna em `atendentes`: a mesma pessoa pode
-- cobrir dois setores numa semana de pouca gente, e isso é regra, não exceção
-- numa campanha.
create table if not exists public.departamento_membros (
  departamento_id bigint not null references public.departamentos(id) on delete cascade,
  atendente_id    uuid   not null references public.atendentes(id) on delete cascade,
  criado_em       timestamptz not null default now(),
  primary key (departamento_id, atendente_id)
);

create index if not exists dep_membros_atendente
  on public.departamento_membros (atendente_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ONDE A CONVERSA ESTÁ
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversas
  add column if not exists departamento_id bigint
    references public.departamentos(id) on delete set null;

create index if not exists conversas_por_departamento
  on public.conversas (departamento_id) where encerrada_em is null;

-- A transferência é uma atribuição com motivo próprio. O campo já existe; aqui
-- só se registra o setor de origem e destino, para a pergunta "quem mandou isto
-- para o Jurídico?" ter resposta.
alter table public.atribuicoes
  add column if not exists de_departamento   bigint references public.departamentos(id) on delete set null,
  add column if not exists para_departamento bigint references public.departamentos(id) on delete set null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A TRANSFERÊNCIA, NUMA CHAMADA SÓ
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Transferir é trocar o departamento E trocar o dono E registrar o histórico.
-- Feito em três chamadas do navegador, uma queda de rede no meio deixa a
-- conversa sem dono e sem registro — e ninguém descobre até a pessoa reclamar
-- que ficou sem resposta.
--
-- A ESCOLHA DE QUEM RECEBE É POR PROPORÇÃO DA CAPACIDADE, não por contagem.
-- Quem aguenta 40 e tem 20 abertas está tão cheia quanto quem aguenta 10 e tem
-- 5. A mesma regra da distribuição automática, para a transferência não desfazer
-- o equilíbrio que ela mantém.
--
-- SE NÃO HOUVER NINGUÉM DE PLANTÃO NO DESTINO, a conversa vai para o
-- departamento MESMO ASSIM, sem dono. Ela não pode voltar calada para quem
-- transferiu — a pessoa já seguiu para a próxima — nem sumir. Fica visível na
-- supervisão como órfã daquele setor, que é onde alguém age.
create or replace function public.transferir_conversa(
  p_conversa      bigint,
  p_departamento  bigint,
  p_observacao    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_de_atendente   uuid;
  v_de_departamento bigint;
  v_telefone       text;
  v_para           uuid;
  v_nome           text;
begin
  -- Quem chama precisa estar no atendimento. `security definer` existe para
  -- gravar em atribuicoes e conversas numa transação só, não para abrir a porta.
  if not public.perfil_atendimento() then
    raise exception 'sem permissao para transferir';
  end if;

  select c.atendente_id, c.departamento_id, c.telefone
    into v_de_atendente, v_de_departamento, v_telefone
    from public.conversas c
   where c.id = p_conversa
   for update;

  if not found then
    raise exception 'conversa % nao existe', p_conversa;
  end if;

  if not exists (select 1 from public.departamentos d
                  where d.id = p_departamento and d.ativo) then
    raise exception 'departamento % nao existe ou esta desativado', p_departamento;
  end if;

  -- Quem do departamento está menos cheio, em proporção. `disponivel` filtra
  -- quem saiu do plantão: carga baixa em quem foi embora não é vaga.
  select a.id, a.nome
    into v_para, v_nome
    from public.departamento_membros m
    join public.atendentes a on a.id = m.atendente_id
    left join public.conversas c
      on c.atendente_id = a.id and c.encerrada_em is null
   where m.departamento_id = p_departamento
     and a.disponivel
     and a.id is distinct from v_de_atendente
   group by a.id, a.nome, a.capacidade
   order by (count(c.id)::numeric / greatest(a.capacidade, 1)) asc, a.nome asc
   limit 1;

  update public.conversas
     set departamento_id = p_departamento,
         atendente_id    = v_para,          -- null quando o destino está vazio
         atribuido_em    = case when v_para is not null then now() else null end,
         atualizado_em   = now()
   where id = p_conversa;

  insert into public.atribuicoes (
    conversa_id, telefone, de_atendente, para_atendente,
    de_departamento, para_departamento, motivo, regra, feita_por
  ) values (
    p_conversa, v_telefone, v_de_atendente, v_para,
    v_de_departamento, p_departamento, 'transferencia',
    coalesce(p_observacao, 'menor-carga'), auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'para_atendente', v_para,
    'nome', v_nome,
    -- A tela precisa saber disto para AVISAR. Transferência silenciosa para um
    -- setor vazio é a conversa que ninguém vê de novo.
    'sem_ninguem', v_para is null
  );
end $$;

revoke all on function public.transferir_conversa(bigint, bigint, text) from public, anon;
grant execute on function public.transferir_conversa(bigint, bigint, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. O QUE A TELA LÊ
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `security_invoker` porque view roda como DONA por padrão, e sem isto ela
-- devolveria a contagem inteira para quem a RLS deveria limitar.
create or replace view public.departamentos_painel
with (security_invoker = on) as
  select
    d.id,
    d.nome,
    d.cor,
    d.descricao,
    d.ativo,
    d.ordem,
    count(distinct m.atendente_id)                                    as membros,
    count(distinct m.atendente_id) filter (where a.disponivel)        as no_plantao,
    (select count(*) from public.conversas c
      where c.departamento_id = d.id and c.encerrada_em is null)      as abertas,
    -- O número que importa: conversa no setor que ninguém pegou.
    (select count(*) from public.conversas c
      where c.departamento_id = d.id
        and c.encerrada_em is null
        and c.atendente_id is null)                                   as sem_dono
  from public.departamentos d
  left join public.departamento_membros m on m.departamento_id = d.id
  left join public.atendentes a on a.id = m.atendente_id
  group by d.id, d.nome, d.cor, d.descricao, d.ativo, d.ordem;

revoke all on public.departamentos_painel from anon;
grant select on public.departamentos_painel to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. QUEM VÊ E QUEM MEXE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A atendente LÊ: ela precisa da lista para escolher o destino da transferência.
-- O SUPERVISOR escreve: criar setor e definir quem está nele é decisão de quem
-- coordena, não de quem está no plantão.
alter table public.departamentos        enable row level security;
alter table public.departamento_membros enable row level security;

do $$
declare t text;
begin
  foreach t in array array['departamentos', 'departamento_membros'] loop
    execute format('drop policy if exists %I on public.%I', t || ' le', t);
    execute format('drop policy if exists %I on public.%I', t || ' mexe', t);
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
    $f$, t || ' mexe', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. TRÊS PARA COMEÇAR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só entram se a tabela estiver vazia: rodar de novo não recria o que você
-- renomeou nem ressuscita o que desativou.
insert into public.departamentos (nome, cor, descricao, ordem)
select * from (values
  ('Recepção',          '#0525f7', 'Primeiro contato. Recebe todo lead novo.',            10),
  ('Gabinete Salvador', '#12703c', 'Capital e região metropolitana.',                     20),
  ('Interior',          '#8a6009', 'Demais municípios da Bahia.',                         30)
) as novos(nome, cor, descricao, ordem)
where not exists (select 1 from public.departamentos);

-- ── conferência ─────────────────────────────────────────────────────────────
select nome, ativo, membros, no_plantao, abertas, sem_dono
  from public.departamentos_painel
 order by ordem, nome;
