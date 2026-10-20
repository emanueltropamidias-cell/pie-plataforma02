-- ============================================================================
-- RESPONDER CITANDO A MENSAGEM
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO IMPORTA AQUI ───────────────────────────────────────────────
--
-- O eleitor manda três coisas seguidas — o nome, a cidade e um pedido — e a
-- menina responde uma. Sem citar, a resposta chega solta e ele não sabe a qual
-- das três ela se refere. No WhatsApp isso se resolve marcando a mensagem, e é
-- o gesto que todo mundo já faz; faltava só no PIE.
--
-- E vale nos dois sentidos: quando o eleitor cita uma mensagem NOSSA, saber
-- qual é a diferença entre "não" e "não" a uma pergunta específica.
--
-- ── A COLUNA GUARDA O ENDEREÇO, E NÃO O TEXTO ───────────────────────────────
--
-- `responde_wa_id` aponta para o `wa_id` da mensagem citada. Guardar uma CÓPIA
-- do texto citado seria mais simples de desenhar, e mentiria: mensagem editada
-- passaria a mostrar o texto velho na citação e o novo na origem, na mesma
-- tela. Com o endereço, a citação acompanha a edição.
--
-- Nulo é o normal: a maioria das mensagens não cita ninguém.

alter table public.mensagens
  add column if not exists responde_wa_id text;

comment on column public.mensagens.responde_wa_id is
  'O wa_id da mensagem que esta cita. Endereço, e não cópia do texto: assim a citação acompanha a edição do original.';

-- A tela desenha a citação buscando a mensagem original pelo `wa_id` DENTRO da
-- conversa aberta. Sem índice, é varredura nas 21 mil mensagens a cada bolha
-- com citação.
create index if not exists mensagens_por_wa_id
  on public.mensagens (wa_id)
  where wa_id is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
select count(*)                                        as mensagens,
       count(*) filter (where responde_wa_id is not null) as com_citacao
  from public.mensagens;
