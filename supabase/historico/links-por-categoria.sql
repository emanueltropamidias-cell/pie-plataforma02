-- ============================================================================
-- CADA QR SABE DE QUE MATERIAL ELE É
-- ============================================================================
--
-- Rode DEPOIS de `links-com-arte-e-lideres.sql`. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- A campanha vai ter dezenas de QR: dobradinha com Manassés, dobradinha com o
-- PR, panfleto do bairro, banner do comício, adesivo de carro, o do santinho.
-- E cada um espalhado por dezenas de lideranças.
--
-- Numa lista corrida isso vira uma parede em uma semana. Quem procura "o QR do
-- banner" rola vinte cartões iguais, e na dúvida cria outro — e aí existem dois
-- QR para a mesma coisa, com a contagem partida em dois.
--
-- A categoria é o que agrupa. Não é enfeite: é o que faz a tela continuar
-- legível no vigésimo material.
--
-- ── POR QUE TEXTO LIVRE, E NÃO LISTA FECHADA ────────────────────────────────
--
-- Campanha inventa material a semana inteira. Lista fechada obrigaria a mexer
-- no código a cada ideia nova, e enquanto isso a pessoa jogaria tudo em
-- "Outros" — que é como a categoria morre.
--
-- A tela sugere as que já existem, então na prática elas se padronizam
-- sozinhas: quem digita "Panfleto" na segunda vez escolhe da lista.

alter table public.links
  add column if not exists categoria text;

comment on column public.links.categoria is
  'Agrupa os QR por material — Dobradinha, Panfleto, Banner, Adesivo. Texto livre porque a campanha inventa material toda semana; a tela sugere as que já existem para padronizar sozinho.';

-- A tela agrupa por aqui e ordena dentro do grupo. Sem índice é varredura a
-- cada abertura — barato hoje com um punhado de links, caro no dia em que
-- forem duzentos.
create index if not exists links_por_categoria
  on public.links (categoria, criado_em desc);

-- ── conferência ─────────────────────────────────────────────────────────────
select coalesce(categoria, '(sem categoria)') as categoria,
       count(*) as materiais
  from public.links
 group by 1
 order by 2 desc;
