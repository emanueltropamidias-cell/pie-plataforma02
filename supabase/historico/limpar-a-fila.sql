-- ============================================================================
-- LIMPAR A FILA — O NOME ERRADO E A CONVERSA VAZIA
-- ============================================================================
--
-- ⚠️  ESTE ARQUIVO TEM DUAS PARTES. A PRIMEIRA SÓ LÊ. A SEGUNDA ESCREVE.
--
-- Rode a PARTE 1 sozinha primeiro e olhe os números. Só depois de eles fazerem
-- sentido é que se descomenta a PARTE 2.
--
-- Nada aqui APAGA. A limpeza é encerrar (a conversa sai da fila e continua no
-- histórico) e esvaziar nome errado. Os dois têm desfazer, e o desfazer está
-- escrito no fim.
--
-- ── O QUE ADOECEU A FILA ────────────────────────────────────────────────────
--
-- Dois defeitos diferentes, que juntos deixaram a caixa da Maiana ilegível:
--
-- 1. O NOME VINHA DE `pushName` SEM CONFERIR DE QUEM ERA A MENSAGEM.
--    `pushName` é o nome de quem ENVIOU. Na mensagem recebida é o eleitor — é
--    o que se quer. Na mensagem ENVIADA é o NOSSO perfil. Quando a última
--    mensagem do chat importado era nossa, o eleitor era batizado de
--    "Talita Oliveira | 1022".
--
--    E ficava: `receber_mensagem` grava o nome com
--    `coalesce(conversas.nome, excluded.nome)` — só preenche vazio, nunca
--    corrige. O nome errado não se conserta sozinho nunca mais.
--
--    Corrigido no código (`evolution.ts` e `importar-conversas.ts`). Daqui
--    para a frente nasce certo; o que já nasceu errado é o que a PARTE 2 limpa.
--
-- 2. CONVERSA `lid.` SEM CONTEÚDO. O history sync devolve o identificador
--    anônimo e nenhum telefone. Quando não veio texto junto, sobra uma linha
--    com quinze dígitos por nome e "Conversa importada do WhatsApp" por
--    conteúdo. Não dá para responder, não dá para reconhecer, e ela ocupa
--    lugar na fila de quem precisa achar o lead de hoje.
--
--    ATENÇÃO: nem toda `lid.` é lixo. Muita gente escreveu de verdade por
--    esse endereço — foram 371 leads pagos da Maiana. A PARTE 2 encerra
--    SOMENTE as que não têm nenhuma mensagem recebida com texto.

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 1 — DIAGNÓSTICO (só lê; rode esta primeiro, sozinha)
-- ═════════════════════════════════════════════════════════════════════════════

select '1. NOME ERRADO' as bloco,
       coalesce(c.nome, '(sem nome)') as item,
       count(*)::text as quantidade
  from public.conversas c
 where c.nome is not null
   and exists (
     select 1 from public.numeros n
      where lower(trim(n.apelido)) = lower(trim(c.nome))
   )
 group by c.nome

union all

-- O nome que o painel mostra hoje. Se "Talita Oliveira | 1022" não estiver na
-- lista de cima, é porque ele não bate com nenhum apelido de `numeros` — e aí
-- é este bloco que mostra em quantas conversas ele está.
select '2. NOME = PERFIL DA CAMPANHA',
       c.nome,
       count(*)::text
  from public.conversas c
 where c.nome ilike '%talita%oliveira%'
    or c.nome ilike '%1022%'
 group by c.nome

union all

select '3. LID SEM CONTEUDO (encerraria)',
       'sem nenhuma mensagem recebida com texto',
       count(*)::text
  from public.conversas c
 where c.telefone like 'lid.%'
   and c.encerrada_em is null
   and not exists (
     select 1 from public.mensagens m
      where m.conversa_id = c.id
        and m.direcao = 'inbound'
        and coalesce(trim(m.texto), '') <> ''
   )

union all

select '4. LID COM CONTEUDO (PRESERVA)',
       'gente que escreveu de verdade — nao encosta',
       count(*)::text
  from public.conversas c
 where c.telefone like 'lid.%'
   and c.encerrada_em is null
   and exists (
     select 1 from public.mensagens m
      where m.conversa_id = c.id
        and m.direcao = 'inbound'
        and coalesce(trim(m.texto), '') <> ''
   )

 order by 1, 2;

-- ═════════════════════════════════════════════════════════════════════════════
-- PARTE 2 — A LIMPEZA (escreve; descomente só depois de ler a PARTE 1)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Descomente removendo o `/*` e o `*/`.

/*

-- ── 2a. ESVAZIAR O NOME QUE É NOSSO ────────────────────────────────────────
--
-- Vazio, e não "Desconhecido": vazio a ficha mostra o telefone e a atendente
-- preenche no primeiro contato. Um rótulo inventado seria só outro nome errado,
-- e desta vez posto por mim.
update public.conversas c
   set nome = null,
       nome_sugerido = null
 where c.nome is not null
   and (
     exists (
       select 1 from public.numeros n
        where lower(trim(n.apelido)) = lower(trim(c.nome))
     )
     or c.nome ilike '%talita%oliveira%'
     or c.nome ilike '%1022%'
   )
   -- Cadastro na mão NÃO se toca: ali o nome foi conferido por gente.
   and c.cadastrado_em is null;

-- ── 2b. ENCERRAR A CONVERSA LID SEM CONTEÚDO ───────────────────────────────
--
-- `encerrada_em` tira da fila e de Aguardando, e mantém tudo no histórico e nas
-- métricas. Não é apagar — é parar de pedir atenção para uma linha que ninguém
-- consegue atender.
update public.conversas c
   set encerrada_em = now(),
       atualizado_em = now()
 where c.telefone like 'lid.%'
   and c.encerrada_em is null
   and c.cadastrado_em is null
   and not exists (
     select 1 from public.mensagens m
      where m.conversa_id = c.id
        and m.direcao = 'inbound'
        and coalesce(trim(m.texto), '') <> ''
   );

*/

-- ═════════════════════════════════════════════════════════════════════════════
-- DESFAZER (se a limpeza tirar algo que fazia falta)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- O nome esvaziado não volta — ele estava errado, e o certo é a atendente
-- digitar. Já as conversas encerradas voltam inteiras:
--
--   update public.conversas
--      set encerrada_em = null
--    where telefone like 'lid.%'
--      and encerrada_em >= now() - interval '1 hour';
--
-- A janela de uma hora existe para não ressuscitar conversa que a equipe
-- encerrou de propósito antes disto.
