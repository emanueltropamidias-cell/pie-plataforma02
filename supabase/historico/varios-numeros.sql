-- ============================================================================
-- SETE NÚMEROS, UMA CAIXA SÓ
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- A campanha passa a receber por vários números ao mesmo tempo, cada um com seu
-- tráfego. Dentro do PIE continua tudo num lugar só: a mesma fila, as mesmas
-- etiquetas, as mesmas meninas. O número vira uma DIMENSÃO — dá para filtrar e
-- medir por ele, e cada conversa sabe por onde entrou.
--
-- ── O ERRO QUE ISTO CONSERTA, E ELE QUEIMA CHIP ─────────────────────────────
--
-- Hoje `conversas.telefone` é ÚNICO. Com um número só, certo. Com sete, é uma
-- armadilha:
--
--   O eleitor escreve para o número 1 hoje. Amanhã vê outro anúncio e escreve
--   para o número 3. O banco tem UMA linha, com `instancia` congelada no
--   primeiro. A resposta da atendente sai pelo número 1 — para alguém que
--   acabou de falar com o 3.
--
-- A pessoa recebe mensagem de um número que nunca contatou. Ela não sabe que é
-- a mesma campanha: para ela é abordagem fria. E é exatamente esse gesto que
-- vira denúncia — que é o que mais bane número.
--
-- A identidade da conversa passa a ser O PAR: (telefone, número). O mesmo
-- eleitor pode ter duas conversas, uma por número, e cada resposta volta pelo
-- caminho por onde veio.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OS NÚMEROS COMO CADASTRO DE VERDADE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes o número era um texto solto em `conversas.instancia`. Texto solto não
-- tem nome de exibição, não tem cor, não dá para desativar, e erro de digitação
-- vira um número novo e invisível.
create table if not exists public.numeros (
  id          bigserial primary key,

  -- O que a atendente lê na tela. "Número 3 · Saúde" diz mais que "talita3".
  apelido     text not null,

  -- O telefone da campanha, só dígitos. Serve para conferência humana.
  telefone    text,

  -- A chave técnica: o nome da instância na Evolution, ou o phone_id na Meta.
  -- É por ela que o webhook reconhece de quem é a mensagem que chegou.
  instancia   text not null unique,

  -- Qual provedor atende este número. Os sete podem não ser todos iguais — um
  -- pode ir para a Cloud API no dia em que ela for possível.
  provedor    text not null default 'evolution'
                check (provedor in ('evolution', 'meta')),

  cor         text not null default '#0525f7',
  ativo       boolean not null default true,
  ordem       int not null default 100,

  -- Para onde o lead deste número vai por padrão. Permite dar um setor (e uma
  -- equipe) por número sem inventar outra regra.
  departamento_id bigint references public.departamentos(id) on delete set null,

  criado_em   timestamptz not null default now()
);

comment on table public.numeros is
  'Os números de WhatsApp da campanha. Cada conversa aponta para um.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O NÚMERO QUE JÁ EXISTE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes de mexer em `conversas`, o número atual precisa existir como linha —
-- senão a coluna nova nasce nula em 5 mil conversas e nada sabe de onde veio.
insert into public.numeros (apelido, instancia, ordem)
select 'Número 1', i, 10
  from (select distinct instancia as i from public.conversas
         where instancia is not null) x
on conflict (instancia) do nothing;

-- Conversa sem instância nenhuma (as antigas, de antes do webhook) ganham um
-- número de arquivo. Melhor um rótulo honesto do que nulo espalhado.
insert into public.numeros (apelido, instancia, ordem, ativo)
values ('Antes do WhatsApp', '__historico__', 999, false)
on conflict (instancia) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A CONVERSA APONTA PARA O NÚMERO
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversas
  add column if not exists numero_id bigint
    references public.numeros(id) on delete restrict;

update public.conversas c
   set numero_id = n.id
  from public.numeros n
 where n.instancia = coalesce(c.instancia, '__historico__')
   and c.numero_id is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A CHAVE PASSA A SER O PAR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Esta é a linha que conserta o envio pelo número errado.
--
-- A restrição antiga sai e entra a do par. Não há dado a perder: hoje só existe
-- um número, então cada telefone já é um par único — a migração não junta nem
-- separa nada. Fazer isto AGORA, com um número, é gratuito; fazer depois, com
-- sete, exigiria decidir a mão o que fazer com cada duplicata.
alter table public.conversas
  drop constraint if exists conversas_telefone_key;

drop index if exists conversas_telefone_key;

create unique index if not exists conversas_telefone_numero
  on public.conversas (telefone, numero_id);

-- Buscar "todas as conversas desta pessoa, em qualquer número" continua barato.
create index if not exists conversas_por_telefone
  on public.conversas (telefone);

-- A fila de um número específico — é o filtro que a tela vai usar.
create index if not exists conversas_por_numero
  on public.conversas (numero_id, ultima_msg_at desc)
  where encerrada_em is null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A INGESTÃO PASSA A RESPEITAR O PAR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `p_instancia` deixa de ser enfeite gravado uma vez e passa a fazer parte da
-- identidade. Se chegar uma instância que não está cadastrada, a função CRIA a
-- linha do número em vez de recusar a mensagem: perder lead pago porque alguém
-- esqueceu de cadastrar o número é o pior desfecho possível.
-- É A FUNÇÃO QUE JÁ RODA, com DUAS mudanças e nada mais:
--
--   · resolve o número a partir da instância, e grava `numero_id`;
--   · o `on conflict` passa de `(telefone)` para `(telefone, numero_id)`.
--
-- Todo o resto está idêntico de propósito — o eixo zero que separa lead de
-- disparo, a reabertura de conversa encerrada quando a pessoa volta, a trava do
-- `cadastrado_em` sobre as sugestões, os carimbos de SLA que nunca são
-- reescritos. Reescrever isso "mais limpo" no meio de uma migração é como se
-- perde comportamento que ninguém lembra de ter pedido.
create or replace function public.receber_mensagem(
  p_telefone   text,
  p_nome       text,
  p_instancia  text,
  p_wa_id      text,
  p_direcao    text,
  p_tipo       text,
  p_texto      text,
  p_resumo     text,
  p_midia_url  text,
  p_midia_mime text,
  p_duracao    int,
  p_status     text,
  p_momento    timestamptz,
  p_bruto      jsonb,
  p_municipio_sug text default null,
  p_bairro_sug    text default null,
  p_indicou       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversa   bigint;
  v_msg        bigint;
  v_conv       public.conversas%rowtype;
  v_atribuir   boolean := false;
  v_numero     bigint;
  v_chave      text := coalesce(nullif(p_instancia, ''), '__historico__');
begin
  -- 0. O NÚMERO QUE RECEBEU.
  --
  --    Se a instância não está cadastrada, CRIA em vez de recusar. Perder lead
  --    pago porque alguém esqueceu de cadastrar o número no painel é o pior
  --    desfecho possível — o cadastro se arruma depois, a mensagem não volta.
  select id into v_numero from public.numeros where instancia = v_chave;

  if v_numero is null then
    insert into public.numeros (apelido, instancia, ordem)
    values (v_chave, v_chave, 500)
    on conflict (instancia) do nothing;
    select id into v_numero from public.numeros where instancia = v_chave;
  end if;

  -- 1. A conversa. `on conflict` resolve a corrida onde ela acontece: três
  --    frases seguidas chegam quase juntas, e dois selects responderiam "não
  --    existe" ao mesmo tempo.
  --
  --    A CHAVE É O PAR (telefone, numero_id). O mesmo eleitor que escreve para
  --    dois números da campanha tem duas conversas — e cada resposta volta pelo
  --    número por onde veio, que é o que impede a pessoa de receber mensagem de
  --    um número que ela nunca contatou.
  insert into public.conversas (telefone, nome, instancia, numero_id)
  values (p_telefone, p_nome, p_instancia, v_numero)
  on conflict (telefone, numero_id) do update set
    -- O nome só é preenchido, nunca sobrescrito: quem cadastrou na mão sabia
    -- mais do que o apelido que a pessoa pôs no WhatsApp.
    nome          = coalesce(conversas.nome, excluded.nome),
    atualizado_em = now()
  returning id into v_conversa;

  -- 2. A mensagem. Se já existe, PARA AQUI — é reenvio do webhook, e seguir
  --    em frente contaria a mesma mensagem duas vezes.
  insert into public.mensagens (
    conversa_id, wa_id, telefone, direcao, tipo, texto,
    midia_url, midia_mime, duracao_seg, status, momento, bruto
  )
  values (
    v_conversa, p_wa_id, p_telefone, p_direcao, p_tipo, p_texto,
    p_midia_url, p_midia_mime, p_duracao, p_status, p_momento, p_bruto
  )
  on conflict (wa_id) do nothing
  returning id into v_msg;

  if v_msg is null then
    return jsonb_build_object('conversa_id', v_conversa, 'repetida', true, 'atribuir', false);
  end if;

  select * into v_conv from public.conversas where id = v_conversa;

  -- 3. A conversa em dia, num update só.
  update public.conversas set
    ultima_msg      = p_resumo,
    ultima_msg_at   = p_momento,
    ultima_direcao  = p_direcao,
    atualizado_em   = p_momento,
    total_mensagens = total_mensagens + 1,

    primeira_msg_at = case
      when p_direcao = 'inbound' and primeira_msg_at is null then p_momento
      else primeira_msg_at end,
    primeira_resp_at = case
      when p_direcao = 'outbound' and primeira_resp_at is null then p_momento
      else primeira_resp_at end,

    tipo = case
      when p_direcao = 'outbound' and primeira_msg_at is null and primeira_resp_at is null
      then 'disparo' else tipo end,

    -- ENCERRADA FICA ENCERRADA.
    --
    -- Aqui era `when p_direcao = 'inbound' then null` — mensagem recebida
    -- REABRIA a conversa e a jogava de volta na fila.
    --
    -- Regra do Emanuel (28/08): encerrar é uma decisão da atendente, e a
    -- mensagem seguinte do eleitor não a desfaz. O que ele manda depois chega
    -- na aba Encerradas, que passa a ser ordenada pela última mensagem — some
    -- da fila de trabalho, não da vista.
    --
    -- Sem isto, encerrar não encerrava nada: quem respondesse "obrigado" depois
    -- do atendimento pronto voltava para o topo como se fosse lead novo, e a
    -- fila nunca esvaziava.
    encerrada_em = encerrada_em,

    nome_sugerido      = case when cadastrado_em is null
                          then coalesce(nome_sugerido, nullif(p_nome, '')) else nome_sugerido end,
    municipio_sugerido = case when cadastrado_em is null
                          then coalesce(municipio_sugerido, p_municipio_sug) else municipio_sugerido end,
    bairro_sugerido    = case when cadastrado_em is null
                          then coalesce(bairro_sugerido, p_bairro_sug) else bairro_sugerido end,
    indicado_por       = coalesce(indicado_por, p_indicou)
  where id = v_conversa;

  v_atribuir := p_direcao = 'inbound' and v_conv.atendente_id is null;

  return jsonb_build_object(
    'conversa_id', v_conversa,
    'repetida',    false,
    'atribuir',    v_atribuir,
    'numero_id',   v_numero,
    'demandas',    coalesce(to_jsonb(v_conv.demandas), '[]'::jsonb),
    'nome',        v_conv.nome,
    'municipio',   v_conv.municipio
  );
end;
$$;

do $$
declare a text;
begin
  for a in select oid::regprocedure::text from pg_proc
           where proname = 'receber_mensagem' and pronamespace = 'public'::regnamespace loop
    execute format('revoke all on function %s from public, authenticated', a);
    execute format('grant execute on function %s to service_role', a);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. QUEM PODE VER A LISTA DE NÚMEROS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Toda a equipe LÊ — a atendente precisa saber por qual número a conversa
-- entrou. Só a coordenação MEXE: criar e desativar número é configuração.
alter table public.numeros enable row level security;

drop policy if exists "numeros le" on public.numeros;
create policy "numeros le" on public.numeros
  for select to authenticated
  using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()));

drop policy if exists "numeros mexe" on public.numeros;
create policy "numeros mexe" on public.numeros
  for all to authenticated
  using ((select public.perfil_supervisao()))
  with check ((select public.perfil_supervisao()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. O PAINEL POR NÚMERO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A pergunta da coordenação todo dia: qual número está recebendo, qual está
-- parado, e qual tem gente esperando. Sem isto, um número que caiu só aparece
-- quando alguém estranha o silêncio.
drop view if exists public.numeros_painel;

create view public.numeros_painel
with (security_invoker = on) as
  select
    n.id, n.apelido, n.telefone, n.instancia, n.provedor,
    n.cor, n.ativo, n.ordem, n.departamento_id,
    (select count(*) from public.conversas c
      where c.numero_id = n.id and c.encerrada_em is null)      as abertas,
    (select count(*) from public.conversas c
      where c.numero_id = n.id and c.encerrada_em is null
        and c.atendente_id is null)                             as aguardando,
    (select count(*) from public.conversas c
      where c.numero_id = n.id
        and c.primeira_msg_at > now() - interval '24 hours')    as leads_24h,
    (select max(c.ultima_msg_at) from public.conversas c
      where c.numero_id = n.id)                                 as ultima_atividade
  from public.numeros n;

revoke all on public.numeros_painel from anon;
grant select on public.numeros_painel to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- `sem_numero` tem de ser 0. Se não for, alguma conversa ficou órfã e o envio
-- dela não sabe por onde sair.
select
  (select count(*) from public.conversas where numero_id is null) as sem_numero,
  (select count(*) from public.numeros)                           as numeros,
  (select count(*) from public.numeros where ativo)               as ativos;

select apelido, instancia, provedor, ativo, abertas, aguardando, leads_24h
  from public.numeros_painel order by ordem, apelido;
