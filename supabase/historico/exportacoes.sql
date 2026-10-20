-- ============================================================================
-- REGISTRO DE EXPORTAÇÕES — a contrapartida de deixar a base sair
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- Planilha com telefone é a base saindo da plataforma, e arquivo que sai não
-- volta: some do controle da RLS, do papel, de tudo. Não dá para impedir sem
-- inutilizar a ferramenta — a coordenação precisa de lista para trabalhar em
-- campo.
--
-- O que dá para fazer é isto: cada exportação deixa registro de QUEM, QUANDO,
-- COM QUAL RECORTE e QUANTAS LINHAS. Se um dia a lista aparecer onde não devia,
-- há por onde começar. E saber que fica registrado já muda o comportamento de
-- quem pensa em baixar a base inteira "por precaução".

create table if not exists public.exportacoes (
  id        bigserial primary key,
  quem      uuid references public.profiles(id) on delete set null,
  -- Guarda o e-mail junto porque a conta pode ser apagada depois, e aí o
  -- registro apontaria para ninguém — justamente no caso em que ele importa.
  quem_email text,
  o_que     text not null,          -- 'conversas'
  filtros   jsonb not null default '{}',
  linhas    int not null,
  criado_em timestamptz not null default now()
);

create index if not exists exportacoes_recentes
  on public.exportacoes (criado_em desc);

alter table public.exportacoes enable row level security;

drop policy if exists "exportacoes registra" on public.exportacoes;
drop policy if exists "exportacoes le" on public.exportacoes;

-- Quem exporta registra a própria exportação.
create policy "exportacoes registra" on public.exportacoes
  for insert to authenticated
  with check (public.perfil_supervisao() and quem = auth.uid());

-- E o registro é só da equipe: supervisor vê que exportou, mas o histórico de
-- quem levou a base para fora é assunto de quem responde pela campanha.
create policy "exportacoes le" on public.exportacoes
  for select to authenticated
  using (public.perfil_equipe());

-- ── conferência ─────────────────────────────────────────────────────────────
select 'exportacoes pronta' as feito,
       (select count(*) from public.exportacoes) as registros;
