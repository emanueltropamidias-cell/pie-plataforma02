-- ============================================================================
-- O LINK GANHA ARTE E LIDERANÇAS
-- ============================================================================
--
-- Rode DEPOIS de `links-de-qr.sql`. Pode rodar de novo sem medo.
--
-- ── DUAS COISAS ─────────────────────────────────────────────────────────────
--
-- 1. ARTE. O card que a pessoa compartilha no status e no grupo é imagem, não
--    link: a foto dos candidatos com o QR em cima. A arte muda a cada material
--    — dobradinha com um, dobradinha com outro — então ela é do LINK, e sobe
--    pela tela.
--
-- 2. LIDERANÇAS. A mesma dobradinha é espalhada por dezenas de pessoas. Sem
--    separar, no fim do mês há um número só e ninguém sabe quem trouxe o quê —
--    e é exatamente essa informação que decide onde a campanha põe esforço.
--
--    Cada liderança ganha um endereço próprio: `/l/dobradinha/joao`. Mesmo
--    destino, contagem separada.

alter table public.links
  -- Caminho no balde `materiais`. Nulo = card sem arte, só o QR — que continua
  -- servindo para imprimir.
  add column if not exists arte text;

create table if not exists public.link_lideres (
  id bigserial primary key,
  link_id bigint not null references public.links(id) on delete cascade,

  nome text not null,

  -- O que entra na URL depois do slug do link. Curto e ditável, pelo mesmo
  -- motivo do slug: quando a câmera não pega, alguém digita.
  codigo text not null check (codigo ~ '^[a-z0-9-]{2,30}$'),

  -- Opcional: liga a liderança que já existe na base, quando é a mesma pessoa.
  -- Nulo é normal — muita gente que espalha material não está cadastrada.
  lideranca_id uuid references public.liderancas(id) on delete set null,

  criado_em timestamptz not null default now(),

  -- O código é único DENTRO do link, e não no sistema: "joao" pode espalhar a
  -- dobradinha e também o santinho, e são duas contagens diferentes.
  unique (link_id, codigo)
);

create index if not exists link_lideres_por_link
  on public.link_lideres (link_id);

-- Quem trouxe a leitura. Nulo = leram o QR do material geral, sem liderança.
alter table public.link_leituras
  add column if not exists lider_id bigint references public.link_lideres(id) on delete set null;

-- O Postgres NÃO indexa chave estrangeira sozinho, e esta é `on delete set
-- null`: apagar uma liderança faria o banco varrer as leituras inteiras. Parcial
-- porque a maioria das leituras não tem liderança.
create index if not exists link_leituras_por_lider
  on public.link_leituras (lider_id)
  where lider_id is not null;

alter table public.link_lideres enable row level security;

drop policy if exists "lideres le" on public.link_lideres;
create policy "lideres le" on public.link_lideres
  for select to authenticated
  using ((select public.perfil_supervisao()));

drop policy if exists "lideres mexe" on public.link_lideres;
create policy "lideres mexe" on public.link_lideres
  for all to authenticated
  using ((select public.perfil_supervisao()))
  with check ((select public.perfil_supervisao()));

-- ── conferência ─────────────────────────────────────────────────────────────
select l.slug,
       l.nome,
       (l.arte is not null) as tem_arte,
       count(distinct d.id)  as liderancas,
       count(x.id)           as leituras
  from public.links l
  left join public.link_lideres d on d.link_id = l.id
  left join public.link_leituras x on x.link_id = l.id
 group by l.id, l.slug, l.nome, l.arte, l.criado_em
 order by l.criado_em desc;
