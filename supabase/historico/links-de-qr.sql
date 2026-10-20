-- ============================================================================
-- LINKS DE QR — O DESTINO TROCA, O IMPRESSO FICA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── POR QUE NÃO APONTAR O QR DIRETO PARA O DESTINO ──────────────────────────
--
-- QR impresso é definitivo. Santinho, banner, adesivo de carro — depois de
-- rodar a gráfica, ninguém reimprime.
--
-- E o destino MUDA. Se o QR levar direto para `wa.me/5571...` e aquele chip
-- cair — o que já aconteceu três vezes nesta campanha — todo material vira
-- lixo. Se levar para a página da dobradinha e a dobradinha mudar de endereço,
-- idem.
--
-- Com uma ponte no meio, o papel aponta para o PIE e o PIE aponta para onde a
-- coordenação quiser, hoje e daqui a um mês. O impresso não precisa saber.
--
-- ── E O SEGUNDO MOTIVO, QUE É MÉTRICA ───────────────────────────────────────
--
-- QR direto não conta nada. Ninguém sabe se o banner do comício trouxe dez ou
-- mil pessoas, e no ano que vem a decisão de imprimir de novo é no chute.
--
-- Pela ponte, cada leitura é uma linha. Dá para comparar material com material.

create table if not exists public.links (
  id bigserial primary key,

  -- O que vai no QR e na URL: `/l/dobradinha`. Curto porque também é digitado
  -- à mão por quem não consegue ler o código — e porque cabe embaixo do QR
  -- impresso, que é o que salva quando a câmera não pega.
  slug text not null unique
    check (slug ~ '^[a-z0-9-]{2,40}$'),

  -- Para a coordenação achar na lista. "Dobradinha Talita e Neto — banner do
  -- comício" diz mais que `dobradinha-2`.
  nome text not null,

  -- Pode nascer VAZIO. É o ponto de tudo isto: imprime-se o QR antes de a
  -- dobradinha existir, e o destino entra depois. Enquanto vazio, quem lê cai
  -- numa página dizendo que ainda não está no ar — melhor que erro 404, que a
  -- pessoa lê como "material falso".
  destino text,

  ativo boolean not null default true,

  criado_por uuid references public.profiles(id) on delete set null,
  criado_em  timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- ── CADA LEITURA É UMA LINHA ────────────────────────────────────────────────
--
-- Tabela separada, e não um contador na linha do link: contador diz "500" e não
-- diz QUANDO. O que decide reimprimir é a curva — se as 500 foram no dia do
-- comício ou pingando ao longo do mês.
create table if not exists public.link_leituras (
  id bigserial primary key,
  link_id bigint not null references public.links(id) on delete cascade,
  em timestamptz not null default now(),
  -- Sem IP e sem nada que identifique pessoa. Para "o material funcionou?"
  -- basta contar; guardar mais seria dado pessoal sem uso.
  referencia text
);

create index if not exists link_leituras_por_link
  on public.link_leituras (link_id, em desc);

-- ── QUEM MEXE ───────────────────────────────────────────────────────────────
--
-- Ler o link é PÚBLICO por construção: quem escaneia o QR não tem conta. Por
-- isso a rota de redirecionamento usa a chave de serviço no servidor, e a
-- tabela fica fechada para o navegador.
alter table public.links enable row level security;
alter table public.link_leituras enable row level security;

drop policy if exists "links le" on public.links;
create policy "links le" on public.links
  for select to authenticated
  using ((select public.perfil_supervisao()));

drop policy if exists "links mexe" on public.links;
create policy "links mexe" on public.links
  for all to authenticated
  using ((select public.perfil_supervisao()))
  with check ((select public.perfil_supervisao()));

drop policy if exists "leituras le" on public.link_leituras;
create policy "leituras le" on public.link_leituras
  for select to authenticated
  using ((select public.perfil_supervisao()));

-- ── conferência ─────────────────────────────────────────────────────────────
select l.slug,
       l.nome,
       coalesce(l.destino, '(ainda sem destino)') as destino,
       l.ativo,
       count(x.id) as leituras
  from public.links l
  left join public.link_leituras x on x.link_id = l.id
 group by l.id, l.slug, l.nome, l.destino, l.ativo, l.criado_em
 order by l.criado_em desc;
