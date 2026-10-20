-- ============================================================================
-- CADASTRO NA MÃO, PELA ATENDENTE — COM ETIQUETA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- Os chips estão caindo. A Lutiane não perdeu só o WhatsApp Web: perdeu o
-- número inteiro. A API oficial da Meta proíbe campanha política, então não há
-- para onde migrar.
--
-- A operação passa a ser: todo mundo atende pelo WhatsApp no aparelho e
-- cadastra aqui. O PIE deixa de depender da integração para continuar medindo.
--
-- ── POR QUE O CADASTRO CRIA UMA CONVERSA ────────────────────────────────────
--
-- Esta é a parte que não é óbvia, e sem ela o trabalho da Maiana não apareceria
-- em lugar nenhum.
--
-- A etiqueta do PIE mora em `conversa_tags`, e um gatilho copia o eixo dela
-- para `conversas.status_lead` e `conversas.demandas`. É DALI que a tela de
-- Métricas lê. Uma etiqueta pendurada na PESSOA não teria para onde ir.
--
-- Então cadastrar cria (ou reaproveita) a conversa daquela pessoa no número da
-- atendente. Com isso o cadastro manual entra nos mesmos números do
-- atendimento normal, sem nenhuma métrica precisar mudar — e quando a pessoa
-- escrever no WhatsApp, cai na conversa que já existe em vez de abrir outra.
--
-- ── POR QUE UMA FUNÇÃO, E NÃO INSERT DIRETO ─────────────────────────────────
--
-- Cadastrar bem exige saber se a pessoa já está na base. Dar leitura da base
-- para responder isso abriria os 543 municípes para quem só precisa de um sim
-- ou não. A regra da campanha é que a base fica em off.
--
-- `conferir_telefone` responde essa pergunta e nada mais.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ESTA PESSOA JÁ ESTÁ NA BASE?
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.conferir_telefone(p_telefone text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dig text := nullif(right(public.so_digitos(p_telefone), 11), '');
  v_l   record;
begin
  if not public.perfil_atendimento() then
    return jsonb_build_object('ok', false, 'motivo', 'sem permissao');
  end if;

  -- Telefone curto ainda está sendo digitado. Responder "não existe" faria a
  -- tela piscar "pode cadastrar" a cada tecla.
  if v_dig is null or length(v_dig) < 10 then
    return jsonb_build_object('ok', true, 'curto', true);
  end if;

  select l.nome, l.municipio, l.bairro, l.created_at, p.nome as quem
    into v_l
    from public.liderancas l
    left join public.profiles p on p.id = l.cadastrado_por
   where l.telefone_digitos = v_dig
   limit 1;

  if v_l.nome is null then
    return jsonb_build_object('ok', true, 'existe', false);
  end if;

  -- SÓ O SUFICIENTE. Nome, cidade e quem cadastrou respondem "não duplique" e
  -- "fale com fulana". A ficha inteira seria a base vazando por uma consulta
  -- que qualquer atendente repete variando o telefone.
  return jsonb_build_object(
    'ok', true, 'existe', true,
    'nome', v_l.nome, 'municipio', v_l.municipio, 'bairro', v_l.bairro,
    'quem', v_l.quem, 'quando', v_l.created_at
  );
end $$;

revoke all on function public.conferir_telefone(text) from public, anon;
grant execute on function public.conferir_telefone(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CADASTRAR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A assinatura mudou (ganhou `p_tags`), e `create or replace` criaria uma
-- SEGUNDA função em vez de trocar a primeira — aí toda chamada viraria erro de
-- ambiguidade. Some com a antiga antes.
drop function if exists public.cadastrar_manual(text, text, text, text, text, text);
drop function if exists public.cadastrar_manual(text, text, text, text, text, bigint[]);

create or replace function public.cadastrar_manual(
  p_nome      text,
  p_telefone  text,
  p_municipio text default null,
  p_bairro    text default null,
  p_tipo      text default 'lead',
  p_tags      bigint[] default '{}'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dig      text := nullif(right(public.so_digitos(p_telefone), 11), '');
  -- UUID, e não bigint. `liderancas.id` é uuid desde o começo — errei aqui e o
  -- cadastro quebrou com "invalid input syntax for type bigint" na cara da
  -- atendente. `conversas.id` e `tags.id` SÃO bigint; a mistura de tipos de
  -- chave nesta base é real, e supor um só é o jeito de repetir isto.
  v_id       uuid;
  v_ja       uuid;
  v_quem     uuid := auth.uid();
  v_tipo     text := case when p_tipo = 'lideranca' then 'lideranca' else 'lead' end;
  v_numero   bigint;
  v_conversa bigint;
  v_tag      bigint;
begin
  if not public.perfil_atendimento() then
    return jsonb_build_object('ok', false, 'erro', 'Sem permissão para cadastrar.');
  end if;

  if coalesce(trim(p_nome), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'O nome é obrigatório.');
  end if;

  -- Telefone é o que permite falar com a pessoa depois, e é a chave que evita
  -- duplicata. Sem ele o cadastro vira linha que ninguém consegue usar.
  if v_dig is null or length(v_dig) < 10 then
    return jsonb_build_object('ok', false, 'erro', 'Telefone incompleto — precisa de DDD e número.');
  end if;

  -- ── A PESSOA ──────────────────────────────────────────────────────────────
  select id into v_ja from public.liderancas where telefone_digitos = v_dig limit 1;

  if v_ja is not null then
    -- Completa o que está vazio, não sobrescreve o que já tem. Quem cadastrou
    -- primeiro pode ter conferido na mão.
    update public.liderancas set
      nome           = coalesce(nullif(trim(p_nome), ''), nome),
      municipio      = coalesce(municipio, nullif(trim(p_municipio), '')),
      bairro         = coalesce(bairro, nullif(trim(p_bairro), '')),
      cadastrado_por = coalesce(cadastrado_por, v_quem)
    where id = v_ja;
    v_id := v_ja;
  else
    insert into public.liderancas (
      nome, telefone, municipio, bairro, tipo, created_via, cadastrado_por
    ) values (
      trim(p_nome), p_telefone, nullif(trim(p_municipio), ''),
      nullif(trim(p_bairro), ''), v_tipo, 'manual', v_quem
    ) returning id into v_id;
  end if;

  -- ── A CONVERSA ────────────────────────────────────────────────────────────
  --
  -- O número desta atendente. Sem ele a conversa nasce sem número, o que
  -- continua valendo — só não dá para responder por dentro do PIE, e nesta
  -- operação ninguém vai responder por aqui mesmo.
  select n.id into v_numero
    from public.numeros n
   where n.atendente_id = v_quem and n.ativo
   order by n.ordem limit 1;

  -- Reaproveita a conversa que já existe: a pessoa pode ter escrito antes, e
  -- criar outra faria a mesma gente contar duas vezes na métrica.
  select c.id into v_conversa
    from public.conversas c
   where right(public.so_digitos(c.telefone), 11) = v_dig
     and c.telefone not like 'lid.%'
     and (v_numero is null or c.numero_id = v_numero or c.numero_id is null)
   order by (c.encerrada_em is null) desc, c.ultima_msg_at desc nulls last
   limit 1;

  if v_conversa is null then
    insert into public.conversas (
      telefone, nome, numero_id, atendente_id, atribuido_em,
      municipio, bairro, tipo, origem,
      -- OS DOIS CARIMBOS DE SLA JUNTOS, E AGORA.
      --
      -- Sem `primeira_resp_at` a conversa nasceria como "ninguém respondeu" e
      -- entraria no alarme de espera — 400 falsos abandonos numa tela cuja
      -- função é apontar abandono de verdade. A pessoa FOI atendida; foi pelo
      -- telefone, e é isso que o carimbo registra.
      primeira_msg_at, primeira_resp_at,
      ultima_msg, ultima_msg_at, ultima_direcao, total_mensagens,
      lideranca_id, cadastrado_em, cadastrado_por
    ) values (
      p_telefone, trim(p_nome), v_numero, v_quem, now(),
      nullif(trim(p_municipio), ''), nullif(trim(p_bairro), ''), 'lead', 'manual',
      now(), now(),
      'Atendida por telefone e cadastrada', now(), 'outbound', 0,
      v_id, now(), v_quem
    ) returning id into v_conversa;
  else
    update public.conversas set
      nome           = coalesce(nome, trim(p_nome)),
      municipio      = coalesce(municipio, nullif(trim(p_municipio), '')),
      bairro         = coalesce(bairro, nullif(trim(p_bairro), '')),
      lideranca_id   = coalesce(lideranca_id, v_id),
      cadastrado_em  = coalesce(cadastrado_em, now()),
      cadastrado_por = coalesce(cadastrado_por, v_quem),
      atendente_id   = coalesce(atendente_id, v_quem),
      -- Atendida por telefone: o relógio de "sem resposta" para aqui.
      primeira_resp_at = coalesce(primeira_resp_at, now()),
      atualizado_em  = now()
    where id = v_conversa;
  end if;

  -- ── AS ETIQUETAS ──────────────────────────────────────────────────────────
  --
  -- Uma a uma, e não em lote: o gatilho `tag_alimenta_eixos` roda por linha e é
  -- ele que escreve `status_lead` e `demandas` na conversa. É por essas duas
  -- colunas que a tela de Métricas conta.
  --
  -- O eixo 'status' é exclusivo — marcar "Apoiador" tira "Indeciso" sozinho,
  -- pelo mesmo gatilho. Aqui não é preciso repetir essa regra.
  if p_tags is not null then
    foreach v_tag in array p_tags loop
      insert into public.conversa_tags (conversa_id, tag_id)
      values (v_conversa, v_tag)
      on conflict do nothing;
    end loop;
  end if;

  return jsonb_build_object(
    'ok', true, 'id', v_id, 'conversa', v_conversa, 'ja_existia', v_ja is not null
  );
end $$;

revoke all on function public.cadastrar_manual(text, text, text, text, text, bigint[])
  from public, anon;
grant execute on function public.cadastrar_manual(text, text, text, text, text, bigint[])
  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. QUANTAS CADA UMA CADASTROU HOJE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A atendente vê o próprio número; quem coordena vê o de todas. Sem contador,
-- cadastrar na mão vira trabalho invisível — e trabalho invisível é o primeiro
-- que a equipe abandona quando o dia aperta.
create or replace function public.cadastros_de_hoje()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dia timestamptz := date_trunc('day', now() at time zone 'America/Bahia')
                       at time zone 'America/Bahia';
begin
  if not public.perfil_atendimento() then
    return jsonb_build_object('ok', false);
  end if;

  return jsonb_build_object(
    'ok', true,
    'meus', (select count(*) from public.liderancas
              where created_via = 'manual'
                and cadastrado_por = auth.uid()
                and created_at >= v_dia),
    'equipe', case when public.perfil_supervisao() then (
                select coalesce(jsonb_agg(x order by x->>'nome'), '[]'::jsonb) from (
                  select jsonb_build_object('nome', coalesce(p.nome, 'sem nome'),
                                            'quantos', count(*)) as x
                    from public.liderancas l
                    left join public.profiles p on p.id = l.cadastrado_por
                   where l.created_via = 'manual' and l.created_at >= v_dia
                   group by p.nome
                ) t
              ) else null end
  );
end $$;

revoke all on function public.cadastros_de_hoje() from public, anon;
grant execute on function public.cadastros_de_hoje() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CONFERÊNCIA
-- ─────────────────────────────────────────────────────────────────────────────
select p.proname as funcao,
       pg_get_function_identity_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('conferir_telefone', 'cadastrar_manual', 'cadastros_de_hoje')
 order by 1;
