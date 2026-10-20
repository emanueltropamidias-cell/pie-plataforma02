-- ============================================================================
-- A JANELA DE 24 HORAS DA CLOUD API
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO PASSOU A EXISTIR ───────────────────────────────────────────
--
-- No WhatsApp oficial, a campanha só escreve texto livre DENTRO DE 24 HORAS a
-- contar da última mensagem que a PESSOA mandou. Resposta da campanha não
-- reabre o relógio; só a pessoa reabre.
--
-- Passou disso, a Meta recusa. O único caminho é um template aprovado antes, e
-- cada um custa dinheiro.
--
-- A tela precisa avisar ANTES de a atendente digitar. Para isso ela precisa
-- saber QUANDO ENTROU a última mensagem recebida — e essa informação não
-- existia: `ultima_msg_at` é da última mensagem QUALQUER, e quando a última foi
-- da campanha ela não diz nada sobre a janela.
--
-- ── POR QUE UMA COLUNA, E NÃO UMA CONSULTA ──────────────────────────────────
--
-- Dava para perguntar `max(momento) where direcao='inbound'` a cada abertura da
-- caixa. A 400 conversas por tela, é uma varredura em `mensagens` por linha
-- exibida — a tabela que mais cresce, mil por dia. A coluna é escrita uma vez
-- por mensagem recebida e lida de graça depois.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A COLUNA
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversas
  add column if not exists ultima_entrada_at timestamptz;

comment on column public.conversas.ultima_entrada_at is
  'Momento da última mensagem RECEBIDA. É o que abre a janela de 24h da Cloud API.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O GATILHO QUE A MANTÉM EM DIA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Gatilho, e não alteração da `receber_mensagem`: a função de ingestão é grande
-- e roda em cada mensagem: mexer nela para isto é risco desproporcional. O
-- gatilho também pega a mensagem que entrar por qualquer outro caminho.
--
-- `greatest` com o valor atual porque mensagem pode chegar FORA DE ORDEM — a
-- Meta reenvia webhook que falhou, e um reenvio antigo não pode fazer a janela
-- andar para trás.
create or replace function public.conversa_marca_entrada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.direcao = 'inbound' then
    update public.conversas
       set ultima_entrada_at = greatest(
             coalesce(ultima_entrada_at, new.momento),
             new.momento
           )
     where id = new.conversa_id;
  end if;
  return new;
end $$;

drop trigger if exists conversa_marca_entrada on public.mensagens;
create trigger conversa_marca_entrada
  after insert on public.mensagens
  for each row execute function public.conversa_marca_entrada();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. PREENCHER O QUE JÁ EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sem isto, toda conversa antiga aparece como "janela fechada" — inclusive as
-- que estão abertas. Uma varredura só, agora, e nunca mais.
update public.conversas c
   set ultima_entrada_at = m.ultimo
  from (
    select conversa_id, max(momento) as ultimo
      from public.mensagens
     where direcao = 'inbound'
     group by conversa_id
  ) m
 where m.conversa_id = c.id
   and c.ultima_entrada_at is distinct from m.ultimo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O ÍNDICE PARA "QUEM ESTÁ PARA FECHAR"
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A pergunta que a supervisão vai fazer todo dia: quais conversas abertas estão
-- perto das 24 horas? É lá que se perde lead pago — depois disso, retomar custa.
create index if not exists conversas_janela
  on public.conversas (ultima_entrada_at desc)
  where encerrada_em is null;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  count(*)                                                as conversas,
  count(ultima_entrada_at)                                as com_entrada,
  count(*) filter (
    where encerrada_em is null
      and ultima_entrada_at > now() - interval '24 hours'
  )                                                       as janela_aberta,
  count(*) filter (
    where encerrada_em is null
      and (ultima_entrada_at is null
           or ultima_entrada_at <= now() - interval '24 hours')
  )                                                       as janela_fechada
  from public.conversas;
