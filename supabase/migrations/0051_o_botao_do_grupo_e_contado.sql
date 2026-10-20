-- ============================================================================
-- O BOTÃO DO GRUPO VIRA UM LINK CONTADO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo: só insere uma linha, e só se ela
-- ainda não existir.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 29/09, Emanuel: "metrifique o botão de ir para o grupo do whatsapp".
--
-- O Pixel da Meta já avisa esse clique, mas o Pixel só responde dentro do
-- painel da Meta e só conta quem o deixa carregar — bloqueador de anúncio,
-- modo privado e as travas do iPhone comem uma fatia que ninguém consegue
-- medir justamente porque ela não chega. Contagem própria é a fonte de
-- verdade; a da Meta serve para o anúncio aprender.
--
-- ── POR QUE UM `links`, E NÃO UMA TABELA NOVA ───────────────────────────────
--
-- Porque tudo que essa contagem precisa já existe aqui, e foi escrito depois
-- de errar:
--
--   · `link_leituras.robo`      — o robô de prévia do WhatsApp abre o link
--                                 sozinho quando alguém o cola num grupo
--   · `link_leituras.impressao` — a mesma pessoa tocando duas vezes é uma
--   · `placar_qr()`             — conta PESSOAS distintas e "hoje" no fuso da
--                                 Bahia, e não no UTC da Vercel
--   · a tela de Links           — já desenha tudo isso
--
-- Tabela nova significaria reescrever as quatro coisas e, um dia, discordar
-- delas. A categoria "Site /1022" separa esta linha dos QR impressos na tela,
-- que é a única coisa que precisava ser diferente.
--
-- ── O `destino` AQUI É A FONTE DA VERDADE, E NÃO UM RÓTULO ──────────────────
--
-- A página /1022 passa a LER o endereço do grupo desta linha. Antes ele estava
-- escrito dentro do código da página, e isso ia quebrar sozinho: grupo de
-- WhatsApp trava em 1.024 pessoas, e o link do grupo cheio para de aceitar
-- entrada SEM avisar quem clicou. No dia em que isso acontecer, trocar o
-- endereço passa a ser editar um campo na tela de Links — não um deploy.
--
-- Por isso `do nothing` no conflito: se a equipe já trocou o destino, rodar
-- este arquivo de novo não pode devolver o grupo velho.

insert into public.links (slug, nome, destino, ativo, categoria)
values (
  'grupo-1022',
  'Grupo do WhatsApp — página /1022',
  'https://chat.whatsapp.com/FWGmkA7uEgL7gj16QSmshK',
  true,
  'Site /1022'
)
on conflict (slug) do nothing;

comment on column public.link_leituras.referencia is
  'De onde veio a abertura. Nos QR de dobradinha é o código da liderança que espalhou; na página /1022 é qual botão a pessoa tocou (barra fixa ou botão do meio). Não confundir com `lider_id`: `placar_qr` agrupa liderança por ele, e nunca por este campo.';

-- ── conferência ─────────────────────────────────────────────────────────────
select l.slug, l.nome, l.ativo, l.categoria, l.destino,
       (select count(*) from public.link_leituras x where x.link_id = l.id) as leituras
  from public.links l where l.slug = 'grupo-1022';
