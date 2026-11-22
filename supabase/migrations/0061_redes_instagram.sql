-- ============================================================================
-- REDES SOCIAIS: INSTAGRAM DOS POLÍTICOS
-- ============================================================================
--
-- Em 22/11/2026 o Emanuel pediu o "Dossiê do mandato": um relatório por
-- deputado que cruza o território (votos do TSE) com as redes sociais. O
-- Instagram vem da API da Meta (business_discovery), o mesmo token do
-- tráfego, lido só no servidor (src/app/api/redes/instagram/route.ts).
--
--   redes_perfis   quem acompanhamos: o candidato do TSE e o @ dele
--   redes_fotos    uma linha por perfil por dia — é o histórico de seguidores
--                  que a API NÃO guarda; começa a existir a partir da 1ª coleta
--   redes_posts    os últimos posts de cada perfil, atualizados a cada coleta
--
-- `candidato` é o sequencial do TSE (o mesmo id de .cache/eleicao-arquivos/
-- <ano>/c/<id>.json), em texto. Um perfil pode existir sem candidato (ex.: um
-- concorrente que não é deputado) — por isso não é chave.
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.redes_perfis (
  usuario      text primary key check (usuario = lower(usuario) and usuario !~ '^@'),
  candidato    text,
  ano          int,
  uf           text,
  nome         text not null,
  partido      text,
  grupo        text,        -- 'reeleito' | 'suplente' | 'novato' | outro rótulo livre
  conferido    boolean not null default false,  -- o @ foi conferido por uma pessoa
  ig_id        text,        -- id do Instagram, preenchido na 1ª coleta
  ultima_coleta timestamptz,
  ultimo_erro  text,
  criado_em    timestamptz not null default now()
);

create index if not exists redes_perfis_candidato on public.redes_perfis (candidato);

create table if not exists public.redes_fotos (
  usuario     text not null references public.redes_perfis (usuario) on delete cascade,
  dia         date not null,
  seguidores  int,
  seguindo    int,
  posts       int,
  primary key (usuario, dia)
);

create table if not exists public.redes_posts (
  id          text primary key,
  usuario     text not null references public.redes_perfis (usuario) on delete cascade,
  publicado_em timestamptz not null,
  tipo        text,         -- IMAGE | VIDEO | CAROUSEL_ALBUM
  produto     text,         -- FEED | REELS | ...
  legenda     text,
  curtidas    int,          -- null quando o perfil esconde curtidas
  comentarios int,
  link        text,
  -- preenchidos pela leitura da IA (passo da narrativa), não pela coleta:
  temas       text[],
  cidades     text[],
  atualizado_em timestamptz not null default now()
);

create index if not exists redes_posts_usuario_data on public.redes_posts (usuario, publicado_em desc);

-- ── Acesso ──────────────────────────────────────────────────────────────────
-- Leitura: qualquer conta ativa (é dado público). Escrita: só o servidor, com a
-- chave de serviço — a coleta roda na rota, nunca no navegador.
alter table public.redes_perfis enable row level security;
alter table public.redes_fotos  enable row level security;
alter table public.redes_posts  enable row level security;

drop policy if exists "redes_perfis ler" on public.redes_perfis;
create policy "redes_perfis ler" on public.redes_perfis
  for select to authenticated using ((select public.perfil_ativo()));

drop policy if exists "redes_fotos ler" on public.redes_fotos;
create policy "redes_fotos ler" on public.redes_fotos
  for select to authenticated using ((select public.perfil_ativo()));

drop policy if exists "redes_posts ler" on public.redes_posts;
create policy "redes_posts ler" on public.redes_posts
  for select to authenticated using ((select public.perfil_ativo()));

-- ── Conferência ─────────────────────────────────────────────────────────────
select 'redes_perfis' as tabela, count(*) from public.redes_perfis
union all select 'redes_fotos', count(*) from public.redes_fotos
union all select 'redes_posts', count(*) from public.redes_posts;
