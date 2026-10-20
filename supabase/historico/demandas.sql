-- Demandas do munícipe: o que a pessoa pediu, em que pé está e quem resolve.
-- Rode este arquivo no SQL Editor do Supabase antes de usar a aba Demandas.

create table if not exists public.demandas (
  id uuid primary key default gen_random_uuid(),
  -- Quem pediu. Aponta para a mesma tabela de lideranças/munícipes.
  municipe_id uuid references public.liderancas (id) on delete set null,
  -- Cópia do nome no momento do registro: se o cadastro sumir, a demanda
  -- continua legível no histórico.
  municipe_nome text,
  municipio text,
  bairro text,

  titulo text not null,
  descricao text,
  categoria text not null default 'outros',   -- saude, educacao, infraestrutura, emprego, assistencia, seguranca, outros
  prioridade text not null default 'normal',  -- baixa, normal, alta
  status text not null default 'aberta',      -- aberta, andamento, resolvida, sem_solucao

  prazo date,
  resposta text,                              -- o que foi feito/encaminhado
  resolvida_em timestamptz,

  criado_por uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Índices para os filtros que a tela usa
create index if not exists demandas_status_idx on public.demandas (status);
create index if not exists demandas_municipe_idx on public.demandas (municipe_id);
create index if not exists demandas_created_idx on public.demandas (created_at desc);

-- Carimba updated_at e a data de resolução automaticamente
create or replace function public.demandas_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'resolvida' and (old.status is distinct from 'resolvida') then
    new.resolvida_em := now();
  elsif new.status <> 'resolvida' then
    new.resolvida_em := null;
  end if;
  return new;
end $$;

drop trigger if exists demandas_touch_trg on public.demandas;
create trigger demandas_touch_trg before update on public.demandas
  for each row execute function public.demandas_touch();

-- Acesso: mesma regra do resto da plataforma — só quem está logado.
alter table public.demandas enable row level security;

drop policy if exists "demandas leitura" on public.demandas;
create policy "demandas leitura" on public.demandas
  for select to authenticated using (true);

drop policy if exists "demandas escrita" on public.demandas;
create policy "demandas escrita" on public.demandas
  for insert to authenticated with check (true);

drop policy if exists "demandas atualizacao" on public.demandas;
create policy "demandas atualizacao" on public.demandas
  for update to authenticated using (true);

drop policy if exists "demandas exclusao" on public.demandas;
create policy "demandas exclusao" on public.demandas
  for delete to authenticated using (true);

-- Se a tabela já existia antes do campo de bairro:
alter table public.demandas add column if not exists bairro text;
