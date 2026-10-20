-- ============================================================================
-- ENCERRADA FICA ENCERRADA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- Uma linha dentro de `receber_mensagem`. Ela era:
--
--     encerrada_em = case
--       when p_direcao = 'inbound' then null else encerrada_em end,
--
-- Ou seja: mensagem RECEBIDA reabria a conversa e a jogava de volta na fila.
--
-- Regra do Emanuel em 28/08: encerrar é decisão da atendente, e a mensagem
-- seguinte do eleitor não desfaz essa decisão. O que ele mandar depois chega na
-- aba Encerradas — que agora é ordenada pela última mensagem, então a novidade
-- aparece em cima lá dentro. Some da fila de trabalho, não da vista.
--
-- Sem isto, encerrar não encerrava: quem respondesse "obrigado" depois do
-- atendimento pronto voltava ao topo como se fosse lead novo, e a fila da
-- atendente nunca esvaziava.
--
-- ── POR QUE A FUNÇÃO INTEIRA, E NÃO SÓ A LINHA ──────────────────────────────
--
-- Postgres não edita uma linha de função: `create or replace` reescreve o corpo
-- todo. Este arquivo é cópia fiel da versão de `varios-numeros.sql` com a linha
-- trocada — os três arquivos do repositório que definem `receber_mensagem`
-- (`varios-numeros.sql`, `rodar-agora.sql`, `ingestao.sql`) já foram corrigidos
-- junto, para que rodar qualquer um deles depois não traga o defeito de volta.

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

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Quantas conversas estão encerradas na base INTEIRA — não é "de hoje", e o
-- rótulo antes dizia isso por engano. Serve de marco: depois desta mudança o
-- número só cresce, porque nada mais desencerra sozinho.
select count(*) as encerradas_na_base
  from public.conversas
 where encerrada_em is not null;
