-- ============================================================================
-- NENHUMA CONVERSA FECHA SEM CLASSIFICAÇÃO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── A REGRA ─────────────────────────────────────────────────────────────────
--
-- Não dá para ENCERRAR nem para CADASTRAR sem uma etiqueta de STATUS.
--
-- ── POR QUE STATUS, E NÃO "QUALQUER ETIQUETA" ───────────────────────────────
--
-- Se valesse qualquer uma, marcar "Responder depois" satisfaria a trava e o
-- relatório continuaria vazio — a regra existiria e não entregaria o que foi
-- pedido. O eixo `status` é o único que fecha 100% dos leads no painel, e é
-- literalmente o que a ficha chama de "Sem classificação".
--
-- Demanda não serve: uma pessoa pode ter zero ou cinco, e a soma nunca fecha.
--
-- ── POR QUE NO BANCO, E NÃO NO BOTÃO ────────────────────────────────────────
--
-- Encerrar é um `update` que o NAVEGADOR faz direto na tabela — não passa por
-- rota nenhuma. Desabilitar o botão é conforto para quem usa; não é trava.
-- Quem abrir o console, ou qualquer tela nova que alguém escrever depois,
-- passaria por cima.
--
-- ── A ÚNICA EXCEÇÃO, E POR QUE ELA NÃO ENFRAQUECE A REGRA ───────────────────
--
-- Conversa endereçada por `lid.` não tem telefone: veio do history sync com o
-- identificador anônimo. Não dá para responder, não dá para saber quem é, não
-- dá para classificar. São 326 abertas hoje.
--
-- Exigir classificação delas não produz relatório melhor — produz 326 linhas
-- presas na fila para sempre, que é o oposto do que a regra quer. Quando a
-- pessoa escrever de novo o telefone chega, `fundir_lid` costura, e aí a regra
-- passa a valer normalmente.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENCERRAR EXIGE CLASSIFICAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.exige_classificacao_ao_encerrar()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Só no gesto de FECHAR. Reabrir, transferir, renomear e qualquer outro
  -- update seguem livres: a trava é sobre encerrar, não sobre mexer na linha.
  if new.encerrada_em is null or old.encerrada_em is not null then
    return new;
  end if;

  -- Sem telefone é o caso impossível. Ver o cabeçalho.
  if new.telefone like 'lid.%' then
    return new;
  end if;

  -- Disparo não é atendimento: ninguém escreveu, não há o que classificar.
  if new.tipo = 'disparo' then
    return new;
  end if;

  if new.status_lead is null then
    -- A mensagem é lida por uma atendente no meio do plantão, então diz O QUE
    -- FAZER, e não o que faltou. "violates constraint" mandaria ela chamar
    -- alguém; isto resolve sozinho.
    raise exception
      'Marque uma etiqueta de status (Apoiador, Indeciso, Hater...) antes de encerrar esta conversa.'
      using errcode = 'check_violation';
  end if;

  return new;
end $$;

drop trigger if exists conversas_exige_classificacao on public.conversas;
create trigger conversas_exige_classificacao
  before update of encerrada_em on public.conversas
  for each row execute function public.exige_classificacao_ao_encerrar();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CADASTRAR EXIGE CLASSIFICAÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `confirmar_cadastro` é o botão da ficha, ao lado da conversa. A atendente
-- marca a etiqueta no painel de baixo e confirma — a ordem é essa, e a tela vai
-- dizer isso antes do clique.
--
-- Só a verificação é acrescentada; o resto do corpo continua igual, e por isso
-- a função é recriada inteira: o Postgres não edita uma linha de função.
create or replace function public.confirmar_cadastro(
  p_conversa   bigint,
  p_nome       text,
  p_municipio  text,
  p_bairro     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel     text;
  v_dig     text;
  v_pai     uuid;
  v_id      uuid;
  v_ja      uuid;
  v_status  text;
begin
  select telefone, lideranca_id, status_lead
    into v_tel, v_pai, v_status
    from public.conversas where id = p_conversa;

  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'conversa não encontrada');
  end if;

  -- A TRAVA. Devolvida como `erro` e não como exceção porque esta função já
  -- fala com a tela por esse campo — a mensagem aparece na ficha, no lugar
  -- onde a atendente está olhando.
  if v_status is null and v_tel not like 'lid.%' then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Marque uma etiqueta de status (Apoiador, Indeciso, Hater...) antes de cadastrar.'
    );
  end if;

  v_dig := right(public.so_digitos(v_tel), 11);

  select id into v_ja from public.liderancas where telefone_digitos = v_dig limit 1;

  if v_ja is not null then
    update public.liderancas set
      nome      = coalesce(nullif(trim(p_nome), ''), nome),
      municipio = coalesce(municipio, nullif(trim(p_municipio), '')),
      bairro    = coalesce(bairro, nullif(trim(p_bairro), ''))
    where id = v_ja;
    v_id := v_ja;
  else
    insert into public.liderancas (nome, telefone, municipio, bairro, parent_id, tipo, created_via)
    values (nullif(trim(p_nome), ''), v_tel, nullif(trim(p_municipio), ''),
            nullif(trim(p_bairro), ''), v_pai, 'lead', 'whatsapp')
    returning id into v_id;
  end if;

  update public.conversas set
    nome           = coalesce(nullif(trim(p_nome), ''), nome),
    municipio      = nullif(trim(p_municipio), ''),
    bairro         = nullif(trim(p_bairro), ''),
    lideranca_id   = v_id,
    cadastrado_em  = now(),
    cadastrado_por = auth.uid()
  where id = p_conversa;

  return jsonb_build_object('ok', true, 'lideranca_id', v_id, 'ja_existia', v_ja is not null);
end;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O CADASTRO PELA TELA DE "CADASTRAR PESSOA ATENDIDA"
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `cadastrar_manual` é a outra porta de entrada — a que a menina usa depois de
-- atender por telefone. Ela recebe as etiquetas em `p_tags`, e a trava é
-- conferir que pelo menos uma delas é do eixo `status`.
--
-- ── POR QUE GATILHO DE RESTRIÇÃO, E NÃO GATILHO COMUM ──────────────────────
--
-- `cadastrar_manual` INSERE a conversa com `cadastrado_em` já preenchido e só
-- DEPOIS grava as etiquetas, uma a uma. Um gatilho comum roda no momento do
-- insert — antes de existir etiqueta nenhuma — e recusaria todo cadastro,
-- sempre, inclusive os certos.
--
-- `constraint trigger ... deferrable initially deferred` roda no FIM DA
-- TRANSAÇÃO, quando pessoa, conversa e etiquetas já existem. É a única forma
-- de conferir "o conjunto ficou completo?" em vez de "estava completo na
-- primeira linha?".
create or replace function public.exige_status_no_cadastro()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.cadastrado_em is null then
    return null;
  end if;
  -- Em UPDATE, só o gesto de cadastrar AGORA. Reeditar quem já estava
  -- cadastrado não é um cadastro novo e não pode ser barrado por isto.
  if tg_op = 'UPDATE' and old.cadastrado_em is not null then
    return null;
  end if;
  if new.telefone like 'lid.%' then
    return null;
  end if;

  -- A TABELA de marcações, e não `status_lead`: essa coluna é escrita por outro
  -- gatilho (`tag_alimenta_eixos`), e conferir a origem é mais confiável do que
  -- depender da ordem entre dois gatilhos na mesma transação.
  if not exists (
    select 1
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
     where ct.conversa_id = new.id and t.eixo = 'status'
  ) then
    raise exception
      'Marque uma etiqueta de status (Apoiador, Indeciso, Hater...) antes de cadastrar esta pessoa.'
      using errcode = 'check_violation';
  end if;

  return null;
end $$;

drop trigger if exists conversas_exige_status_no_cadastro on public.conversas;
create constraint trigger conversas_exige_status_no_cadastro
  after insert or update of cadastrado_em on public.conversas
  deferrable initially deferred
  for each row execute function public.exige_status_no_cadastro();

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- O tamanho do que a regra alcança, para ninguém ser pego de surpresa amanhã.
select count(*) filter (where encerrada_em is null)                              as abertas,
       count(*) filter (where encerrada_em is null and status_lead is not null)   as ja_classificadas,
       count(*) filter (where encerrada_em is null and status_lead is null
                          and telefone not like 'lid.%' and tipo <> 'disparo')    as precisam_de_etiqueta,
       count(*) filter (where encerrada_em is null and status_lead is null
                          and telefone like 'lid.%')                              as isentas_sem_telefone
  from public.conversas;
