-- ============================================================================
-- Central de atendimento — a tabela que o painel lê
-- ============================================================================
--
-- Espelho local das conversas do GabiFlow, mais o que ele NÃO guarda: a
-- classificação do lead, a demanda, o município e a origem.
--
-- POR QUE ESPELHAR EM VEZ DE CONSULTAR AO VIVO. A API dele pagina de 100 em 100
-- e tem limite por minuto. Um painel que a consultasse a cada carga ficaria
-- lento, estouraria o limite com duas pessoas olhando junto, e sairia do ar
-- toda vez que o GabiFlow saísse. Espelhando, o painel lê do próprio banco e a
-- sincronização acontece em segundo plano.
--
-- Os campos vindos da API guardam o nome original (contact_name, assigned_to)
-- para ficar óbvio o que é dele e o que é nosso.

create table if not exists public.atendimentos (
  -- O id é o da conversa no GabiFlow. Assim reimportar não duplica: o upsert
  -- reconhece a mesma conversa e atualiza em vez de criar outra.
  id                bigint primary key,
  phone             text not null,
  contact_name      text,

  -- ── o que vem da API dele ────────────────────────────────────────────────
  status_conversa   text,          -- waiting · active · closed · template_pending
  department        text,          -- hoje vem "Geral" em 99% dos casos
  assigned_to       text,          -- quem foi designado
  unread_count      int default 0,
  total_messages    int default 0,
  last_message      text,
  last_message_at   timestamptz,
  criado_em         timestamptz,   -- createdAt da conversa lá
  atualizado_em     timestamptz,   -- updatedAt lá; é o que diz se precisa reler

  -- ── o que o PIE deriva ───────────────────────────────────────────────────
  -- EIXO 1: uma categoria por pessoa. A soma fecha 100%.
  status_lead       text,
  -- EIXO 2: independente do eixo 1. Zero, uma ou várias.
  demandas          text[] default '{}',
  municipio         text,
  bairro            text,
  origem            text,          -- criativo/campanha, quando a mensagem traz

  -- ── SLA: o par que separa "não respondeu" de "não atendido" ──────────────
  -- Sem estes dois, os dois casos viram o mesmo número e o pior deles some.
  primeira_msg_at   timestamptz,   -- quando a pessoa escreveu pela primeira vez
  primeira_resp_at  timestamptz,   -- quando ALGUÉM daqui respondeu (null = nunca)
  ultima_direcao    text,          -- inbound = a bola está com a gente

  respondida_por    text,          -- quem de fato respondeu (sentBy), não o designado
  mensagens_lidas   int default 0, -- quantas já foram classificadas
  sincronizado_em   timestamptz default now()
);

create index if not exists atendimentos_status_lead   on public.atendimentos (status_lead);
create index if not exists atendimentos_municipio     on public.atendimentos (municipio);
create index if not exists atendimentos_criado_em     on public.atendimentos (criado_em desc);
create index if not exists atendimentos_atualizado_em on public.atendimentos (atualizado_em desc);
-- Fila: quem escreveu e não foi respondido. É a consulta mais cara do painel e
-- a que mais importa, então ganha índice parcial próprio.
create index if not exists atendimentos_sem_resposta
  on public.atendimentos (primeira_msg_at)
  where primeira_resp_at is null;

-- ── RLS, na mesma regra do resto ────────────────────────────────────────────
-- Conversa de WhatsApp é dado pessoal: nome, telefone e o que a pessoa contou
-- da própria vida. Vale a mesma trava das lideranças — só equipe aprovada.
alter table public.atendimentos enable row level security;

drop policy if exists "atendimentos equipe ativa" on public.atendimentos;
create policy "atendimentos equipe ativa" on public.atendimentos
  for all to authenticated
  using (public.perfil_ativo())
  with check (public.perfil_ativo());

-- ── Conferência ─────────────────────────────────────────────────────────────
-- select count(*) as conversas,
--        count(*) filter (where primeira_resp_at is null) as nunca_respondidas,
--        count(*) filter (where status_lead = 'apoiador') as apoiadores
--   from public.atendimentos;

-- ============================================================================
-- EIXO ZERO: quem começou a conversa  (rodar depois da criação da tabela)
-- ============================================================================
--
-- Descoberto medindo 45 conversas reais: o mesmo WhatsApp carrega DUAS
-- operações, e somá-las estraga todo número derivado.
--
--   lead    — a pessoa escreveu primeiro (veio de anúncio ou indicação)
--   disparo — a campanha escreveu primeiro (base que já existia)
--
-- Das conversas em template_pending, 13 de 13 começaram com a campanha
-- falando. Das outras, 30 de 31 começaram com a pessoa.
--
-- Sem esta coluna, quem ignorou um disparo entra na mesma conta de quem veio
-- do tráfego e esfriou — e "não atendido", que existe para apontar falha da
-- equipe, passa a incluir gente que nunca pediu nada.

alter table public.atendimentos add column if not exists tipo text;

-- A fila de SLA só faz sentido para lead: em disparo ninguém está esperando.
create index if not exists atendimentos_tipo on public.atendimentos (tipo);

drop index if exists public.atendimentos_sem_resposta;
create index if not exists atendimentos_sem_resposta
  on public.atendimentos (primeira_msg_at)
  where primeira_resp_at is null and tipo = 'lead';
