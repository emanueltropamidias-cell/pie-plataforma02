-- ============================================================================
-- MENSAGEM EDITADA GUARDA O QUE FOI DITO ANTES
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- A edição de mensagem entrou hoje e sobrescrevia `texto`. O original sumia —
-- do banco, da tela e do relatório.
--
-- Numa campanha isso não é detalhe. O que a equipe disse a um eleitor em nome
-- da candidata é registro: se alguém prometer o que não pode, ou trocar o
-- número de urna, a supervisão precisa ver O QUE FOI DITO, e não só a versão
-- corrigida. Do lado do eleitor a mensagem antiga existiu — ele leu, pode ter
-- printado. Apagar do nosso lado só cega quem coordena.
--
-- ── POR QUE TRÊS COLUNAS, E NÃO UMA TABELA DE HISTÓRICO ─────────────────────
--
-- O WhatsApp permite editar VÁRIAS vezes dentro dos 15 minutos, então uma
-- tabela guardaria cada versão. Mas a pergunta da supervisão é uma só: "o que
-- foi dito ANTES de corrigirem?". O primeiro texto responde isso; os
-- intermediários são rascunho de quem estava consertando.
--
-- `coalesce` na hora de gravar é o que garante isso: a primeira edição guarda o
-- original, as seguintes não sobrescrevem. Sem ele, editar duas vezes deixaria
-- guardada a penúltima versão — que não é o que ninguém quer saber.

alter table public.mensagens
  add column if not exists texto_original text,
  add column if not exists editada_em     timestamptz,
  add column if not exists editada_por    uuid references public.profiles(id) on delete set null;

comment on column public.mensagens.texto_original is
  'O texto como saiu na PRIMEIRA vez. Preenchido só na primeira edição — as seguintes não sobrescrevem, senão guardaria a penúltima versão em vez da original.';

-- ── DOIS ÍNDICES, POR MOTIVOS DIFERENTES ────────────────────────────────────
--
-- 1. A PERGUNTA DA SUPERVISÃO: "o que foi editado hoje". Sem ele é varredura em
--    `mensagens`, a tabela que mais cresce nesta base.
--
--    PARCIAL de propósito: quase toda mensagem nunca foi editada, e um índice
--    cheio guardaria centenas de milhares de linhas nulas para achar dezenas.
create index if not exists mensagens_editadas
  on public.mensagens (editada_em desc)
  where editada_em is not null;

-- 2. A CHAVE ESTRANGEIRA. O Postgres NÃO indexa FK sozinho — é a pegadinha
--    clássica, e aqui ela morde de um jeito específico: `editada_por` é
--    `on delete set null`, então excluir uma conta faz o banco procurar as
--    mensagens dela. Sem índice, isso é varredura na maior tabela, com lock, e
--    a tela de excluir usuário fica pendurada.
--
--    Também parcial: só interessa quem editou alguma coisa.
create index if not exists mensagens_editada_por
  on public.mensagens (editada_por)
  where editada_por is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Ainda deve vir vazio: a coluna nasce agora, e o que foi editado antes dela
-- existir perdeu o original — não há de onde recuperar.
select count(*) filter (where editada_em is not null) as editadas,
       count(*) filter (where texto_original is not null) as com_original,
       count(*) as mensagens_no_total
  from public.mensagens;
