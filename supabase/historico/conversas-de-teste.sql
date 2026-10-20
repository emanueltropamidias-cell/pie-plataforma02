-- ============================================================================
-- DUAS CONVERSAS DE MENTIRA — para ver a caixa funcionando antes do VPS
-- ============================================================================
--
-- Rode logado no SQL Editor. Cria duas conversas com mensagens, atribui uma a
-- você e deixa a outra esperando há horas, sem dono — que é o caso que a fila
-- foi desenhada para gritar.
--
-- Os telefones começam com 55 71 9 0000, que não existe. Nada é enviado: isto
-- escreve direto no banco, sem passar pelo WhatsApp.
--
-- Para apagar tudo depois, o comando está no fim do arquivo.

do $$
declare
  v_eu    uuid;
  v_c1    bigint;
  v_c2    bigint;
  v_agora timestamptz := now();
begin
  -- Pega o primeiro admin ativo. Se você tem conta de atendente para teste,
  -- troque o e-mail aqui para a conversa cair na fila dela.
  select id into v_eu from public.profiles
   where status = 'ativo' and role = 'admin'
   order by created_at limit 1;

  -- ── 1. Uma conversa COM você, andando bem ────────────────────────────────
  insert into public.conversas (
    telefone, nome, tipo, status_lead, demandas, municipio, bairro,
    primeira_msg_at, primeira_resp_at, ultima_direcao,
    atendente_id, atribuido_em,
    nome_sugerido, municipio_sugerido, bairro_sugerido, indicado_por,
    ultima_msg, ultima_msg_at, total_mensagens
  ) values (
    '5571900001111', 'Maria de Souza', 'lead', 'apoiador', array['material'],
    'Feira de Santana', 'Tomba',
    v_agora - interval '38 min', v_agora - interval '35 min', 'inbound',
    v_eu, v_agora - interval '35 min',
    'Maria de Souza', 'Feira de Santana', 'Tomba', 'Cleide Rocha',
    'Pode me mandar o material pra eu levar na igreja?', v_agora - interval '3 min', 4
  )
  on conflict (telefone) do update set ultima_msg_at = excluded.ultima_msg_at
  returning id into v_c1;

  insert into public.mensagens (conversa_id, wa_id, telefone, direcao, tipo, texto, momento) values
    (v_c1, 'teste-1-a', '5571900001111', 'inbound',  'texto', 'Oii Talita! Vim pela indicação de Cleide Rocha. 💙', v_agora - interval '38 min'),
    (v_c1, 'teste-1-b', '5571900001111', 'outbound', 'texto', 'Oi, Maria! Que bom te ver por aqui 💙 De qual cidade você fala com a gente?', v_agora - interval '35 min'),
    (v_c1, 'teste-1-c', '5571900001111', 'inbound',  'texto', 'Sou de Feira de Santana, bairro Tomba', v_agora - interval '30 min'),
    (v_c1, 'teste-1-d', '5571900001111', 'inbound',  'texto', 'Pode me mandar o material pra eu levar na igreja?', v_agora - interval '3 min')
  on conflict (wa_id) do nothing;

  -- ── 2. Uma SEM DONO, esperando há 4 horas ────────────────────────────────
  --
  -- É o estado que o painel chama de "não atendido": verba paga, pessoa
  -- esperando, e falha nossa. Na fila ela sobe ao topo, em laranja.
  insert into public.conversas (
    telefone, nome, tipo, municipio, ultima_direcao,
    primeira_msg_at, primeira_resp_at,
    nome_sugerido, indicado_por,
    ultima_msg, ultima_msg_at, total_mensagens
  ) values (
    '5571900002222', 'João Batista', 'lead', 'Juazeiro', 'inbound',
    v_agora - interval '4 hours 12 min', null,
    'João Batista', 'Cleide Rocha',
    'Oii Talita! Vim pela indicação de Cleide Rocha 💙', v_agora - interval '4 hours 12 min', 1
  )
  on conflict (telefone) do update set ultima_msg_at = excluded.ultima_msg_at
  returning id into v_c2;

  insert into public.mensagens (conversa_id, wa_id, telefone, direcao, tipo, texto, momento) values
    (v_c2, 'teste-2-a', '5571900002222', 'inbound', 'texto', 'Oii Talita! Vim pela indicação de Cleide Rocha 💙', v_agora - interval '4 hours 12 min')
  on conflict (wa_id) do nothing;
end $$;

-- ── O que você deve ver em /caixa ───────────────────────────────────────────
select
  case when atendente_id is null then '>>> SEM DONO — sobe ao topo, em laranja'
       else 'com você — aba "Minhas"' end as onde_aparece,
  nome, municipio, total_mensagens as mensagens,
  case when primeira_resp_at is null
       then 'ninguém respondeu há ' || date_trunc('minute', now() - primeira_msg_at)::text
       else 'respondida' end as sla
from public.conversas
where telefone in ('5571900001111', '5571900002222');

-- ── Para apagar depois ──────────────────────────────────────────────────────
-- delete from public.conversas where telefone in ('5571900001111','5571900002222');
-- (as mensagens vão junto, por cascata)
