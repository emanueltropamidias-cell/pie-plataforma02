-- ============================================================================
-- SESSÃO DE AGENDA NÃO VIRA NÚMERO DA CAMPANHA, E NÃO ENTRA NA CAIXA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca duas funções.
--
-- ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
--
-- 28/09. A tela de "Puxar agenda" cria instâncias temporárias com o prefixo
-- `agenda_`, para ler a agenda de um aparelho convidado e desfazer a conexão
-- em seguida.
--
-- Mas duas funções do banco criam número da campanha sozinhas quando veem
-- instância desconhecida:
--
--   `marcar_conexao`   — ao receber o estado da conexão
--   `receber_mensagem` — ao receber uma mensagem
--
-- Esse comportamento está CERTO para chip de campanha, e o comentário original
-- explica por quê: perder lead pago porque alguém esqueceu de cadastrar o
-- número no painel é o pior desfecho possível.
--
-- Está errado para sessão de agenda. O resultado, medido:
--
--   · 5 sessões viraram linha em `numeros` e apareceram na tela de Números,
--     com seletor de atendente e botão de QR, misturadas aos 19 chips reais
--   · 6 CONVERSAS PARTICULARES do Emanuel entraram na caixa de atendimento —
--     "India❤️", "Luana Robledo", "Jonatas" — com 38 mensagens, todas abertas,
--     e uma já atribuída a uma atendente
--
-- A rota já apontava o webhook das instâncias de agenda para um ralo
-- (/api/whatsapp/descartar), mas isso protege só o que passa pelo PIE. A
-- Evolution também avisa por outros caminhos, e o banco aceitava.
--
-- ── A TRAVA MORA NO BANCO, E NÃO NA ROTA ────────────────────────────────────
--
-- Porque é a última porta. Rota se esquece de chamar, webhook se reconfigura,
-- e o prefixo `agenda_` pode chegar por um caminho que ninguém previu. A
-- função que GRAVA é a única que vê todos eles.

-- ── 1. O estado da conexão não cria número de agenda ────────────────────────
create or replace function public.marcar_conexao(p_instancia text, p_estado text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_antes text;
  v_novo  text := lower(coalesce(nullif(trim(p_estado), ''), 'desconhecido'));
  v_id    bigint;
begin
  if coalesce(p_instancia, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem instancia');
  end if;

  -- Sessão de agenda de aparelho convidado. Ela existe por minutos, não tem
  -- dona, não atende ninguém e não pode aparecer na tela de Números.
  if p_instancia like 'agenda\_%' then
    return jsonb_build_object('ok', true, 'motivo', 'sessao de agenda, ignorada');
  end if;

  select id, conexao into v_id, v_antes
    from public.numeros where instancia = p_instancia;

  if v_id is null then
    insert into public.numeros (apelido, instancia, ordem, conexao, conexao_em)
    values (p_instancia, p_instancia, 500, v_novo, now())
    on conflict (instancia) do nothing;
    select id, conexao into v_id, v_antes
      from public.numeros where instancia = p_instancia;
  end if;

  update public.numeros set
    conexao    = v_novo,
    conexao_em = now(),
    motivo_queda = case when v_novo = 'open' then null
                        else coalesce(nullif(trim(p_motivo), ''), motivo_queda) end,
    caiu_em = case when v_novo = 'open' then null
                   when v_antes is distinct from v_novo then now()
                   else caiu_em end
  where id = v_id;

  if v_antes is distinct from v_novo then
    insert into public.conexao_eventos (numero_id, instancia, de, para, em)
    values (v_id, p_instancia, v_antes, v_novo, now());
  end if;

  return jsonb_build_object('ok', true, 'mudou', v_antes is distinct from v_novo);
end $function$;

-- ── 2. Mensagem de aparelho convidado NÃO entra na caixa ────────────────────
--
-- A definição abaixo é a função VIVA do banco, lida com pg_get_functiondef e
-- com a trava inserida logo após o `begin`. Reescrevê-la à mão seria arriscar
-- o caminho por onde passa toda mensagem que entra na plataforma.

CREATE OR REPLACE FUNCTION public.receber_mensagem(p_telefone text, p_nome text, p_instancia text, p_wa_id text, p_direcao text, p_tipo text, p_texto text, p_resumo text, p_midia_url text, p_midia_mime text, p_duracao integer, p_status text, p_momento timestamp with time zone, p_bruto jsonb, p_municipio_sug text DEFAULT NULL::text, p_bairro_sug text DEFAULT NULL::text, p_indicou text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_conversa   bigint;
  v_msg        bigint;
  v_conv       public.conversas%rowtype;
  v_atribuir   boolean := false;
  v_numero     bigint;
  v_chave      text := coalesce(nullif(p_instancia, ''), '__historico__');
begin
  -- ── APARELHO CONVIDADO NÃO ENTRA NA CAIXA (0044) ──────────────────────────
  --
  -- A tela "Puxar agenda" cria instâncias `agenda_*` para ler a agenda de um
  -- telefone emprestado e desfazer a conexão em seguida. Em 28/09 seis
  -- CONVERSAS PARTICULARES entraram na caixa de atendimento por esse caminho,
  -- com 38 mensagens, e uma chegou a ser atribuída a uma atendente.
  --
  -- A conversa de quem emprestou o telefone não é lead, não é da campanha, e
  -- as atendentes não têm o que fazer com ela além de ler o que não deviam.
  --
  -- A trava mora AQUI, e não na rota, porque esta é a última porta: rota se
  -- esquece de chamar, webhook se reconfigura, e o prefixo pode chegar por um
  -- caminho que ninguém previu. Quem GRAVA é quem vê todos eles.
  if coalesce(p_instancia, '') like 'agenda\_%' then
    return jsonb_build_object('ok', true, 'ignorada', 'sessao de agenda');
  end if;

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
$function$
;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  (public.marcar_conexao('agenda_teste_zzzz', 'open') ->> 'motivo')  as agenda_recusada,
  (select count(*) from public.numeros where instancia = 'agenda_teste_zzzz') as criou_numero,
  (public.receber_mensagem('5571999999999','teste','agenda_teste_zzzz','wa_teste_zzzz','inbound',
     'texto','oi',null,null,null,null,'x', now(), '{}'::jsonb) ->> 'ignorada') as msg_recusada,
  (select count(*) from public.conversas where instancia = 'agenda_teste_zzzz') as criou_conversa;
