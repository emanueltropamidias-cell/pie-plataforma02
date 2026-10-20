-- ============================================================================
-- O PIE, DO ZERO
-- ============================================================================
--
-- GERADO por `scripts/gerar-base.mjs` a partir do banco em produção.
-- NÃO EDITE À MÃO: mudança daqui para frente é migração nova em
-- `supabase/migrations/`, e esta base é regerada quando a produção mudar.
--
-- ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
--
-- Os 75 arquivos que viraram `supabase/historico/` foram escritos
-- incrementalmente, sempre contra um banco que já existia. Ninguém nunca
-- instalou o PIE do zero, e a ordem certa só existia no histórico do git —
-- quatro deles definem `receber_mensagem`, quatro definem `so_digitos`, três
-- definem `atribuir_conversa`. Rodar na ordem errada instalava a versão VELHA
-- por cima da nova, sem erro nenhum.
--
-- Este arquivo é o banco que FUNCIONA, lido dele mesmo.
--
-- ── A ORDEM ─────────────────────────────────────────────────────────────────
--
-- extensões · tipos · funções · tabelas · restrições · views · gatilhos ·
-- índices · RLS · permissões
--
-- As funções vêm antes das tabelas porque `etiquetas_pendentes.digitos` é
-- coluna gerada por `so_digitos()`. As funções que leem tabelas sobrevivem a
-- isso por causa do `check_function_bodies` logo abaixo: o corpo é guardado
-- sem validar os nomes, e a validação acontece na primeira execução. É o mesmo
-- recurso que o `pg_dump` usa.
--
-- Gerado em 2026-09-05T06:49:21.131Z

set check_function_bodies = off;

-- ══════════════════════════════════════════════════════════════════════════
-- EXTENSÕES
-- ══════════════════════════════════════════════════════════════════════════
--
-- Vêm primeiro porque tudo o mais pode depender delas. `unaccent` e `pg_trgm`
-- sustentam a busca por nome e o cruzamento de município.

create extension if not exists "pg_stat_statements" with schema extensions;

create extension if not exists "pg_trgm" with schema public;

create extension if not exists "pgcrypto" with schema extensions;

create extension if not exists "supabase_vault" with schema vault;

create extension if not exists "uuid-ossp" with schema extensions;


-- ══════════════════════════════════════════════════════════════════════════
-- FUNÇÕES QUE NÃO DEPENDEM DE TABELA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Vêm antes das tabelas porque as tabelas precisam delas: `so_digitos()` é
-- chamada por uma coluna gerada, e `departamento_aberto()` por uma view. Os
-- corpos que leem tabela passam por causa do `check_function_bodies = off`.

CREATE OR REPLACE FUNCTION public.aplicar_pendentes()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_p record; v_tag bigint; v_conv bigint; v_n int := 0;
begin
  for v_p in select * from public.etiquetas_pendentes where aplicada_em is null order by chegou_em
  loop
    select public.tag_do_whatsapp(v_p.label) into v_tag;
    if v_tag is null then continue; end if;

    select c.id into v_conv
      from public.conversas c
      left join public.numeros n on n.id = c.numero_id
     where right(public.so_digitos(c.telefone), 11) = v_p.digitos
       and c.telefone not like 'lid.%'
       and (v_p.instancia is null or n.instancia = v_p.instancia)
     order by (c.encerrada_em is null) desc, c.ultima_msg_at desc nulls last
     limit 1;
    if v_conv is null then continue; end if;

    if v_p.remover then
      delete from public.conversa_tags where conversa_id = v_conv and tag_id = v_tag;
    else
      insert into public.conversa_tags (conversa_id, tag_id)
      values (v_conv, v_tag) on conflict do nothing;
      delete from public.conversa_tags ct
       using public.tags t, public.tags novo
       where ct.conversa_id = v_conv and ct.tag_id = t.id
         and novo.id = v_tag and novo.eixo = 'status'
         and t.eixo = 'status' and t.id <> v_tag;
    end if;

    update public.etiquetas_pendentes set aplicada_em = now() where id = v_p.id;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('aplicadas', v_n);
end $function$
;

CREATE OR REPLACE FUNCTION public.assumir_conversa(p_conversa bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eu        uuid := auth.uid();
  v_dono      uuid;
  v_telefone  text;
  v_nome_dono text;
begin
  if v_eu is null or not public.perfil_atendimento() then
    raise exception 'sem permissao para assumir';
  end if;

  if not exists (select 1 from public.atendentes a where a.id = v_eu) then
    return jsonb_build_object('ok', false, 'motivo', 'nao_e_atendente');
  end if;

  select c.atendente_id, c.telefone into v_dono, v_telefone
    from public.conversas c
   where c.id = p_conversa
   for update;

  if v_telefone is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_existe');
  end if;

  if v_dono is not null then
    if v_dono = v_eu then
      return jsonb_build_object('ok', true, 'motivo', 'ja_era_sua');
    end if;
    select a.nome into v_nome_dono from public.atendentes a where a.id = v_dono;
    return jsonb_build_object(
      'ok', false, 'motivo', 'ja_tem_dono',
      'dono', coalesce(v_nome_dono, 'outra pessoa')
    );
  end if;

  update public.conversas
     set atendente_id = v_eu, atribuido_em = now(), atualizado_em = now()
   where id = p_conversa;

  insert into public.atribuicoes (
    conversa_id, telefone, de_atendente, para_atendente, motivo, regra, feita_por
  ) values (
    p_conversa, v_telefone, null, v_eu, 'manual', 'puxou-da-fila', v_eu
  );

  return jsonb_build_object('ok', true, 'motivo', 'assumida');
end $function$
;

CREATE OR REPLACE FUNCTION public.atribuir_conversa(p_conversa bigint, p_atendente uuid, p_regra text, p_motivo text DEFAULT 'automatica'::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tel text;
  v_antes uuid;
begin
  select telefone, atendente_id into v_tel, v_antes
  from public.conversas where id = p_conversa;
  if v_tel is null then return false; end if;

  update public.conversas
     set atendente_id = p_atendente, atribuido_em = now()
   where id = p_conversa;

  insert into public.atribuicoes (conversa_id, telefone, de_atendente, para_atendente, motivo, regra)
  values (p_conversa, v_tel, v_antes, p_atendente, p_motivo, p_regra);

  return true;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.audio_usado(p_audio bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.materiais
     set vezes = vezes + 1, ultimo_uso = now()
   where id = p_audio;
end $function$
;

CREATE OR REPLACE FUNCTION public.cadastrar_lead_publico(p_code text, p_nome text, p_telefone text, p_municipio text, p_bairro text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_parent uuid; v_code text;
begin
  select id into v_parent from public.liderancas where link_code = p_code limit 1;
  if v_parent is null then return 'link-invalido'; end if;
  if coalesce(btrim(p_nome),'') = '' then return 'sem-nome'; end if;
  v_code := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
  insert into public.liderancas (nome, telefone, municipio, bairro, parent_id, tipo, created_via, link_code)
  values (btrim(p_nome), nullif(btrim(p_telefone),''), nullif(btrim(p_municipio),''), nullif(btrim(p_bairro),''), v_parent, 'lead', 'afiliado', v_code);
  return 'ok';
end; $function$
;

CREATE OR REPLACE FUNCTION public.cadastrar_manual(p_nome text, p_telefone text, p_municipio text DEFAULT NULL::text, p_bairro text DEFAULT NULL::text, p_tipo text DEFAULT 'lead'::text, p_tags bigint[] DEFAULT '{}'::bigint[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dig      text := nullif(right(public.so_digitos(p_telefone), 11), '');
  -- UUID, e não bigint. liderancas.id é uuid; conversas.id e tags.id são
  -- bigint. A mistura nesta base é real, e supor um tipo só quebrou aqui.
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
  if v_dig is null or length(v_dig) < 10 then
    return jsonb_build_object('ok', false, 'erro', 'Telefone incompleto — precisa de DDD e número.');
  end if;

  select id into v_ja from public.liderancas where telefone_digitos = v_dig limit 1;

  if v_ja is not null then
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

  select n.id into v_numero
    from public.numeros n
   where n.atendente_id = v_quem and n.ativo
   order by n.ordem limit 1;

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
      nome             = coalesce(nome, trim(p_nome)),
      municipio        = coalesce(municipio, nullif(trim(p_municipio), '')),
      bairro           = coalesce(bairro, nullif(trim(p_bairro), '')),
      lideranca_id     = coalesce(lideranca_id, v_id),
      cadastrado_em    = coalesce(cadastrado_em, now()),
      cadastrado_por   = coalesce(cadastrado_por, v_quem),
      atendente_id     = coalesce(atendente_id, v_quem),
      primeira_resp_at = coalesce(primeira_resp_at, now()),
      atualizado_em    = now()
    where id = v_conversa;
  end if;

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
end $function$
;

CREATE OR REPLACE FUNCTION public.cadastros_de_hoje()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.cadastros_por_cidade()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(jsonb_object_agg(chave, n), '{}'::jsonb)
    from (
      select lower(public.unaccent_simples(btrim(municipio))) as chave,
             count(*) as n
        from public.liderancas
       where coalesce(tipo, 'lideranca') <> 'contato'
         and municipio is not null
         and btrim(municipio) <> ''
       group by 1
    ) x;
$function$
;

CREATE OR REPLACE FUNCTION public.chave_etiqueta(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select regexp_replace(
           regexp_replace(
             lower(trim(coalesce(public.unaccent_simples(t), ''))),
             '(es|s)$', ''
           ),
           '[^a-z0-9]+', '', 'g'
         );
$function$
;

CREATE OR REPLACE FUNCTION public.chave_municipio(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select btrim(regexp_replace(lower(public.unaccent_simples(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'))
$function$
;

CREATE OR REPLACE FUNCTION public.conferir_telefone(p_telefone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.confirmar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_tel     text;
  v_dig     text;
  v_pai     uuid;
  v_id      uuid;
  v_ja      uuid;
  v_quem    uuid := auth.uid();
begin
  select telefone, lideranca_id into v_tel, v_pai
    from public.conversas where id = p_conversa;
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'conversa não encontrada');
  end if;

  v_dig := right(public.so_digitos(v_tel), 11);

  select id into v_ja from public.liderancas where telefone_digitos = v_dig limit 1;

  if v_ja is not null then
    -- JÁ EXISTE: completa o que está vazio e NÃO reescreve o que já foi
    -- preenchido. Quem cadastrou primeiro pode ter conferido na mão.
    update public.liderancas set
      nome           = coalesce(nullif(trim(p_nome), ''), nome),
      municipio      = coalesce(municipio, nullif(trim(p_municipio), '')),
      bairro         = coalesce(bairro, nullif(trim(p_bairro), '')),
      cadastrado_por = coalesce(cadastrado_por, v_quem)
    where id = v_ja;
    v_id := v_ja;
  else
    insert into public.liderancas (
      nome, telefone, municipio, bairro, parent_id, tipo, created_via, cadastrado_por
    )
    values (
      nullif(trim(p_nome), ''), v_tel, nullif(trim(p_municipio), ''),
      nullif(trim(p_bairro), ''), v_pai, 'lead', 'whatsapp', v_quem
    )
    returning id into v_id;
  end if;

  update public.conversas set
    nome           = coalesce(nullif(trim(p_nome), ''), nome),
    municipio      = nullif(trim(p_municipio), ''),
    bairro         = nullif(trim(p_bairro), ''),
    lideranca_id   = v_id,
    cadastrado_em  = now(),
    cadastrado_por = v_quem
  where id = p_conversa;

  -- ── AS OUTRAS CONVERSAS DA MESMA PESSOA JÁ NASCEM CADASTRADAS ───────────
  --
  -- É o que fecha o ciclo com vários números: cadastrou pelo número 1, a
  -- conversa do número 3 para de pedir cadastro sozinha. Sem isto, a segunda
  -- menina continuaria vendo o formulário e perguntando tudo de novo.
  update public.conversas set
    nome          = coalesce(nome, nullif(trim(p_nome), '')),
    municipio     = coalesce(municipio, nullif(trim(p_municipio), '')),
    bairro        = coalesce(bairro, nullif(trim(p_bairro), '')),
    lideranca_id  = v_id,
    cadastrado_em = now(),
    cadastrado_por = v_quem
  where telefone = v_tel
    and id <> p_conversa
    and cadastrado_em is null;

  return jsonb_build_object(
    'ok', true, 'lideranca_id', v_id, 'ja_existia', v_ja is not null
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.conta_de_lideranca()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.liderancas where auth_uid = auth.uid()
  );
$function$
;

CREATE OR REPLACE FUNCTION public.conversa_cai_no_padrao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.departamento_id is null then
    select d.id into new.departamento_id
      from public.departamentos d
     where d.padrao and d.ativo
     limit 1;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.conversa_do_telefone(p_telefone text, p_nome text DEFAULT NULL::text, p_instancia text DEFAULT NULL::text, p_foto text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_id bigint;
begin
  insert into public.conversas (telefone, nome, instancia, foto_url)
  values (p_telefone, p_nome, p_instancia, p_foto)
  on conflict (telefone) do update set
    -- O nome só é preenchido, nunca sobrescrito: quem cadastrou na mão sabia
    -- mais do que o apelido que a pessoa pôs no WhatsApp.
    nome          = coalesce(conversas.nome, excluded.nome),
    foto_url      = coalesce(excluded.foto_url, conversas.foto_url),
    atualizado_em = now()
  returning id into v_id;
  return v_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.conversa_marca_entrada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
end $function$
;

CREATE OR REPLACE FUNCTION public.conversa_municipio_na_grafia_oficial()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_nome text;
begin
  if new.municipio is not null then
    new.municipio := btrim(new.municipio);
    select nome into v_nome from public.municipios_ba
     where chave = public.chave_municipio(new.municipio);
    if v_nome is not null then new.municipio := v_nome; end if;
  end if;

  if new.municipio_sugerido is not null then
    new.municipio_sugerido := btrim(new.municipio_sugerido);
    select nome into v_nome from public.municipios_ba
     where chave = public.chave_municipio(new.municipio_sugerido);
    if v_nome is not null then new.municipio_sugerido := v_nome; end if;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.conversa_nasce_com_dona()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dona uuid;
begin
  -- Já tem dono (transferência, cadastro manual): não mexe.
  if new.atendente_id is not null or new.numero_id is null then
    return new;
  end if;

  select n.atendente_id into v_dona
    from public.numeros n
   where n.id = new.numero_id and n.ativo;

  if v_dona is not null then
    new.atendente_id := v_dona;
    new.atribuido_em := now();
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.conversa_nasce_conhecida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dig  text;
  v_lid  record;
begin
  -- Só quando a conversa NASCE, e só se ainda não veio preenchida.
  if new.cadastrado_em is not null then
    return new;
  end if;

  v_dig := right(public.so_digitos(new.telefone), 11);
  if v_dig is null or length(v_dig) < 10 then
    return new;
  end if;

  select l.id, l.nome, l.municipio, l.bairro, l.cadastrado_por
    into v_lid
    from public.liderancas l
   where l.telefone_digitos = v_dig
   limit 1;

  if v_lid.id is null then
    return new;
  end if;

  -- `coalesce` em tudo: o que já veio na conversa manda. O nome do perfil do
  -- WhatsApp pode estar mais atual que o da base de dois anos atrás.
  new.lideranca_id   := v_lid.id;
  new.nome           := coalesce(new.nome, v_lid.nome);
  new.municipio      := coalesce(new.municipio, v_lid.municipio);
  new.bairro         := coalesce(new.bairro, v_lid.bairro);
  new.cadastrado_em  := now();
  new.cadastrado_por := v_lid.cadastrado_por;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.creditar_resposta_do_celular()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dono uuid;
begin
  select n.atendente_id into v_dono
    from public.conversas c
    join public.numeros   n on n.id = c.numero_id
   where c.id = new.conversa_id;

  -- Número sem dono cadastrado fica nulo mesmo. Chutar uma atendente aqui
  -- seria pior que não creditar: métrica de trabalho errada é o que decide
  -- escala de gente.
  if v_dono is null then
    return null;
  end if;

  update public.mensagens
     set enviada_por = v_dono
   where id = new.id and enviada_por is null;

  return null;
end $function$
;

CREATE OR REPLACE FUNCTION public.ddd_valido(v text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select v in ('11','12','13','14','15','16','17','18','19','21','22','24','27',
               '28','31','32','33','34','35','37','38','41','42','43','44','45',
               '46','47','48','49','51','53','54','55','61','62','63','64','65',
               '66','67','68','69','71','73','74','75','77','79','81','82','83',
               '84','85','86','87','88','89','91','92','93','94','95','96','97',
               '98','99');
$function$
;

CREATE OR REPLACE FUNCTION public.demandas_touch()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at := now();
  if new.status = 'resolvida' and (old.status is distinct from 'resolvida') then
    new.resolvida_em := now();
  elsif new.status <> 'resolvida' then
    new.resolvida_em := null;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.departamento_aberto(p_departamento bigint, p_momento timestamp with time zone DEFAULT now())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fuso  text;
  v_local timestamp;
begin
  select coalesce(d.fuso, 'America/Bahia') into v_fuso
    from public.departamentos d where d.id = p_departamento;

  -- Setor que não existe não fecha nada.
  if v_fuso is null then
    return true;
  end if;

  if not exists (
    select 1 from public.departamento_turnos t
     where t.departamento_id = p_departamento
  ) then
    return true;
  end if;

  v_local := p_momento at time zone v_fuso;

  return exists (
    select 1
      from public.departamento_turnos t
     where t.departamento_id = p_departamento
       and t.dia = extract(dow from v_local)::smallint
       and v_local::time >= t.abre
       and v_local::time <  t.fecha
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.departamento_um_padrao()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.padrao then
    -- Não recursa: o update abaixo grava `false`, e aí o `if` é falso.
    update public.departamentos
       set padrao = false
     where id is distinct from new.id and padrao;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.editar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_lideranca uuid;
  v_dono      uuid;
  v_cadastro  timestamptz;
begin
  select lideranca_id, atendente_id, cadastrado_em
    into v_lideranca, v_dono, v_cadastro
    from public.conversas where id = p_conversa;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Conversa não encontrada.');
  end if;

  if not (
    public.perfil_supervisao()
    or (public.perfil_atendimento()
        and (v_dono = auth.uid() or v_dono is null))
  ) then
    return jsonb_build_object('ok', false, 'erro', 'Esta conversa não é sua.');
  end if;

  if v_cadastro is null then
    return jsonb_build_object('ok', false, 'erro', 'Esta pessoa ainda não foi cadastrada. Use Cadastrar.');
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_municipio), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Nome e município são obrigatórios.');
  end if;

  update public.conversas set
    nome          = trim(p_nome),
    municipio     = trim(p_municipio),
    bairro        = nullif(trim(p_bairro), ''),
    atualizado_em = now()
  where id = p_conversa;

  if v_lideranca is not null then
    update public.liderancas set
      nome      = trim(p_nome),
      municipio = trim(p_municipio),
      bairro    = nullif(trim(p_bairro), '')
    where id = v_lideranca;
  end if;

  return jsonb_build_object('ok', true, 'lideranca_id', v_lideranca);
end $function$
;

CREATE OR REPLACE FUNCTION public.etiqueta_do_whatsapp(p_telefone text, p_instancia text, p_label text, p_remover boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tag bigint;
  v_conversa bigint;
  v_dig text := right(public.so_digitos(p_telefone), 11);
begin
  select public.tag_do_whatsapp(p_label) into v_tag;

  if v_dig is null or length(v_dig) < 10 then
    return jsonb_build_object('ok', false, 'motivo', 'sem telefone utilizavel');
  end if;

  select c.id into v_conversa
    from public.conversas c
    left join public.numeros n on n.id = c.numero_id
   where right(public.so_digitos(c.telefone), 11) = v_dig
     and c.telefone not like 'lid.%'
     and (p_instancia is null or n.instancia = p_instancia)
   order by (c.encerrada_em is null) desc, c.ultima_msg_at desc nulls last
   limit 1;

  if v_conversa is null or v_tag is null then
    insert into public.etiquetas_pendentes (telefone, instancia, label, remover)
    values (p_telefone, p_instancia, p_label, p_remover);
    return jsonb_build_object('ok', true, 'esperando', true, 'label', p_label);
  end if;

  if p_remover then
    delete from public.conversa_tags where conversa_id = v_conversa and tag_id = v_tag;
  else
    insert into public.conversa_tags (conversa_id, tag_id)
    values (v_conversa, v_tag) on conflict do nothing;
    delete from public.conversa_tags ct
     using public.tags t, public.tags novo
     where ct.conversa_id = v_conversa and ct.tag_id = t.id
       and novo.id = v_tag and novo.eixo = 'status'
       and t.eixo = 'status' and t.id <> v_tag;
  end if;

  return jsonb_build_object('ok', true, 'conversa', v_conversa, 'tag', v_tag);
end $function$
;

CREATE OR REPLACE FUNCTION public.fluxo_cala_quando_gente_fala()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.direcao = 'outbound' and new.enviada_por is not null then
    update public.conversas
       set fluxo_passo = -1
     where id = new.conversa_id
       and fluxo_passo <> -1;
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.fluxo_responder(p_conversa bigint, p_texto text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_fluxo     bigint;
  v_modo      text;
  v_teste     text[];
  v_conv      record;
  v_passo     record;
  v_total     int;
  v_msg       text;
  v_resposta  text;
begin
  -- ── trava 6: parar tudo ────────────────────────────────────────────────
  select id, modo, telefones_teste into v_fluxo, v_modo, v_teste
    from public.fluxos where ativo limit 1;
  if v_fluxo is null then
    return jsonb_build_object('enviar', false, 'motivo', 'sem fluxo ativo');
  end if;

  select c.id, c.telefone, c.fluxo_passo, c.nome, c.nome_sugerido,
         c.municipio, c.municipio_sugerido, c.cadastrado_em
    into v_conv
    from public.conversas c
   where c.id = p_conversa
     for update;

  if v_conv.id is null then
    return jsonb_build_object('enviar', false, 'motivo', 'conversa nao existe');
  end if;

  -- ── trava 1: gente já falou aqui ───────────────────────────────────────
  if v_conv.fluxo_passo = -1 then
    return jsonb_build_object('enviar', false, 'motivo', 'gente assumiu');
  end if;

  -- ── trava 5: modo rascunho ─────────────────────────────────────────────
  if v_modo = 'rascunho'
     and not (right(public.so_digitos(v_conv.telefone), 11) = any (
       select right(public.so_digitos(t), 11) from unnest(v_teste) as t
     )) then
    return jsonb_build_object('enviar', false, 'motivo', 'rascunho: fora da lista de teste');
  end if;

  -- ── trava 3: teto de passos ────────────────────────────────────────────
  select count(*) into v_total from public.fluxo_passos where fluxo_id = v_fluxo;
  if v_conv.fluxo_passo >= v_total then
    return jsonb_build_object('enviar', false, 'motivo', 'roteiro terminou');
  end if;

  -- ── guardar o que a pessoa respondeu ao passo ANTERIOR ─────────────────
  --
  -- Vai para os campos _sugerido, e nunca para os definitivos: quem confirma é
  -- a atendente, com o clique que já existe na ficha. Robô que escreve direto
  -- no cadastro enche a base de "oi" no lugar do nome.
  if v_conv.fluxo_passo > 0 then
    select * into v_passo
      from public.fluxo_passos
     where fluxo_id = v_fluxo and ordem = v_conv.fluxo_passo;

    if v_passo.guarda_em is not null
       and v_conv.cadastrado_em is null
       and length(trim(coalesce(p_texto, ''))) between 2 and 120 then
      v_resposta := trim(p_texto);
      if v_passo.guarda_em = 'nome' then
        update public.conversas
           set nome_sugerido = coalesce(nome_sugerido, v_resposta)
         where id = p_conversa;
      elsif v_passo.guarda_em = 'municipio' then
        update public.conversas
           set municipio_sugerido = coalesce(municipio_sugerido, v_resposta)
         where id = p_conversa;
      elsif v_passo.guarda_em = 'bairro' then
        update public.conversas
           set bairro_sugerido = coalesce(bairro_sugerido, v_resposta)
         where id = p_conversa;
      end if;
    end if;
  end if;

  -- ── o próximo passo ────────────────────────────────────────────────────
  select * into v_passo
    from public.fluxo_passos
   where fluxo_id = v_fluxo and ordem = v_conv.fluxo_passo + 1;

  if v_passo.id is null or coalesce(trim(v_passo.mensagem), '') = '' then
    -- Passo sem mensagem: avança sem falar. Serve para marcar etapa que a
    -- atendente cumpre na mão sem o robô interromper.
    update public.conversas
       set fluxo_passo = v_conv.fluxo_passo + 1,
           fluxo_em = now()
     where id = p_conversa and fluxo_passo = v_conv.fluxo_passo;
    return jsonb_build_object('enviar', false, 'motivo', 'passo sem mensagem');
  end if;

  -- ── trava 4: avançar é o que autoriza enviar ───────────────────────────
  --
  -- Se o `update` não acertar nenhuma linha, outra mensagem chegou primeiro e
  -- já avançou. Aí não se envia — é assim que duas mensagens simultâneas não
  -- viram duas respostas.
  update public.conversas
     set fluxo_passo   = v_conv.fluxo_passo + 1,
         fluxo_em      = now(),
         fluxo_estagio = v_passo.estagio
   where id = p_conversa
     and fluxo_passo = v_conv.fluxo_passo;

  if not found then
    return jsonb_build_object('enviar', false, 'motivo', 'outra mensagem chegou antes');
  end if;

  -- ── o texto, com os buracos preenchidos ────────────────────────────────
  v_msg := v_passo.mensagem;
  v_msg := replace(v_msg, '{{nome}}',
             coalesce(nullif(split_part(coalesce(v_conv.nome, v_conv.nome_sugerido, ''), ' ', 1), ''), 'tudo bem'));
  v_msg := replace(v_msg, '{{municipio}}',
             coalesce(v_conv.municipio, v_conv.municipio_sugerido, 'sua cidade'));

  return jsonb_build_object(
    'enviar',  true,
    'texto',   v_msg,
    'passo',   v_passo.ordem,
    'titulo',  v_passo.titulo,
    'ultimo',  v_passo.ordem >= v_total
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.fundir_lid(p_lid text, p_telefone text, p_instancia text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_numero    bigint;
  v_endereco  text := 'lid.' || regexp_replace(coalesce(p_lid, ''), '\D', '', 'g');
  v_velha     bigint;
  v_nova      bigint;
  v_conv      public.conversas%rowtype;
begin
  if v_endereco = 'lid.' or coalesce(p_telefone, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'faltou lid ou telefone');
  end if;

  select id into v_numero from public.numeros
   where instancia = coalesce(nullif(p_instancia, ''), '__historico__');
  if v_numero is null then
    return jsonb_build_object('ok', false, 'motivo', 'numero desconhecido');
  end if;

  select id into v_velha from public.conversas
   where telefone = v_endereco and numero_id = v_numero;
  if v_velha is null then
    return jsonb_build_object('ok', true, 'nada', true);
  end if;

  select id into v_nova from public.conversas
   where telefone = p_telefone and numero_id = v_numero;

  -- ── CASO SIMPLES: a conversa apenas ganha endereço ───────────────────────
  if v_nova is null then
    update public.conversas
       set telefone = p_telefone, atualizado_em = now()
     where id = v_velha;
    -- As mensagens guardam o telefone que valia na hora; alinhar evita que a
    -- exportação mostre `lid.` no meio da conversa da mesma pessoa.
    update public.mensagens set telefone = p_telefone where conversa_id = v_velha;
    return jsonb_build_object('ok', true, 'promovida', v_velha);
  end if;

  -- ── CASO DUPLO: esvazia a do identificador dentro da do telefone ─────────
  select * into v_conv from public.conversas where id = v_velha;

  update public.mensagens
     set conversa_id = v_nova, telefone = p_telefone
   where conversa_id = v_velha;

  insert into public.conversa_tags (conversa_id, tag_id)
  select v_nova, tag_id from public.conversa_tags where conversa_id = v_velha
  on conflict do nothing;
  delete from public.conversa_tags where conversa_id = v_velha;

  -- O que sobrevive é sempre o MAIS ANTIGO dos começos e o MAIS NOVO dos fins.
  -- Trocar isso vira SLA calculado sobre a hora errada.
  update public.conversas c set
    nome            = coalesce(c.nome, v_conv.nome),
    atendente_id    = coalesce(c.atendente_id, v_conv.atendente_id),
    lideranca_id    = coalesce(c.lideranca_id, v_conv.lideranca_id),
    total_mensagens = c.total_mensagens + coalesce(v_conv.total_mensagens, 0),
    primeira_msg_at = least(c.primeira_msg_at, v_conv.primeira_msg_at),
    primeira_resp_at= least(c.primeira_resp_at, v_conv.primeira_resp_at),
    ultima_msg_at   = greatest(c.ultima_msg_at, v_conv.ultima_msg_at),
    nome_sugerido      = coalesce(c.nome_sugerido, v_conv.nome_sugerido),
    municipio_sugerido = coalesce(c.municipio_sugerido, v_conv.municipio_sugerido),
    bairro_sugerido    = coalesce(c.bairro_sugerido, v_conv.bairro_sugerido),
    indicado_por       = coalesce(c.indicado_por, v_conv.indicado_por),
    atualizado_em   = now()
  where c.id = v_nova;

  delete from public.conversas where id = v_velha;

  return jsonb_build_object('ok', true, 'fundida', v_velha, 'em', v_nova);
end $function$
;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare primeiro boolean;
begin
  select count(*) = 0 into primeiro from public.profiles;
  insert into public.profiles (id, email, nome, role, status) values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email,'@',1)),
    case when primeiro then 'admin' else 'usuario' end,
    case when primeiro then 'ativo' else 'pendente' end
  );
  return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$function$
;

CREATE OR REPLACE FUNCTION public.kit_usado(p_kit bigint)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  update public.kits
     set vezes = vezes + 1, ultimo_uso = now()
   where id = p_kit;
  -- Cada material do kit conta também: um santinho pode estar em três kits, e
  -- é a soma que diz se ele vale a pena.
  update public.materiais m
     set vezes = m.vezes + 1, ultimo_uso = now()
    from public.kit_itens i
   where i.kit_id = p_kit and i.material_id = m.id;
end $function$
;

CREATE OR REPLACE FUNCTION public.leads_por_dia(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with regua as (
    select generate_series(
             (date_trunc('day', now() at time zone 'America/Bahia')
               - make_interval(days => greatest(p_dias, 1) - 1))::date,
             (now() at time zone 'America/Bahia')::date,
             interval '1 day'
           )::date as dia
  ),
  contados as (
    select ((coalesce(c.primeira_msg_at, c.criado_em) at time zone 'America/Bahia')::date) as dia,
           count(*) as n
      from public.conversas c
     where c.tipo = 'lead'
       and coalesce(c.primeira_msg_at, c.criado_em)
             >= public.metricas_desde(greatest(p_dias, 1), null)
       -- O mesmo crédito do resto das métricas: quem cadastrou, e na falta
       -- dele quem está com a conversa.
       -- O mesmo crédito da tela: quem trabalhou, e não quem recebeu a fila.
       -- Regra diferente aqui faria o gráfico discordar dos números logo acima.
       and (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
     group by 1
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object('dia', r.dia, 'leads', coalesce(c.n, 0))
             order by r.dia
           ),
           '[]'::jsonb
         )
    from regua r
    left join contados c on c.dia = r.dia;
$function$
;

CREATE OR REPLACE FUNCTION public.lider_por_code(p_code text)
 RETURNS TABLE(nome text, municipio text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nome, municipio from public.liderancas where link_code = p_code limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.liderancas_normaliza_telefone()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  -- Endereço de lid não é telefone: entra como ausente, que é a verdade. O
  -- cadastro continua valendo — nome, município e bairro estão certos. O número
  -- preenche sozinho quando a pessoa mandar a próxima mensagem e `fundir_lid`
  -- costurar a conversa.
  if coalesce(new.telefone, '') like 'lid.%' then
    new.telefone := null;
  end if;

  new.telefone_digitos := nullif(right(public.so_digitos(new.telefone), 11), '');
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.marcar_conexao(p_instancia text, p_estado text, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_antes text;
  v_novo  text := lower(coalesce(nullif(trim(p_estado), ''), 'desconhecido'));
  v_id    bigint;
begin
  if coalesce(p_instancia, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem instancia');
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
    -- Some quando volta: motivo velho pendurado em número de pé é pior que
    -- motivo nenhum — manda consertar o que já está funcionando.
    motivo_queda = case when v_novo = 'open' then null
                        else coalesce(p_motivo, motivo_queda) end,
    caiu_em    = case
                   when v_novo = 'open' then null
                   -- só na transição: 'close' repetido não reinicia o relógio
                   when coalesce(v_antes, '') = 'open' or caiu_em is null then now()
                   else caiu_em
                 end
  where id = v_id;

  if coalesce(v_antes, '') is distinct from v_novo then
    insert into public.conexao_eventos (numero_id, instancia, de, para)
    values (v_id, p_instancia, v_antes, v_novo);
  end if;

  return jsonb_build_object('ok', true, 'de', v_antes, 'para', v_novo,
                            'mudou', coalesce(v_antes, '') is distinct from v_novo);
end $function$
;

CREATE OR REPLACE FUNCTION public.material_pode_sair(p_numero bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_hora     int;
  v_dia      int;
  v_na_hora  int;
  v_no_dia   int;
  v_libera   timestamptz;
begin
  -- Número desconhecido não tem teto próprio; usa o padrão da tabela em vez de
  -- virar buraco por onde tudo passa.
  select coalesce(materiais_por_hora, 12), coalesce(materiais_por_dia, 60)
    into v_hora, v_dia
    from public.numeros where id = p_numero;

  if not found then
    v_hora := 12;
    v_dia  := 60;
  end if;

  -- `is not distinct from` e não `=`: conversa sem número cai no balde do nulo
  -- e continua tendo teto. Com `=` ela escaparia da conta em silêncio.
  select count(*) into v_na_hora
    from public.envios_material
   where numero_id is not distinct from p_numero
     and em >= now() - interval '1 hour';

  select count(*) into v_no_dia
    from public.envios_material
   where numero_id is not distinct from p_numero
     and em >= date_trunc('day', now() at time zone 'America/Bahia')
               at time zone 'America/Bahia';

  if v_na_hora >= v_hora then
    -- Quando libera: uma hora depois do envio mais antigo que ainda conta.
    select min(em) + interval '1 hour' into v_libera
      from (
        select em from public.envios_material
         where numero_id is not distinct from p_numero
           and em >= now() - interval '1 hour'
         order by em desc
         limit v_hora
      ) x;

    return jsonb_build_object(
      'pode', false,
      'motivo', 'hora',
      'teto', v_hora,
      'usados', v_na_hora,
      'minutos', greatest(1, ceil(extract(epoch from (v_libera - now())) / 60)::int)
    );
  end if;

  if v_no_dia >= v_dia then
    return jsonb_build_object(
      'pode', false,
      'motivo', 'dia',
      'teto', v_dia,
      'usados', v_no_dia
    );
  end if;

  return jsonb_build_object(
    'pode', true,
    'restam_hora', v_hora - v_na_hora,
    'restam_dia',  v_dia  - v_no_dia
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.material_saiu(p_numero bigint, p_conversa bigint, p_kit bigint, p_material bigint, p_atendente uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.envios_material
    (numero_id, conversa_id, kit_id, material_id, atendente_id)
  values (p_numero, p_conversa, p_kit, p_material, p_atendente);
end $function$
;

CREATE OR REPLACE FUNCTION public.metricas_ateh(p_ate date)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
           when p_ate is null then null
           else (p_ate + 1)::timestamp at time zone 'America/Bahia'
         end;
$function$
;

CREATE OR REPLACE FUNCTION public.metricas_atendimento(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with recorte as (
    select c.tipo, c.status_lead, c.demandas
      from public.conversas c
     where (public.metricas_desde(p_dias, p_de) is null
            or coalesce(c.primeira_msg_at, c.criado_em)
                 >= public.metricas_desde(p_dias, p_de))
       and (public.metricas_ateh(p_ate) is null
            or coalesce(c.primeira_msg_at, c.criado_em)
                 < public.metricas_ateh(p_ate))
       -- ── O CRÉDITO É DE QUEM CADASTROU ────────────────────────────────
       --
       -- Era `c.atendente_id`: quem está COM a conversa. Regra do Emanuel em
       -- 28/08 — o lead credita para quem cadastrou.
       --
       -- A diferença deixou de ser teórica quando os chips começaram a cair. A
       -- equipe atende pelo WhatsApp no aparelho, onde não existe atribuição
       -- nenhuma, e cadastra aqui. Contar por `atendente_id` daria crédito a
       -- quem a distribuição encostou na conversa, e zero a quem sentou e
       -- cadastrou as quatrocentas.
       --
       -- `cadastrado_por` vem de `cadastrar_manual` e de `confirmar_cadastro`,
       -- e a conversa de quem já estava na base herda o cadastrador original
       -- pelo gatilho `conversa_nasce_conhecida` — o crédito não muda de dono
       -- porque a pessoa escreveu de novo.
       --
       -- ── MAS SÓ `cadastrado_por` ZERAVA A TELA ────────────────────────
       --
       -- A regra nasceu com os chips caídos: a equipe atendia no aparelho e
       -- cadastrava aqui, então cadastrar ERA o trabalho e `cadastrado_por`
       -- era o único registro dele.
       --
       -- Agora as meninas atendem DENTRO do PIE. O lead chega pelo WhatsApp,
       -- ninguém "cadastra" nada, e `cadastrado_por` fica nulo. Filtrar por
       -- atendente devolvia zero para todas — 65 apoiadores no total e nenhum
       -- com dono, porque a pergunta era "quem cadastrou?" numa operação onde
       -- ninguém cadastra.
       --
       -- `coalesce` atende as duas operações sem escolher entre elas:
       --   cadastrou na mão  -> crédito de quem cadastrou (a regra dele, intacta)
       --   chegou pelo chip  -> crédito de quem está com a conversa, que num
       --                        chip por atendente é a dona do chip
       -- ── O CRÉDITO É DE QUEM TRABALHOU ────────────────────────────────
       --
       -- Era `coalesce(cadastrado_por, atendente_id)`. O `atendente_id` é quem
       -- a conversa foi ATRIBUÍDA, e a distribuição atribui sozinha: o crédito
       -- vinha sem ninguém ter feito nada.
       --
       -- Errava para os dois lados. A Maiana aparecia com 837 e tinha
       -- trabalhado 517 — 320 conversas caíram na fila dela e nunca foram
       -- respondidas. A Boneca aparecia com 691 e tinha trabalhado 707, porque
       -- parte do que ela fez foi em conversa atribuída a outra pessoa, e o
       -- `coalesce` só enxerga uma.
       --
       -- Numa campanha que decide escala por este número, inflar quem recebeu
       -- fila e apagar quem cobriu o buraco dos outros são o mesmo erro.
       and (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio    = p_municipio)
       and (p_origem    is null or c.origem       = p_origem)
  ),
  -- O eixo zero: lead e disparo separados. `filter` conta os dois numa
  -- varredura só, em vez de uma consulta para cada.
  totais as (
    select
      count(*) filter (where tipo = 'lead')    as leads,
      count(*) filter (where tipo = 'disparo') as disparos
    from recorte
  ),
  -- O eixo 1: uma categoria por pessoa, e por isso a soma FECHA o total.
  eixo1 as (
    select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) as status
      from (
        select status_lead as s, count(*) as n
          from recorte
         where status_lead is not null
         group by 1
      ) x
  ),
  -- O eixo 2 é independente: uma pessoa pode ter zero, uma ou várias demandas.
  -- Por isso ele SAI de um unnest e nunca fecha 100% — somar os dois eixos é o
  -- erro clássico, e o formato separado aqui é o que impede a soma.
  eixo2 as (
    select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) as demandas
      from (
        -- `lateral unnest` e não unnest na lista de seleção: função que
        -- devolve conjunto misturada com group by tem ordem de avaliação
        -- traiçoeira, e aqui o número tem que estar certo.
        select d, count(*) as n
          from recorte r, lateral unnest(r.demandas) as d
         group by 1
      ) y
  ),
  -- ── O TRABALHO DA EQUIPE, QUE É OUTRA PERGUNTA ─────────────────────────
  --
  -- Os eixos acima medem O TRÁFEGO: dos leads que ENTRARAM no período, quantos
  -- são apoiadores. A soma fecha 100% e é isso que faz o painel bater.
  --
  -- Só que essa conta não enxerga o trabalho de classificar. A pessoa que
  -- chegou anteontem e a atendente marcou como apoiadora hoje não aparece em
  -- lugar nenhum de "hoje" — foi assim que 49 classificações viraram 41 na
  -- tela, e as duas marcadas às 22h sumiram.
  --
  -- Este número responde a outra pergunta, e por isso vem SEPARADO em vez de
  -- entrar no eixo: quantas pessoas a equipe classificou no período. Somá-lo
  -- às barras faria o eixo passar de 100% dos leads, e painel que não fecha é
  -- painel que ninguém confia.
  --
  -- A janela aqui é `marcada_em` — quando o trabalho foi feito, e não quando a
  -- pessoa chegou. É a diferença inteira.
  --
  -- O crédito segue a mesma regra do resto: quem marcou, e na falta dele
  -- (marcação antiga, de antes de `marcada_por` ser gravado) quem está com a
  -- conversa.
  trabalho as (
    select count(distinct c.id) as classificadas
      from public.conversa_tags ct
      join public.tags t       on t.id = ct.tag_id
      join public.conversas c  on c.id = ct.conversa_id
     where t.eixo = 'status'
       and (public.metricas_desde(p_dias, p_de) is null
            or ct.marcada_em >= public.metricas_desde(p_dias, p_de))
       and (public.metricas_ateh(p_ate) is null
            or ct.marcada_em < public.metricas_ateh(p_ate))
       and (p_atendente is null
            or coalesce(ct.marcada_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  )
  select jsonb_build_object(
    'leads',         (select leads    from totais),
    'disparos',      (select disparos from totais),
    'status',        (select status   from eixo1),
    'demandas',      (select demandas from eixo2),
    'classificadas', (select classificadas from trabalho)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.metricas_desde(p_dias integer, p_de date)
 RETURNS timestamp with time zone
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select case
           when p_de is not null
             then p_de::timestamp at time zone 'America/Bahia'
           when p_dias is null then null
           -- HOJE é desde a meia-noite da Bahia, não as últimas 24 horas.
           when p_dias = 0
             then date_trunc('day', now() at time zone 'America/Bahia')
                    at time zone 'America/Bahia'
           else now() - make_interval(days => p_dias)
         end;
$function$
;

CREATE OR REPLACE FUNCTION public.metricas_janelas(p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with hoje as (
    select (now() at time zone 'America/Bahia')::date as d
  ),
  base as (
    select c.tipo,
           -- O dia da BAHIA. Em UTC, tudo que entra depois das 21h cairia no
           -- dia seguinte — e a noite é o pico de quem responde anúncio.
           (coalesce(c.primeira_msg_at, c.criado_em) at time zone 'America/Bahia')::date as dia,
           coalesce(c.primeira_msg_at, c.criado_em) as em
      from public.conversas c
     where (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
  n as (
    select
      count(*) filter (where tipo = 'lead' and dia = (select d from hoje))     as l_hoje,
      count(*) filter (where tipo = 'lead' and dia = (select d from hoje) - 1) as l_ontem,
      count(*) filter (where tipo = 'lead' and em >= now() - interval  '7 day') as l_7,
      count(*) filter (where tipo = 'lead' and em >= now() - interval '15 day') as l_15,
      count(*) filter (where tipo = 'lead' and em >= now() - interval '30 day') as l_30,
      count(*) filter (where tipo = 'lead' and em >= now() - interval '90 day') as l_90,
      count(*) filter (where tipo = 'lead')                                     as l_tudo,
      count(*) filter (where tipo = 'disparo' and dia = (select d from hoje))     as d_hoje,
      count(*) filter (where tipo = 'disparo' and dia = (select d from hoje) - 1) as d_ontem,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval  '7 day') as d_7,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval '15 day') as d_15,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval '30 day') as d_30,
      count(*) filter (where tipo = 'disparo' and em >= now() - interval '90 day') as d_90,
      count(*) filter (where tipo = 'disparo')                                     as d_tudo
    from base
  )
  -- A ordem é a da tela, e sai pronta do banco: montar a lista no servidor de
  -- aplicação obrigaria a repetir a ordem em dois lugares.
  select jsonb_build_array(
    jsonb_build_object('id','0',     'rotulo','Hoje',    'leads', l_hoje,  'disparos', d_hoje),
    jsonb_build_object('id','ontem', 'rotulo','Ontem',   'leads', l_ontem, 'disparos', d_ontem),
    jsonb_build_object('id','7',     'rotulo','7 dias',  'leads', l_7,     'disparos', d_7),
    jsonb_build_object('id','15',    'rotulo','15 dias', 'leads', l_15,    'disparos', d_15),
    jsonb_build_object('id','30',    'rotulo','30 dias', 'leads', l_30,    'disparos', d_30),
    jsonb_build_object('id','90',    'rotulo','90 dias', 'leads', l_90,    'disparos', d_90),
    jsonb_build_object('id','tudo',  'rotulo','Tudo',    'leads', l_tudo,  'disparos', d_tudo)
  ) from n;
$function$
;

CREATE OR REPLACE FUNCTION public.metricas_janelas_completo(p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Bahia')
             at time zone 'America/Bahia' as d
  ),
  -- A régua das janelas. `fim` nulo = até agora; só "Ontem" tem fim, porque é
  -- dia FECHADO — sem o fim ele viraria "os últimos dois dias".
  janelas(ordem, id, rotulo, ini, fim) as (
    select 1, '0',     'Hoje',    (select d from hoje),                      null::timestamptz
    union all select 2, 'ontem', 'Ontem',   (select d from hoje) - interval '1 day', (select d from hoje)
    union all select 3, '7',     '7 dias',  now() - interval  '7 day',       null
    union all select 4, '15',    '15 dias', now() - interval '15 day',       null
    union all select 5, '30',    '30 dias', now() - interval '30 day',       null
    union all select 6, '90',    '90 dias', now() - interval '90 day',       null
    union all select 7, 'tudo',  'Tudo',    '-infinity'::timestamptz,        null
  ),
  base as (
    select c.id, c.tipo, c.status_lead, c.demandas,
           coalesce(c.primeira_msg_at, c.criado_em) as em
      from public.conversas c
     where (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
  -- O trabalho de classificar tem janela PRÓPRIA: `marcada_em`, quando o
  -- trabalho foi feito, e não quando a pessoa chegou. É outra pergunta, e por
  -- isso vem separado — somá-lo aos eixos faria a barra passar de 100%.
  marcacoes as (
    select ct.conversa_id, ct.marcada_em
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
      join public.conversas c on c.id = ct.conversa_id
     where t.eixo = 'status'
       and (p_atendente is null
            or coalesce(ct.marcada_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  )
  select coalesce(jsonb_agg(x order by x_ordem), '[]'::jsonb)
    from (
      select j.ordem as x_ordem,
             jsonb_build_object(
               'id',     j.id,
               'rotulo', j.rotulo,
               'leads',    (select count(*) from base b
                             where b.tipo = 'lead' and b.em >= j.ini
                               and (j.fim is null or b.em < j.fim)),
               'disparos', (select count(*) from base b
                             where b.tipo = 'disparo' and b.em >= j.ini
                               and (j.fim is null or b.em < j.fim)),
               'status',   coalesce((
                             select jsonb_object_agg(s.status_lead, s.n)
                               from (select b.status_lead, count(*) as n
                                       from base b
                                      where b.em >= j.ini
                                        and (j.fim is null or b.em < j.fim)
                                        and b.status_lead is not null
                                      group by 1) s
                           ), '{}'::jsonb),
               'demandas', coalesce((
                             select jsonb_object_agg(d.dem, d.n)
                               from (select dd as dem, count(*) as n
                                       from base b, lateral unnest(b.demandas) as dd
                                      where b.em >= j.ini
                                        and (j.fim is null or b.em < j.fim)
                                      group by 1) d
                           ), '{}'::jsonb),
               'classificadas', (select count(distinct m.conversa_id)
                                   from marcacoes m
                                  where m.marcada_em >= j.ini
                                    and (j.fim is null or m.marcada_em < j.fim))
             ) as x
        from janelas j
    ) y;
$function$
;

CREATE OR REPLACE FUNCTION public.minha_subarvore()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with recursive rede as (
    select id from public.liderancas where auth_uid = auth.uid()
    union
    select l.id from public.liderancas l join rede r on l.parent_id = r.id
  ) cycle id set girou using caminho
  select id from rede;
$function$
;

CREATE OR REPLACE FUNCTION public.municipio_da_votacao_existe()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if not exists (
    select 1 from public.municipios_ba m
     where m.chave = public.chave_municipio(new.municipio)
  ) then
    raise exception
      'Município "%" não está na lista oficial dos 417 da Bahia.', new.municipio
      using hint = 'Confira a grafia. Voto do TSE é sempre por município — povoado e distrito não têm apuração própria.';
  end if;
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.municipio_na_grafia_oficial()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
declare
  v_nome text;
begin
  if new.municipio is null then
    return new;
  end if;

  new.municipio := btrim(new.municipio);

  select nome into v_nome
    from public.municipios_ba
   where chave = public.chave_municipio(new.municipio);

  if v_nome is not null then
    new.municipio := v_nome;
  end if;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.municipio_normaliza()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.municipio := public.municipio_oficial(new.municipio);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.municipio_normaliza_conversa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  new.municipio          := public.municipio_oficial(new.municipio);
  new.municipio_sugerido := public.municipio_oficial(new.municipio_sugerido);
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.municipio_oficial(v text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_limpo text := btrim(coalesce(v, ''));
  v_sem_uf text;
  v_achado text;
begin
  -- Sem letra é lixo de digitação: '..', ',,', '!!', '++', '-'. E o 'X' era o
  -- marcador de "não informado" da planilha de atendimentos.
  if v_limpo = '' or v_limpo !~ '[[:alpha:]]' or upper(v_limpo) = 'X' then
    return null;
  end if;

  -- Tira o sufixo de estado só para PROCURAR — nas duas formas que aparecem na
  -- base: a sigla ("Camaçari/BA", "ARACAJU-SE") e o nome por extenso
  -- ("Brumado Bahia", "Aracatu Bahia").
  v_sem_uf := btrim(regexp_replace(v_limpo, '\s*[/-]\s*[A-Za-z]{2}\s*$', ''));
  v_sem_uf := btrim(regexp_replace(v_sem_uf, '\s+bahia\s*$', '', 'i'));

  select m.nome into v_achado
    from public.municipios_ba m
   where public.chave_municipio(m.nome) = public.chave_municipio(v_sem_uf)
   limit 1;

  if v_achado is not null then
    return v_achado;
  end if;

  -- ── NÃO RECONHECIDO: PADRONIZA A CAIXA ───────────────────────────────────
  --
  -- Não é da Bahia, ou está escrito de um jeito que ninguém reconhece. O texto
  -- fica — inventar aqui é pior que deixar aparecer.
  --
  -- Mas a CAIXA é padronizada, senão 'chapada diamantina', 'Chapada diamantina'
  -- e 'CHAPADA DIAMANTINA' viram TRÊS linhas no filtro para a mesma coisa.
  v_limpo := initcap(v_limpo);

  -- A sigla do estado volta para maiúscula: `initcap` faria 'Aracaju/Se'.
  --
  -- Feito com `left`/`right` e NÃO com backreferência dentro de
  -- `regexp_replace`: o Postgres não deixa passar `\1` por `upper()`, e a
  -- tentativa escreveu a string literal "\1\2" no lugar do estado em 37
  -- linhas. O jeito torto falhava GRAVANDO, não dando erro.
  -- O separador vira barra sempre: 'ARACAJU-SE' e 'Aracaju/SE' são a mesma
  -- cidade e viravam duas linhas no filtro.
  v_limpo := regexp_replace(v_limpo, '\s*-\s*([A-Za-z]{2})$', '/\1');

  if v_limpo ~ '[/-][A-Za-z]{2}$' then
    v_limpo := left(v_limpo, length(v_limpo) - 2) || upper(right(v_limpo, 2));
  end if;

  return v_limpo;
end $function$
;

CREATE OR REPLACE FUNCTION public.municipios_nao_reconhecidos()
 RETURNS TABLE(valor text, pessoas bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select btrim(l.municipio) as valor, count(*) as pessoas
  from public.liderancas l
  where nullif(btrim(l.municipio), '') is not null
    and not exists (select 1 from public.municipios_ba m
                    where m.chave = public.chave_municipio(l.municipio))
  group by btrim(l.municipio)
  order by count(*) desc;
$function$
;

CREATE OR REPLACE FUNCTION public.nome_lideranca_por_code(p_code text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select nome from public.liderancas where link_code = p_code limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.opcoes_metricas()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select jsonb_build_object(
    'municipios', coalesce((
      select jsonb_agg(m order by m)
        from (select distinct municipio as m from public.conversas
               where municipio is not null and municipio <> '') a
    ), '[]'::jsonb),
    'origens', coalesce((
      select jsonb_agg(o order by o)
        from (select distinct origem as o from public.conversas
               where origem is not null and origem <> '') b
    ), '[]'::jsonb)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.painel_territorio()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
with pessoas as (
  select
    nullif(btrim(municipio), '')   as municipio,
    nullif(btrim(bairro), '')      as bairro,
    nullif(btrim(created_via), '') as origem,
    coalesce(tipo, 'lead')         as tipo,
    telefone, parent_id, created_at
  from public.liderancas
  -- `contato` fica de fora: sao 1.702 linhas da base antiga SEM TELEFONE.
  -- Nao e gente que a campanha alcanca, e somar faria "100% com telefone"
  -- virar mentira.
  where tipo is distinct from 'contato'
),
-- ── QUEM CONTA COMO MUNICIPE ────────────────────────────────────────────────
--
-- Antes: `where tipo = 'lead'`. As liderancas ficavam de fora de TODOS os
-- totais — coloriam o mapa (que le de `pessoas`) e sumiam dos cartoes.
--
-- Apareceu de verdade: 191 pessoas da planilha entraram, o mapa passou a
-- mostra-las, e o cartao continuou dizendo 83. A tela se contradizia sozinha —
-- 58 municipios alcancados, 83 pessoas.
--
-- Lideranca e pessoa da rede. E a que mais e.
leads as (
  select * from pessoas where tipo in ('lead', 'lideranca')
),
por_mun as (
  select municipio, count(*) as qtd
  from pessoas where municipio is not null group by municipio
),
por_bairro as (
  select municipio, bairro, count(*) as qtd
  from pessoas where municipio is not null and bairro is not null
  group by municipio, bairro
)
select jsonb_build_object(
  'mapa', coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'municipio', m.municipio, 'qtd', m.qtd,
        'bairros', coalesce((
          select jsonb_agg(jsonb_build_object('nome', b.bairro, 'qtd', b.qtd))
          from (
            select bairro, qtd from por_bairro b2
            where b2.municipio = m.municipio
            order by qtd desc, bairro limit 12
          ) b
        ), '[]'::jsonb)
      ) order by m.qtd desc
    ) from por_mun m
  ), '[]'::jsonb),
  'porMunicipio', coalesce((
    select jsonb_agg(jsonb_build_object('nome', t.municipio, 'qtd', t.qtd) order by t.qtd desc)
    from (select municipio, count(*) as qtd from leads where municipio is not null group by municipio) t
  ), '[]'::jsonb),
  'porOrigem', coalesce((
    select jsonb_agg(jsonb_build_object('nome', t.origem, 'qtd', t.qtd) order by t.qtd desc)
    from (select origem, count(*) as qtd from leads where origem is not null group by origem) t
  ), '[]'::jsonb),
  'total',       (select count(*) from leads),
  'comTelefone', (select count(*) from leads where telefone is not null),
  'vinculados',  (select count(*) from leads where parent_id is not null),
  'novosSemana', (select count(*) from leads where created_at >= now() - interval '7 days'),
  'semMunicipio',(select count(*) from pessoas where municipio is null)
)
$function$
;

CREATE OR REPLACE FUNCTION public.papel_arruma_o_resto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  -- A ÚNICA MUDANÇA: 'admin' entra nas duas listas.
  --
  -- Nas duas, e não só numa: se entrasse só em "agora", promover atendente a
  -- admin seria lido como ENTRADA no atendimento e a pessoa seria jogada no
  -- setor padrão de novo, mesmo que a coordenação a tivesse tirado de lá.
  v_atende_antes boolean := coalesce(old.role, '') in ('atendente', 'supervisor', 'admin');
  v_atende_agora boolean := coalesce(new.role, '') in ('atendente', 'supervisor', 'admin');
  v_setor bigint;
begin
  if v_atende_antes = v_atende_agora then
    return new;
  end if;

  -- ── ENTROU NO ATENDIMENTO ────────────────────────────────────────────────
  if v_atende_agora then
    insert into public.atendentes (id, nome, disponivel)
    values (new.id, coalesce(new.nome, 'sem nome'), true)
    on conflict (id) do update set disponivel = true;

    select id into v_setor
      from public.departamentos
     where padrao and ativo
     limit 1;

    if v_setor is not null then
      insert into public.departamento_membros (departamento_id, atendente_id)
      values (v_setor, new.id)
      on conflict (departamento_id, atendente_id) do nothing;
    end if;

    return new;
  end if;

  -- ── SAIU DO ATENDIMENTO ──────────────────────────────────────────────────
  --
  -- A ORDEM IMPORTA. Soltar as conversas ANTES de apagar a linha de atendente:
  -- depois de apagada não há mais como saber quais eram dela.
  --
  -- Só as ABERTAS voltam para a fila. As encerradas guardam o nome de quem
  -- atendeu — é histórico, e é de lá que sai o crédito por atendente na
  -- métrica. Apagar isso seria reescrever o que a pessoa fez.
  update public.conversas
     set atendente_id = null, atribuido_em = null, atualizado_em = now()
   where atendente_id = new.id
     and encerrada_em is null;

  -- O chip volta a ser de ninguém, e a tela de Números mostra isso.
  update public.numeros set atendente_id = null where atendente_id = new.id;

  delete from public.departamento_membros where atendente_id = new.id;
  delete from public.atendentes where id = new.id;

  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.perfil_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and status = 'ativo');
$function$
;

CREATE OR REPLACE FUNCTION public.perfil_atendimento()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') in ('admin', 'usuario', 'supervisor', 'atendente')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.perfil_ativo()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'ativo');
$function$
;

CREATE OR REPLACE FUNCTION public.perfil_equipe()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      -- `coalesce` porque conta antiga pode ter role nulo, e essas são da
      -- equipe: existiam antes de o campo existir.
      and coalesce(p.role, 'usuario') in ('admin', 'usuario')
      -- Conta que também é liderança na rede não é gabinete, salvo admin.
      and (
        p.role = 'admin'
        or not exists (select 1 from public.liderancas l where l.auth_uid = p.id)
      )
  );
$function$
;

CREATE OR REPLACE FUNCTION public.perfil_supervisao()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') in ('admin', 'usuario', 'supervisor')
  );
$function$
;

CREATE OR REPLACE FUNCTION public.pessoa_ja_conhecida(p_conversa bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_tel       text;
  v_dig       text;
  v_numero    bigint;
  v_lid       record;
  v_outras    jsonb;
  v_vezes     int;
begin
  -- Quem pergunta precisa enxergar a conversa. Sem isto, qualquer conta
  -- logada varreria a base inteira variando o id.
  if not exists (select 1 from public.conversas where id = p_conversa) then
    return jsonb_build_object('ok', false);
  end if;

  select c.telefone, c.numero_id into v_tel, v_numero
    from public.conversas c where c.id = p_conversa;

  v_dig := right(public.so_digitos(v_tel), 11);

  -- ── já está na base? ─────────────────────────────────────────────────────
  select l.nome, l.municipio, l.bairro, l.tipo, l.created_at,
         p.nome as quem, l.created_via
    into v_lid
    from public.liderancas l
    left join public.profiles p on p.id = l.cadastrado_por
   where l.telefone_digitos = v_dig
   limit 1;

  -- ── a mesma pessoa, falando em outro número, AGORA ───────────────────────
  --
  -- Só as ABERTAS. Conversa encerrada em outro número é histórico, não conflito
  -- — e mostrar tudo transformaria o aviso em ruído que ninguém lê.
  select coalesce(jsonb_agg(jsonb_build_object(
           'conversa_id', x.id,
           'numero',      x.apelido,
           'cor',         x.cor,
           'atendente',   x.atendente,
           'ultima',      x.ultima_msg_at
         ) order by x.ultima_msg_at desc), '[]'::jsonb)
    into v_outras
    from (
      select c.id, n.apelido, n.cor, a.nome as atendente, c.ultima_msg_at
        from public.conversas c
        join public.numeros n on n.id = c.numero_id
        left join public.atendentes a on a.id = c.atendente_id
       where c.telefone = v_tel
         and c.id <> p_conversa
         and c.encerrada_em is null
       limit 10
    ) x;

  select count(*) into v_vezes
    from public.conversas where telefone = v_tel;

  return jsonb_build_object(
    'ok', true,
    'cadastrada', v_lid.created_at is not null,
    'cadastro', case when v_lid.created_at is null then null else jsonb_build_object(
      'nome',      v_lid.nome,
      'municipio', v_lid.municipio,
      'bairro',    v_lid.bairro,
      'tipo',      v_lid.tipo,
      'em',        v_lid.created_at,
      'por',       coalesce(v_lid.quem, case v_lid.created_via
                     when 'whatsapp' then 'atendimento'
                     when 'import'   then 'importação da base'
                     else v_lid.created_via end),
      'via',       v_lid.created_via
    ) end,
    'outras_conversas', v_outras,
    'vezes', v_vezes
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.placar_liderancas()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'id', l.id, 'nome', l.nome, 'municipio', l.municipio,
               'pessoas', coalesce(c.total, 0),
               'semana',  coalesce(c.semana, 0)
             )
             order by coalesce(c.total, 0) desc, l.nome
           ),
           '[]'::jsonb
         )
    from public.liderancas l
    left join (
      select parent_id,
             count(*) as total,
             count(*) filter (where created_at >= now() - interval '7 day') as semana
        from public.liderancas
       where tipo = 'contato' and parent_id is not null
       group by parent_id
    ) c on c.parent_id = l.id
   where coalesce(l.tipo, 'lideranca') = 'lideranca';
$function$
;

CREATE OR REPLACE FUNCTION public.placar_qr()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'link_id',   l.id,
               'slug',      l.slug,
               'nome',      l.nome,
               'aberturas', c.aberturas,
               'pessoas',   c.pessoas,
               'robos',     c.robos,
               'hoje',      c.hoje,
               'primeira',  c.primeira,
               'ultima',    c.ultima
             )
             order by c.pessoas desc, l.nome
           ),
           '[]'::jsonb
         )
    from public.links l
    join lateral (
      select count(*) filter (where not x.robo)                as aberturas,
             count(*) filter (where x.robo)                    as robos,
             -- Cada impressão distinta é uma pessoa; o que não tem impressão
             -- (leitura antiga) conta um a um.
             count(distinct x.impressao) filter (where not x.robo and x.impressao is not null)
               + count(*) filter (where not x.robo and x.impressao is null)
                                                               as pessoas,
             -- Hoje também por PESSOA. Uma pessoa que escaneia três vezes no
             -- mesmo dia é uma pessoa, e o cartão dizia três.
             count(distinct coalesce(x.impressao, x.id::text)) filter (
               where not x.robo
                 and x.em >= date_trunc('day', now() at time zone 'America/Bahia')
                       at time zone 'America/Bahia')           as hoje,
             min(x.em) as primeira,
             max(x.em) as ultima
        from public.link_leituras x
       where x.link_id = l.id
    ) c on true;
$function$
;

CREATE OR REPLACE FUNCTION public.profiles_nasce_pendente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not (public.perfil_admin() or public.sem_sessao()) then
    new.status := 'pendente';
    new.role := coalesce(nullif(new.role, 'admin'), 'usuario');
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.profiles_trava_privilegio()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if public.perfil_admin() or public.sem_sessao() then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'somente um administrador pode alterar o papel';
  end if;
  if new.status is distinct from old.status then
    raise exception 'somente um administrador pode alterar o status';
  end if;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.puxa_etiquetas_pendentes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_dig text := right(public.so_digitos(new.telefone), 11);
  v_p record;
  v_tag bigint;
begin
  if v_dig is null or length(v_dig) < 10 then return new; end if;

  for v_p in
    select * from public.etiquetas_pendentes
     where digitos = v_dig and aplicada_em is null order by chegou_em
  loop
    select public.tag_do_whatsapp(v_p.label) into v_tag;
    if v_tag is null then continue; end if;

    if v_p.remover then
      delete from public.conversa_tags where conversa_id = new.id and tag_id = v_tag;
    else
      insert into public.conversa_tags (conversa_id, tag_id)
      values (new.id, v_tag) on conflict do nothing;
      delete from public.conversa_tags ct
       using public.tags t, public.tags novo
       where ct.conversa_id = new.id and ct.tag_id = t.id
         and novo.id = v_tag and novo.eixo = 'status'
         and t.eixo = 'status' and t.id <> v_tag;
    end if;

    update public.etiquetas_pendentes set aplicada_em = now() where id = v_p.id;
  end loop;
  return new;
end $function$
;

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

CREATE OR REPLACE FUNCTION public.registrar_contato_wa(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_parent uuid;
begin
  select id into v_parent from public.liderancas where link_code = p_code limit 1;
  if v_parent is null then
    return;  -- código inválido: não grava
  end if;
  insert into public.liderancas (nome, tipo, parent_id)
  values ('Contato via WhatsApp', 'contato', v_parent);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resumo_geral()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'liderancas', (select count(*) from public.liderancas where tipo = 'lideranca'),
    'leads',      (select count(*) from public.liderancas where tipo = 'lead'),
    'votos',      (select coalesce(sum(votos_comprometidos), 0) from public.liderancas),
    'municipios', (select count(distinct m.nome) from public.liderancas l
                     join public.municipios_ba m on m.chave = public.chave_municipio(l.municipio)),
    'municipios_total', (select count(*) from public.municipios_ba),
    'grafias_soltas', (select count(distinct btrim(l.municipio)) from public.liderancas l
                        where nullif(btrim(l.municipio), '') is not null
                          and not exists (select 1 from public.municipios_ba m
                                          where m.chave = public.chave_municipio(l.municipio)))
  );
$function$
;

CREATE OR REPLACE FUNCTION public.sem_sessao()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  select auth.uid() is null;
$function$
;

CREATE OR REPLACE FUNCTION public.so_digitos(v text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case
           when coalesce(v, '') like 'lid.%' then ''
           else (
             select case
                      -- 55 + DDD + OITO: celular antigo, sem o nono dígito. É
                      -- assim que o WhatsApp entrega conta velha. Doze dígitos
                      -- começando em 55 não pode ser outra coisa — local de
                      -- nove daria treze, e DDD com local de dez não existe.
                      --
                      -- O teste do primeiro dígito local protege o FIXO: 2 a 5
                      -- é telefone de casa, tem oito dígitos e não ganha nono.
                      when length(d) = 12
                       and left(d, 2) = '55'
                       and substr(d, 5, 1) in ('6', '7', '8', '9')
                        then substr(d, 1, 4) || '9' || substr(d, 5)

                      -- Mesma forma, mas fixo: tira só o código do país. Sem
                      -- isto o `right(...,11)` come o '5' do 55 e estraga igual.
                      when length(d) = 12 and left(d, 2) = '55'
                        then substr(d, 3)

                      -- DDD + NOVE + oito, com um dígito sobrando no fim. É
                      -- como a exportação do Gabiflow entrega: 719964959300.
                      when length(d) = 12
                       and public.ddd_valido(left(d, 2))
                       and substr(d, 3, 1) = '9'
                        then substr(d, 1, 11)

                      -- DDD + OITO, sem código do país. Digitado à mão, sem o
                      -- nono dígito.
                      when length(d) = 10 and substr(d, 3, 1) in ('6','7','8','9')
                        then substr(d, 1, 2) || '9' || substr(d, 3)

                      else d
                    end
               from (select regexp_replace(coalesce(v, ''), '\D', '', 'g')) as t(d)
           )
         end;
$function$
;

CREATE OR REPLACE FUNCTION public.supervisao_janelas()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Bahia')
             at time zone 'America/Bahia' as d
  ),
  janelas(ordem, id, rotulo, ini, fim) as (
    select 1, '0',     'Hoje',    (select d from hoje),                      null::timestamptz
    union all select 2, 'ontem', 'Ontem',   (select d from hoje) - interval '1 day', (select d from hoje)
    union all select 3, '7',     '7 dias',  now() - interval  '7 day',       null
    union all select 4, '15',    '15 dias', now() - interval '15 day',       null
    union all select 5, '30',    '30 dias', now() - interval '30 day',       null
    union all select 6, '90',    '90 dias', now() - interval '90 day',       null
    union all select 7, 'tudo',  'Tudo',    '-infinity'::timestamptz,        null
  )
  select coalesce(jsonb_agg(x order by ordem), '[]'::jsonb)
    from (
      select j.ordem,
             jsonb_build_object(
               'id',     j.id,
               'rotulo', j.rotulo,
               -- Quantas pessoas escreveram para a campanha no período.
               'recebidas', (select count(*) from public.mensagens m
                              where m.direcao = 'inbound'
                                and m.momento >= j.ini
                                and (j.fim is null or m.momento < j.fim)),
               -- Quantas respostas saíram — pelo PIE ou pelo celular.
               'enviadas',  (select count(*) from public.mensagens m
                              where m.direcao = 'outbound'
                                and m.momento >= j.ini
                                and (j.fim is null or m.momento < j.fim)),
               -- Conversas que NASCERAM no período.
               'chegaram',  (select count(*) from public.conversas c
                              where coalesce(c.primeira_msg_at, c.criado_em) >= j.ini
                                and (j.fim is null
                                     or coalesce(c.primeira_msg_at, c.criado_em) < j.fim)),
               -- Conversas que receberam a PRIMEIRA resposta no período. Não é
               -- o mesmo que "chegaram": a pessoa pode ter escrito ontem e
               -- sido respondida hoje, e é justamente esse atraso que a
               -- supervisão precisa enxergar.
               'respondidas', (select count(*) from public.conversas c
                                where c.primeira_resp_at >= j.ini
                                  and (j.fim is null or c.primeira_resp_at < j.fim)),
               'encerradas', (select count(*) from public.conversas c
                               where c.encerrada_em >= j.ini
                                 and (j.fim is null or c.encerrada_em < j.fim))
             ) as x
        from janelas j
    ) y;
$function$
;

CREATE OR REPLACE FUNCTION public.tag_alimenta_eixos()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_eixo     text;
  v_valor    text;
  v_conversa bigint;
begin
  v_conversa := coalesce(new.conversa_id, old.conversa_id);

  select t.eixo, t.valor into v_eixo, v_valor
    from public.tags t
   where t.id = coalesce(new.tag_id, old.tag_id);

  -- Etiqueta de trabalho não mexe em métrica.
  if v_eixo is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if v_eixo = 'status' then
      -- STATUS É UM SÓ. Marcar "Apoiador" em quem já era "Indeciso" tem de
      -- TIRAR o indeciso — senão a soma passa de 100% e o eixo perde o sentido.
      delete from public.conversa_tags ct
       using public.tags t
       where ct.conversa_id = v_conversa
         and ct.tag_id = t.id
         and t.eixo = 'status'
         and ct.tag_id <> new.tag_id;

      update public.conversas
         set status_lead = v_valor, atualizado_em = now()
       where id = v_conversa;
    else
      update public.conversas
         set demandas = (
               select array_agg(distinct d)
                 from unnest(demandas || array[v_valor]) as d
             ),
             atualizado_em = now()
       where id = v_conversa;
    end if;

  elsif tg_op = 'DELETE' then
    if v_eixo = 'status' then
      update public.conversas
         set status_lead = null, atualizado_em = now()
       where id = v_conversa and status_lead = v_valor;
    else
      update public.conversas
         set demandas = array_remove(demandas, v_valor), atualizado_em = now()
       where id = v_conversa;
    end if;
  end if;

  return coalesce(new, old);
end $function$
;

CREATE OR REPLACE FUNCTION public.tag_do_whatsapp(p_nome text)
 RETURNS bigint
 LANGUAGE sql
 STABLE
AS $function$
  select id from public.tags
   where ativa
     and (public.chave_etiqueta(wa_label) = public.chave_etiqueta(p_nome)
       or public.chave_etiqueta(nome)     = public.chave_etiqueta(p_nome))
   order by (public.chave_etiqueta(wa_label) = public.chave_etiqueta(p_nome)) desc
   limit 1;
$function$
;

CREATE OR REPLACE FUNCTION public.transferir_conversa(p_conversa bigint, p_departamento bigint, p_para_atendente uuid DEFAULT NULL::uuid, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_de_atendente    uuid;
  v_de_departamento bigint;
  v_telefone        text;
  v_nome_setor      text;
  v_nome_pessoa     text;
begin
  if not public.perfil_atendimento() then
    raise exception 'sem permissao para transferir';
  end if;

  select c.atendente_id, c.departamento_id, c.telefone
    into v_de_atendente, v_de_departamento, v_telefone
    from public.conversas c
   where c.id = p_conversa
   for update;

  if v_telefone is null then
    raise exception 'conversa % nao existe', p_conversa;
  end if;

  select d.nome into v_nome_setor
    from public.departamentos d
   where d.id = p_departamento and d.ativo;

  if v_nome_setor is null then
    raise exception 'departamento % nao existe ou esta desativado', p_departamento;
  end if;

  -- A PESSOA TEM DE SER DO SETOR PARA ONDE A CONVERSA ESTÁ INDO.
  --
  -- Sem esta conferência, a tela poderia mandar a conversa para o Jurídico e
  -- atribuir a alguém da Recepção. Ficaria certo em um campo e errado no outro,
  -- e nenhum relatório denunciaria.
  if p_para_atendente is not null then
    select a.nome into v_nome_pessoa
      from public.departamento_membros m
      join public.atendentes a on a.id = m.atendente_id
     where m.departamento_id = p_departamento
       and m.atendente_id = p_para_atendente;

    if v_nome_pessoa is null then
      raise exception 'esta pessoa nao faz parte do setor %', v_nome_setor;
    end if;
  end if;

  update public.conversas
     set departamento_id = p_departamento,
         atendente_id    = p_para_atendente,   -- null = volta para a fila
         atribuido_em    = case when p_para_atendente is not null then now() end,
         atualizado_em   = now()
   where id = p_conversa;

  insert into public.atribuicoes (
    conversa_id, telefone, de_atendente, para_atendente,
    de_departamento, para_departamento, motivo, regra, feita_por
  ) values (
    p_conversa, v_telefone, v_de_atendente, p_para_atendente,
    v_de_departamento, p_departamento, 'transferencia',
    coalesce(
      p_observacao,
      case when p_para_atendente is null then 'para-a-fila' else 'para-pessoa' end
    ),
    auth.uid()
  );

  return jsonb_build_object(
    'ok', true,
    'setor', v_nome_setor,
    'pessoa', v_nome_pessoa
  );
end $function$
;

CREATE OR REPLACE FUNCTION public.unaccent_simples(t text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
$function$
;

CREATE OR REPLACE FUNCTION public.vincular_lideranca(p_codigo text, p_nome text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_id uuid; v_auth uuid;
begin
  select id, auth_uid into v_id, v_auth from public.liderancas where lower(cod_acesso)=lower(p_codigo) limit 1;
  if v_id is null then return 'codigo-invalido'; end if;
  if v_auth is not null and v_auth <> auth.uid() then return 'ja-vinculada'; end if;
  update public.liderancas set auth_uid = auth.uid(), nome = coalesce(nullif(p_nome,''), nome) where id = v_id;
  update public.profiles set role='lideranca', status='ativo' where id = auth.uid();
  return 'ok';
end; $function$
;


-- ══════════════════════════════════════════════════════════════════════════
-- SEQUÊNCIAS
-- ══════════════════════════════════════════════════════════════════════════

create sequence if not exists public.atribuicoes_id_seq;

create sequence if not exists public.audios_id_seq;

create sequence if not exists public.candidato_votos_id_seq;

create sequence if not exists public.candidatos_dobradinha_id_seq;

create sequence if not exists public.conexao_eventos_id_seq;

create sequence if not exists public.conversas_id_seq;

create sequence if not exists public.departamento_turnos_id_seq;

create sequence if not exists public.departamentos_id_seq;

create sequence if not exists public.envios_material_id_seq;

create sequence if not exists public.etiquetas_pendentes_id_seq;

create sequence if not exists public.exportacoes_id_seq;

create sequence if not exists public.fluxo_passos_id_seq;

create sequence if not exists public.fluxos_id_seq;

create sequence if not exists public.kit_itens_id_seq;

create sequence if not exists public.kits_id_seq;

create sequence if not exists public.link_leituras_id_seq;

create sequence if not exists public.link_lideres_id_seq;

create sequence if not exists public.links_id_seq;

create sequence if not exists public.mensagens_id_seq;

create sequence if not exists public.numeros_id_seq;

create sequence if not exists public.tags_id_seq;


-- ══════════════════════════════════════════════════════════════════════════
-- TABELAS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Só colunas e valores padrão. Chaves e restrições vêm depois, para que a ordem
-- entre tabelas deixe de importar — uma chave estrangeira não pode apontar para
-- uma tabela que ainda não existe.

create table if not exists public.atendentes (
  id uuid not null,
  nome text not null,
  disponivel boolean default false not null,
  capacidade integer default 20 not null,
  demandas text[] default '{}'::text[] not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null
);

create table if not exists public.atendimentos (
  id bigint not null,
  phone text not null,
  contact_name text,
  status_conversa text,
  department text,
  assigned_to text,
  unread_count integer default 0,
  total_messages integer default 0,
  last_message text,
  last_message_at timestamp with time zone,
  criado_em timestamp with time zone,
  atualizado_em timestamp with time zone,
  status_lead text,
  demandas text[] default '{}'::text[],
  municipio text,
  bairro text,
  origem text,
  primeira_msg_at timestamp with time zone,
  primeira_resp_at timestamp with time zone,
  ultima_direcao text,
  respondida_por text,
  mensagens_lidas integer default 0,
  sincronizado_em timestamp with time zone default now(),
  tipo text
);

create table if not exists public.atribuicoes (
  id bigint default nextval('public.atribuicoes_id_seq'::regclass) not null,
  conversa_id bigint not null,
  telefone text not null,
  de_atendente uuid,
  para_atendente uuid,
  motivo text not null,
  regra text,
  feita_por uuid,
  criado_em timestamp with time zone default now() not null,
  de_departamento bigint,
  para_departamento bigint
);

create table if not exists public.campanhas_trafego (
  id uuid default gen_random_uuid() not null,
  campaign_id text,
  campanha text,
  objetivo text,
  status text,
  orcamento numeric(12,2),
  gasto numeric(12,2) default 0,
  alcance integer default 0,
  frequencia numeric(6,2) default 0,
  impressoes integer default 0,
  cliques integer default 0,
  resultados integer default 0,
  tipo_resultado text,
  fonte text default 'meta'::text,
  criado_por uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.candidato_votos (
  id bigint default nextval('public.candidato_votos_id_seq'::regclass) not null,
  candidato_id bigint not null,
  municipio text not null,
  votos integer default 0 not null,
  atualizado_em timestamp with time zone default now() not null,
  atualizado_por uuid
);

create table if not exists public.candidatos_dobradinha (
  id bigint default nextval('public.candidatos_dobradinha_id_seq'::regclass) not null,
  nome text not null,
  cargo text default 'estadual'::text not null,
  numero text,
  partido text,
  eleicao integer default 2022 not null,
  ativo boolean default true not null,
  observacoes text,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null
);

create table if not exists public.conexao_eventos (
  id bigint default nextval('public.conexao_eventos_id_seq'::regclass) not null,
  numero_id bigint,
  instancia text not null,
  de text,
  para text not null,
  em timestamp with time zone default now() not null
);

create table if not exists public.conjuntos_trafego (
  id uuid default gen_random_uuid() not null,
  adset_id text,
  nome text,
  campanha text,
  status text,
  otimizacao text,
  orcamento numeric(12,2),
  gasto numeric(12,2) default 0,
  alcance integer default 0,
  impressoes integer default 0,
  cliques integer default 0,
  resultados integer default 0,
  tipo_resultado text,
  fonte text default 'meta'::text,
  criado_por uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.conversa_tags (
  conversa_id bigint not null,
  tag_id bigint not null,
  marcada_por uuid,
  marcada_em timestamp with time zone default now() not null
);

create table if not exists public.conversas (
  id bigint default nextval('public.conversas_id_seq'::regclass) not null,
  telefone text not null,
  nome text,
  foto_url text,
  instancia text,
  tipo text default 'lead'::text not null,
  status_lead text,
  demandas text[] default '{}'::text[] not null,
  municipio text,
  bairro text,
  origem text,
  primeira_msg_at timestamp with time zone,
  primeira_resp_at timestamp with time zone,
  ultima_direcao text,
  atendente_id uuid,
  atribuido_em timestamp with time zone,
  encerrada_em timestamp with time zone,
  fluxo_estagio text,
  ultima_msg text,
  ultima_msg_at timestamp with time zone,
  total_mensagens integer default 0 not null,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  nome_sugerido text,
  municipio_sugerido text,
  bairro_sugerido text,
  indicado_por text,
  lideranca_id uuid,
  cadastrado_em timestamp with time zone,
  cadastrado_por uuid,
  departamento_id bigint,
  numero_id bigint,
  ultima_entrada_at timestamp with time zone,
  fluxo_passo integer default 0 not null,
  fluxo_em timestamp with time zone
);

create table if not exists public.criativos_trafego (
  id uuid default gen_random_uuid() not null,
  ad_id text not null,
  ad_name text,
  campanha text,
  thumbnail_url text,
  status text,
  gasto numeric(12,2) default 0 not null,
  impressoes integer default 0 not null,
  cliques integer default 0 not null,
  resultados integer default 0 not null,
  tipo_resultado text,
  fonte text default 'meta'::text not null,
  criado_por uuid,
  created_at timestamp with time zone default now() not null,
  objetivo text
);

create table if not exists public.demandas (
  id uuid default gen_random_uuid() not null,
  municipe_id uuid,
  municipe_nome text,
  municipio text,
  titulo text not null,
  descricao text,
  categoria text default 'outros'::text not null,
  prioridade text default 'normal'::text not null,
  status text default 'aberta'::text not null,
  prazo date,
  resposta text,
  resolvida_em timestamp with time zone,
  criado_por uuid,
  created_at timestamp with time zone default now() not null,
  updated_at timestamp with time zone default now() not null,
  bairro text
);

create table if not exists public.departamento_membros (
  departamento_id bigint not null,
  atendente_id uuid not null,
  criado_em timestamp with time zone default now() not null
);

create table if not exists public.departamento_turnos (
  id bigint default nextval('public.departamento_turnos_id_seq'::regclass) not null,
  departamento_id bigint not null,
  dia smallint not null,
  abre time without time zone not null,
  fecha time without time zone not null
);

create table if not exists public.departamentos (
  id bigint default nextval('public.departamentos_id_seq'::regclass) not null,
  nome text not null,
  cor text default '#52535c'::text not null,
  descricao text,
  ativo boolean default true not null,
  ordem integer default 100 not null,
  criado_em timestamp with time zone default now() not null,
  padrao boolean default false not null,
  auto_atribuir boolean default true not null,
  sla_resposta_min integer default 60 not null,
  palavras_chave text[] default '{}'::text[] not null,
  fuso text default 'America/Bahia'::text not null
);

create table if not exists public.envios_material (
  id bigint default nextval('public.envios_material_id_seq'::regclass) not null,
  numero_id bigint,
  conversa_id bigint,
  kit_id bigint,
  material_id bigint,
  atendente_id uuid,
  em timestamp with time zone default now() not null
);

create table if not exists public.etiquetas_pendentes (
  id bigint default nextval('public.etiquetas_pendentes_id_seq'::regclass) not null,
  telefone text not null,
  instancia text,
  label text not null,
  remover boolean default false not null,
  chegou_em timestamp with time zone default now() not null,
  aplicada_em timestamp with time zone,
  digitos text generated always as ("right"(so_digitos(telefone), 11)) stored
);

create table if not exists public.exportacoes (
  id bigint default nextval('public.exportacoes_id_seq'::regclass) not null,
  quem uuid,
  quem_email text,
  o_que text not null,
  filtros jsonb default '{}'::jsonb not null,
  linhas integer not null,
  criado_em timestamp with time zone default now() not null
);

create table if not exists public.fluxo_passos (
  id bigint default nextval('public.fluxo_passos_id_seq'::regclass) not null,
  fluxo_id bigint not null,
  ordem integer not null,
  estagio text not null,
  titulo text not null,
  mensagem text,
  criterio text,
  automatico boolean default false not null,
  espera_resposta boolean default true not null,
  guarda_em text
);

create table if not exists public.fluxos (
  id bigint default nextval('public.fluxos_id_seq'::regclass) not null,
  nome text not null,
  descricao text,
  ativo boolean default false not null,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null,
  modo text default 'rascunho'::text not null,
  telefones_teste text[] default '{}'::text[] not null
);

create table if not exists public.kit_itens (
  id bigint default nextval('public.kit_itens_id_seq'::regclass) not null,
  kit_id bigint not null,
  material_id bigint not null,
  ordem integer default 100 not null
);

create table if not exists public.kits (
  id bigint default nextval('public.kits_id_seq'::regclass) not null,
  nome text not null,
  quando text,
  cor text default '#0525f7'::text not null,
  ordem integer default 100 not null,
  ativo boolean default true not null,
  vezes integer default 0 not null,
  ultimo_uso timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null
);

create table if not exists public.liderancas (
  id uuid default gen_random_uuid() not null,
  nome text not null,
  municipio text,
  bairro text,
  telefone text,
  tipo text default 'lideranca'::text not null,
  parent_id uuid,
  link_code text,
  cod_acesso text,
  votos_comprometidos integer default 0,
  created_via text default 'manual'::text,
  auth_uid uuid,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  telefone_digitos text,
  cadastrado_por uuid,
  observacoes text
);

create table if not exists public.link_leituras (
  id bigint default nextval('public.link_leituras_id_seq'::regclass) not null,
  link_id bigint not null,
  em timestamp with time zone default now() not null,
  referencia text,
  lider_id bigint,
  impressao text,
  robo boolean default false not null
);

create table if not exists public.link_lideres (
  id bigint default nextval('public.link_lideres_id_seq'::regclass) not null,
  link_id bigint not null,
  nome text not null,
  codigo text not null,
  lideranca_id uuid,
  criado_em timestamp with time zone default now() not null
);

create table if not exists public.links (
  id bigint default nextval('public.links_id_seq'::regclass) not null,
  slug text not null,
  nome text not null,
  destino text,
  ativo boolean default true not null,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null,
  atualizado_em timestamp with time zone default now() not null,
  arte text,
  categoria text
);

create table if not exists public.materiais (
  id bigint default nextval('public.audios_id_seq'::regclass) not null,
  titulo text not null,
  quando text,
  arquivo text,
  mime text,
  duracao_seg integer,
  bytes integer,
  ordem integer default 100 not null,
  ativo boolean default true not null,
  vezes integer default 0 not null,
  ultimo_uso timestamp with time zone,
  criado_por uuid,
  criado_em timestamp with time zone default now() not null,
  tipo text default 'audio'::text not null,
  texto text
);

create table if not exists public.mensagens (
  id bigint default nextval('public.mensagens_id_seq'::regclass) not null,
  conversa_id bigint not null,
  wa_id text,
  telefone text not null,
  direcao text not null,
  tipo text default 'texto'::text not null,
  texto text,
  midia_url text,
  midia_mime text,
  duracao_seg integer,
  enviada_por uuid,
  status text,
  momento timestamp with time zone not null,
  bruto jsonb,
  criado_em timestamp with time zone default now() not null,
  midia_arquivo text,
  midia_erro text,
  midia_previa text,
  texto_original text,
  editada_em timestamp with time zone,
  editada_por uuid,
  responde_wa_id text
);

create table if not exists public.metas_campanha (
  id uuid default gen_random_uuid() not null,
  campanha text not null,
  rotulo text,
  meta integer default 0 not null,
  criado_por uuid,
  created_at timestamp with time zone default now() not null
);

create table if not exists public.metricas_trafego (
  id uuid default gen_random_uuid() not null,
  data date not null,
  campanha text,
  alcance integer default 0 not null,
  impressoes integer default 0 not null,
  cliques integer default 0 not null,
  gasto numeric(12,2) default 0 not null,
  resultados integer default 0 not null,
  tipo_resultado text,
  fonte text default 'manual'::text not null,
  criado_por uuid,
  created_at timestamp with time zone default now() not null,
  objetivo text,
  status text,
  frequencia numeric(6,2) default 0,
  orcamento numeric(12,2)
);

create table if not exists public.municipios_ba (
  nome text not null,
  chave text not null
);

create table if not exists public.numeros (
  id bigint default nextval('public.numeros_id_seq'::regclass) not null,
  apelido text not null,
  telefone text,
  instancia text not null,
  provedor text default 'evolution'::text not null,
  cor text default '#0525f7'::text not null,
  ativo boolean default true not null,
  ordem integer default 100 not null,
  departamento_id bigint,
  criado_em timestamp with time zone default now() not null,
  atendente_id uuid,
  conexao text default 'desconhecido'::text not null,
  conexao_em timestamp with time zone,
  caiu_em timestamp with time zone,
  materiais_por_hora integer default 12 not null,
  materiais_por_dia integer default 60 not null,
  motivo_queda text
);

create table if not exists public.profiles (
  id uuid not null,
  nome text,
  email text,
  role text default 'usuario'::text not null,
  status text default 'pendente'::text not null,
  created_at timestamp with time zone default now()
);

create table if not exists public.registros_disparo (
  id uuid default gen_random_uuid() not null,
  data date not null,
  turno text default 'manha'::text not null,
  enviados integer default 0 not null,
  apoios integer default 0 not null,
  outras_devolutivas integer default 0 not null,
  restricao boolean default false not null,
  observacoes text,
  criado_por uuid,
  created_at timestamp with time zone default now()
);

create table if not exists public.tags (
  id bigint default nextval('public.tags_id_seq'::regclass) not null,
  nome text not null,
  cor text default '#5b6779'::text not null,
  descricao text,
  ativa boolean default true not null,
  ordem integer default 0 not null,
  criado_em timestamp with time zone default now() not null,
  eixo text,
  valor text,
  wa_label text
);

create table if not exists public.trafego_sync (
  id integer default 1 not null,
  ultima_sync timestamp with time zone,
  since date,
  until date,
  alcance integer default 0,
  frequencia numeric(6,2) default 0,
  impressoes integer default 0,
  cliques integer default 0,
  gasto numeric(12,2) default 0,
  pixel_nome text,
  pixel_ultimo timestamp with time zone,
  atualizado_por uuid,
  conta_nome text,
  conta_status integer,
  conta_saldo numeric(12,2)
);


-- ══════════════════════════════════════════════════════════════════════════
-- A QUEM CADA SEQUÊNCIA PERTENCE
-- ══════════════════════════════════════════════════════════════════════════

alter sequence public.atribuicoes_id_seq owned by public.atribuicoes.id;

alter sequence public.audios_id_seq owned by public.materiais.id;

alter sequence public.candidato_votos_id_seq owned by public.candidato_votos.id;

alter sequence public.candidatos_dobradinha_id_seq owned by public.candidatos_dobradinha.id;

alter sequence public.conexao_eventos_id_seq owned by public.conexao_eventos.id;

alter sequence public.conversas_id_seq owned by public.conversas.id;

alter sequence public.departamento_turnos_id_seq owned by public.departamento_turnos.id;

alter sequence public.departamentos_id_seq owned by public.departamentos.id;

alter sequence public.envios_material_id_seq owned by public.envios_material.id;

alter sequence public.etiquetas_pendentes_id_seq owned by public.etiquetas_pendentes.id;

alter sequence public.exportacoes_id_seq owned by public.exportacoes.id;

alter sequence public.fluxo_passos_id_seq owned by public.fluxo_passos.id;

alter sequence public.fluxos_id_seq owned by public.fluxos.id;

alter sequence public.kit_itens_id_seq owned by public.kit_itens.id;

alter sequence public.kits_id_seq owned by public.kits.id;

alter sequence public.link_leituras_id_seq owned by public.link_leituras.id;

alter sequence public.link_lideres_id_seq owned by public.link_lideres.id;

alter sequence public.links_id_seq owned by public.links.id;

alter sequence public.mensagens_id_seq owned by public.mensagens.id;

alter sequence public.numeros_id_seq owned by public.numeros.id;

alter sequence public.tags_id_seq owned by public.tags.id;


-- ══════════════════════════════════════════════════════════════════════════
-- CHAVES E RESTRIÇÕES
-- ══════════════════════════════════════════════════════════════════════════
--
-- Primária, única e de verificação primeiro; estrangeira por último, quando
-- toda tabela já existe.

alter table public.atendentes
  add constraint atendentes_pkey PRIMARY KEY (id);

alter table public.atendimentos
  add constraint atendimentos_pkey PRIMARY KEY (id);

alter table public.atribuicoes
  add constraint atribuicoes_pkey PRIMARY KEY (id);

alter table public.campanhas_trafego
  add constraint campanhas_trafego_pkey PRIMARY KEY (id);

alter table public.candidato_votos
  add constraint candidato_votos_pkey PRIMARY KEY (id);

alter table public.candidatos_dobradinha
  add constraint candidatos_dobradinha_pkey PRIMARY KEY (id);

alter table public.conexao_eventos
  add constraint conexao_eventos_pkey PRIMARY KEY (id);

alter table public.conjuntos_trafego
  add constraint conjuntos_trafego_pkey PRIMARY KEY (id);

alter table public.conversa_tags
  add constraint conversa_tags_pkey PRIMARY KEY (conversa_id, tag_id);

alter table public.conversas
  add constraint conversas_pkey PRIMARY KEY (id);

alter table public.criativos_trafego
  add constraint criativos_trafego_pkey PRIMARY KEY (id);

alter table public.demandas
  add constraint demandas_pkey PRIMARY KEY (id);

alter table public.departamento_membros
  add constraint departamento_membros_pkey PRIMARY KEY (departamento_id, atendente_id);

alter table public.departamento_turnos
  add constraint departamento_turnos_pkey PRIMARY KEY (id);

alter table public.departamentos
  add constraint departamentos_pkey PRIMARY KEY (id);

alter table public.envios_material
  add constraint envios_material_pkey PRIMARY KEY (id);

alter table public.etiquetas_pendentes
  add constraint etiquetas_pendentes_pkey PRIMARY KEY (id);

alter table public.exportacoes
  add constraint exportacoes_pkey PRIMARY KEY (id);

alter table public.fluxo_passos
  add constraint fluxo_passos_pkey PRIMARY KEY (id);

alter table public.fluxos
  add constraint fluxos_pkey PRIMARY KEY (id);

alter table public.kit_itens
  add constraint kit_itens_pkey PRIMARY KEY (id);

alter table public.kits
  add constraint kits_pkey PRIMARY KEY (id);

alter table public.liderancas
  add constraint liderancas_pkey PRIMARY KEY (id);

alter table public.link_leituras
  add constraint link_leituras_pkey PRIMARY KEY (id);

alter table public.link_lideres
  add constraint link_lideres_pkey PRIMARY KEY (id);

alter table public.links
  add constraint links_pkey PRIMARY KEY (id);

alter table public.materiais
  add constraint audios_pkey PRIMARY KEY (id);

alter table public.mensagens
  add constraint mensagens_pkey PRIMARY KEY (id);

alter table public.metas_campanha
  add constraint metas_campanha_pkey PRIMARY KEY (id);

alter table public.metricas_trafego
  add constraint metricas_trafego_pkey PRIMARY KEY (id);

alter table public.municipios_ba
  add constraint municipios_ba_pkey PRIMARY KEY (nome);

alter table public.numeros
  add constraint numeros_pkey PRIMARY KEY (id);

alter table public.profiles
  add constraint profiles_pkey PRIMARY KEY (id);

alter table public.registros_disparo
  add constraint registros_disparo_pkey PRIMARY KEY (id);

alter table public.tags
  add constraint tags_pkey PRIMARY KEY (id);

alter table public.trafego_sync
  add constraint trafego_sync_pkey PRIMARY KEY (id);

alter table public.campanhas_trafego
  add constraint campanhas_trafego_campaign_id_key UNIQUE (campaign_id);

alter table public.candidato_votos
  add constraint candidato_votos_candidato_id_municipio_key UNIQUE (candidato_id, municipio);

alter table public.conjuntos_trafego
  add constraint conjuntos_trafego_adset_id_key UNIQUE (adset_id);

alter table public.departamentos
  add constraint departamentos_nome_key UNIQUE (nome);

alter table public.fluxo_passos
  add constraint fluxo_passos_fluxo_id_ordem_key UNIQUE (fluxo_id, ordem);

alter table public.kit_itens
  add constraint kit_itens_kit_id_material_id_key UNIQUE (kit_id, material_id);

alter table public.liderancas
  add constraint liderancas_link_code_key UNIQUE (link_code);

alter table public.link_lideres
  add constraint link_lideres_link_id_codigo_key UNIQUE (link_id, codigo);

alter table public.links
  add constraint links_slug_key UNIQUE (slug);

alter table public.mensagens
  add constraint mensagens_wa_id_key UNIQUE (wa_id);

alter table public.metas_campanha
  add constraint metas_campanha_campanha_key UNIQUE (campanha);

alter table public.municipios_ba
  add constraint municipios_ba_chave_key UNIQUE (chave);

alter table public.numeros
  add constraint numeros_instancia_key UNIQUE (instancia);

alter table public.tags
  add constraint tags_nome_key UNIQUE (nome);

alter table public.atendentes
  add constraint atendentes_capacidade_check CHECK ((capacidade > 0));

alter table public.candidato_votos
  add constraint candidato_votos_votos_check CHECK ((votos >= 0));

alter table public.candidatos_dobradinha
  add constraint candidatos_dobradinha_cargo_check CHECK ((cargo = ANY (ARRAY['estadual'::text, 'federal'::text])));

alter table public.conversas
  add constraint conversas_tipo_check CHECK ((tipo = ANY (ARRAY['lead'::text, 'disparo'::text])));

alter table public.departamento_turnos
  add constraint departamento_turnos_dia_check CHECK (((dia >= 0) AND (dia <= 6)));

alter table public.departamento_turnos
  add constraint turno_valido CHECK ((fecha > abre));

alter table public.departamentos
  add constraint departamentos_sla_resposta_min_check CHECK (((sla_resposta_min >= 1) AND (sla_resposta_min <= 43200)));

alter table public.fluxo_passos
  add constraint fluxo_passos_guarda_em_check CHECK ((guarda_em = ANY (ARRAY['nome'::text, 'municipio'::text, 'bairro'::text])));

alter table public.fluxos
  add constraint fluxos_modo_check CHECK ((modo = ANY (ARRAY['rascunho'::text, 'no-ar'::text])));

alter table public.link_lideres
  add constraint link_lideres_codigo_check CHECK ((codigo ~ '^[a-z0-9-]{2,30}$'::text));

alter table public.links
  add constraint links_slug_check CHECK ((slug ~ '^[a-z0-9-]{2,40}$'::text));

alter table public.materiais
  add constraint materiais_tem_conteudo CHECK ((((tipo = 'texto'::text) AND (texto IS NOT NULL) AND (length(TRIM(BOTH FROM texto)) > 0)) OR ((tipo <> 'texto'::text) AND (arquivo IS NOT NULL))));

alter table public.materiais
  add constraint materiais_tipo_check CHECK ((tipo = ANY (ARRAY['audio'::text, 'imagem'::text, 'video'::text, 'documento'::text, 'texto'::text])));

alter table public.mensagens
  add constraint mensagens_direcao_check CHECK ((direcao = ANY (ARRAY['inbound'::text, 'outbound'::text])));

alter table public.numeros
  add constraint numeros_provedor_check CHECK ((provedor = ANY (ARRAY['evolution'::text, 'meta'::text])));

alter table public.profiles
  add constraint profiles_role_conhecido CHECK (((role IS NULL) OR (role = ANY (ARRAY['admin'::text, 'usuario'::text, 'supervisor'::text, 'atendente'::text, 'lideranca'::text]))));

alter table public.registros_disparo
  add constraint registros_disparo_apoios_check CHECK ((apoios >= 0));

alter table public.registros_disparo
  add constraint registros_disparo_enviados_check CHECK ((enviados >= 0));

alter table public.registros_disparo
  add constraint registros_disparo_outras_devolutivas_check CHECK ((outras_devolutivas >= 0));

alter table public.tags
  add constraint tags_eixo_check CHECK ((eixo = ANY (ARRAY['status'::text, 'demanda'::text])));

alter table public.atendentes
  add constraint atendentes_id_fkey FOREIGN KEY (id) REFERENCES profiles(id) ON DELETE CASCADE;

alter table public.atribuicoes
  add constraint atribuicoes_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE;

alter table public.atribuicoes
  add constraint atribuicoes_de_atendente_fkey FOREIGN KEY (de_atendente) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.atribuicoes
  add constraint atribuicoes_de_departamento_fkey FOREIGN KEY (de_departamento) REFERENCES departamentos(id) ON DELETE SET NULL;

alter table public.atribuicoes
  add constraint atribuicoes_feita_por_fkey FOREIGN KEY (feita_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.atribuicoes
  add constraint atribuicoes_para_atendente_fkey FOREIGN KEY (para_atendente) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.atribuicoes
  add constraint atribuicoes_para_departamento_fkey FOREIGN KEY (para_departamento) REFERENCES departamentos(id) ON DELETE SET NULL;

alter table public.campanhas_trafego
  add constraint campanhas_trafego_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);

alter table public.candidato_votos
  add constraint candidato_votos_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.candidato_votos
  add constraint candidato_votos_candidato_id_fkey FOREIGN KEY (candidato_id) REFERENCES candidatos_dobradinha(id) ON DELETE CASCADE;

alter table public.candidatos_dobradinha
  add constraint candidatos_dobradinha_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.conexao_eventos
  add constraint conexao_eventos_numero_id_fkey FOREIGN KEY (numero_id) REFERENCES numeros(id) ON DELETE CASCADE;

alter table public.conjuntos_trafego
  add constraint conjuntos_trafego_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);

alter table public.conversa_tags
  add constraint conversa_tags_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE;

alter table public.conversa_tags
  add constraint conversa_tags_marcada_por_fkey FOREIGN KEY (marcada_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.conversa_tags
  add constraint conversa_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

alter table public.conversas
  add constraint conversas_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.conversas
  add constraint conversas_cadastrado_por_fkey FOREIGN KEY (cadastrado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.conversas
  add constraint conversas_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES departamentos(id) ON DELETE SET NULL;

alter table public.conversas
  add constraint conversas_lideranca_id_fkey FOREIGN KEY (lideranca_id) REFERENCES liderancas(id) ON DELETE SET NULL;

alter table public.conversas
  add constraint conversas_numero_id_fkey FOREIGN KEY (numero_id) REFERENCES numeros(id) ON DELETE RESTRICT;

alter table public.criativos_trafego
  add constraint criativos_trafego_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);

alter table public.demandas
  add constraint demandas_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);

alter table public.demandas
  add constraint demandas_municipe_id_fkey FOREIGN KEY (municipe_id) REFERENCES liderancas(id) ON DELETE SET NULL;

alter table public.departamento_membros
  add constraint departamento_membros_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES atendentes(id) ON DELETE CASCADE;

alter table public.departamento_membros
  add constraint departamento_membros_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES departamentos(id) ON DELETE CASCADE;

alter table public.departamento_turnos
  add constraint departamento_turnos_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES departamentos(id) ON DELETE CASCADE;

alter table public.envios_material
  add constraint envios_material_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.envios_material
  add constraint envios_material_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE SET NULL;

alter table public.envios_material
  add constraint envios_material_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES kits(id) ON DELETE SET NULL;

alter table public.envios_material
  add constraint envios_material_material_id_fkey FOREIGN KEY (material_id) REFERENCES materiais(id) ON DELETE SET NULL;

alter table public.envios_material
  add constraint envios_material_numero_id_fkey FOREIGN KEY (numero_id) REFERENCES numeros(id) ON DELETE SET NULL;

alter table public.exportacoes
  add constraint exportacoes_quem_fkey FOREIGN KEY (quem) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.fluxo_passos
  add constraint fluxo_passos_fluxo_id_fkey FOREIGN KEY (fluxo_id) REFERENCES fluxos(id) ON DELETE CASCADE;

alter table public.fluxos
  add constraint fluxos_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.kit_itens
  add constraint kit_itens_kit_id_fkey FOREIGN KEY (kit_id) REFERENCES kits(id) ON DELETE CASCADE;

alter table public.kit_itens
  add constraint kit_itens_material_id_fkey FOREIGN KEY (material_id) REFERENCES materiais(id) ON DELETE CASCADE;

alter table public.kits
  add constraint kits_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.liderancas
  add constraint liderancas_cadastrado_por_fkey FOREIGN KEY (cadastrado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.liderancas
  add constraint liderancas_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES liderancas(id) ON DELETE SET NULL;

alter table public.link_leituras
  add constraint link_leituras_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES link_lideres(id) ON DELETE SET NULL;

alter table public.link_leituras
  add constraint link_leituras_link_id_fkey FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE;

alter table public.link_lideres
  add constraint link_lideres_lideranca_id_fkey FOREIGN KEY (lideranca_id) REFERENCES liderancas(id) ON DELETE SET NULL;

alter table public.link_lideres
  add constraint link_lideres_link_id_fkey FOREIGN KEY (link_id) REFERENCES links(id) ON DELETE CASCADE;

alter table public.links
  add constraint links_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.materiais
  add constraint audios_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.mensagens
  add constraint mensagens_conversa_id_fkey FOREIGN KEY (conversa_id) REFERENCES conversas(id) ON DELETE CASCADE;

alter table public.mensagens
  add constraint mensagens_editada_por_fkey FOREIGN KEY (editada_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.mensagens
  add constraint mensagens_enviada_por_fkey FOREIGN KEY (enviada_por) REFERENCES profiles(id) ON DELETE SET NULL;

alter table public.metas_campanha
  add constraint metas_campanha_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);

alter table public.metricas_trafego
  add constraint metricas_trafego_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);

alter table public.numeros
  add constraint numeros_atendente_id_fkey FOREIGN KEY (atendente_id) REFERENCES atendentes(id) ON DELETE SET NULL;

alter table public.numeros
  add constraint numeros_departamento_id_fkey FOREIGN KEY (departamento_id) REFERENCES departamentos(id) ON DELETE SET NULL;

alter table public.profiles
  add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

alter table public.registros_disparo
  add constraint registros_disparo_criado_por_fkey FOREIGN KEY (criado_por) REFERENCES auth.users(id);

alter table public.trafego_sync
  add constraint trafego_sync_atualizado_por_fkey FOREIGN KEY (atualizado_por) REFERENCES auth.users(id);


-- ══════════════════════════════════════════════════════════════════════════
-- VIEWS
-- ══════════════════════════════════════════════════════════════════════════
--
-- Em ordem de dependência: `conversas_creditadas` lê `trabalho_conversa`.
-- `security_invoker` vem junto quando existe — sem ele a view roda com os
-- direitos do dono e vira porta dos fundos para a RLS.

create or replace view public.carga_atendentes
with (security_invoker=on) as
 SELECT a.id,
    a.nome,
    a.disponivel,
    a.capacidade,
    a.demandas,
    count(c.id) FILTER (WHERE c.encerrada_em IS NULL) AS abertas,
    count(c.id) FILTER (WHERE c.encerrada_em IS NULL AND c.ultima_direcao = 'inbound'::text) AS esperando,
    GREATEST(a.capacidade - count(c.id) FILTER (WHERE c.encerrada_em IS NULL), 0::bigint) AS vagas
   FROM atendentes a
     LEFT JOIN conversas c ON c.atendente_id = a.id
  GROUP BY a.id, a.nome, a.disponivel, a.capacidade, a.demandas;

create or replace view public.departamentos_painel
with (security_invoker=on) as
 SELECT d.id,
    d.nome,
    d.cor,
    d.descricao,
    d.ativo,
    d.ordem,
    d.padrao,
    d.auto_atribuir,
    d.sla_resposta_min,
    d.palavras_chave,
    d.fuso,
    departamento_aberto(d.id) AS aberto_agora,
    count(DISTINCT m.atendente_id) AS membros,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.departamento_id = d.id AND c.encerrada_em IS NULL) AS abertas,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.departamento_id = d.id AND c.encerrada_em IS NULL AND c.atendente_id IS NULL) AS aguardando,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.departamento_id = d.id AND c.encerrada_em IS NULL AND c.primeira_resp_at IS NULL AND c.primeira_msg_at IS NOT NULL AND c.primeira_msg_at < (now() - make_interval(mins => d.sla_resposta_min))) AS fora_do_sla,
    ( SELECT count(*) AS count
           FROM departamento_turnos t
          WHERE t.departamento_id = d.id) AS turnos
   FROM departamentos d
     LEFT JOIN departamento_membros m ON m.departamento_id = d.id
  GROUP BY d.id, d.nome, d.cor, d.descricao, d.ativo, d.ordem, d.padrao, d.auto_atribuir, d.sla_resposta_min, d.palavras_chave, d.fuso;

create or replace view public.kits_prontos
with (security_invoker=on) as
 SELECT k.id,
    k.nome,
    k.quando,
    k.cor,
    k.ordem,
    k.ativo,
    k.vezes,
    count(i.id) AS itens,
    count(i.id) FILTER (WHERE m.tipo = 'audio'::text) AS audios,
    count(i.id) FILTER (WHERE m.tipo = 'imagem'::text) AS imagens,
    count(i.id) > 0 AS pronto
   FROM kits k
     LEFT JOIN kit_itens i ON i.kit_id = k.id
     LEFT JOIN materiais m ON m.id = i.material_id AND m.ativo
  GROUP BY k.id;

create or replace view public.membros_por_setor
with (security_invoker=on) as
 SELECT m.departamento_id,
    a.id AS atendente_id,
    a.nome,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.atendente_id = a.id AND c.encerrada_em IS NULL) AS abertas
   FROM departamento_membros m
     JOIN atendentes a ON a.id = m.atendente_id;

create or replace view public.numeros_painel
with (security_invoker=on) as
 SELECT n.id,
    n.apelido,
    n.telefone,
    n.instancia,
    n.provedor,
    n.cor,
    n.ativo,
    n.ordem,
    n.departamento_id,
    n.atendente_id,
    a.nome AS atendente,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.numero_id = n.id AND c.encerrada_em IS NULL) AS abertas,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.numero_id = n.id AND c.encerrada_em IS NULL AND c.atendente_id IS NULL) AS aguardando,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.numero_id = n.id AND c.primeira_msg_at > (now() - '24:00:00'::interval)) AS leads_24h,
    ( SELECT count(*) AS count
           FROM conversas c
          WHERE c.numero_id = n.id AND c.primeira_msg_at > date_trunc('day'::text, (now() AT TIME ZONE 'America/Bahia'::text))) AS leads_hoje,
    ( SELECT max(c.ultima_msg_at) AS max
           FROM conversas c
          WHERE c.numero_id = n.id) AS ultima_atividade
   FROM numeros n
     LEFT JOIN atendentes a ON a.id = n.atendente_id;

create or replace view public.trabalho_conversa
with (security_invoker=true) as
 SELECT c.id AS conversa_id,
    c.cadastrado_por AS quem
   FROM conversas c
  WHERE c.cadastrado_por IS NOT NULL
UNION
 SELECT m.conversa_id,
    m.enviada_por AS quem
   FROM mensagens m
  WHERE m.direcao = 'outbound'::text AND m.enviada_por IS NOT NULL
UNION
 SELECT ct.conversa_id,
    ct.marcada_por AS quem
   FROM conversa_tags ct
  WHERE ct.marcada_por IS NOT NULL;

create or replace view public.conversas_creditadas
with (security_invoker=true) as
 SELECT c.id,
    c.telefone,
    c.nome,
    c.foto_url,
    c.instancia,
    c.tipo,
    c.status_lead,
    c.demandas,
    c.municipio,
    c.bairro,
    c.origem,
    c.primeira_msg_at,
    c.primeira_resp_at,
    c.ultima_direcao,
    c.atendente_id,
    c.atribuido_em,
    c.encerrada_em,
    c.fluxo_estagio,
    c.ultima_msg,
    c.ultima_msg_at,
    c.total_mensagens,
    c.criado_em,
    c.atualizado_em,
    c.nome_sugerido,
    c.municipio_sugerido,
    c.bairro_sugerido,
    c.indicado_por,
    c.lideranca_id,
    c.cadastrado_em,
    c.cadastrado_por,
    c.departamento_id,
    c.numero_id,
    c.ultima_entrada_at,
    c.fluxo_passo,
    c.fluxo_em,
    t.quem AS creditada_a
   FROM conversas c
     JOIN trabalho_conversa t ON t.conversa_id = c.id;


-- ══════════════════════════════════════════════════════════════════════════
-- AS FUNÇÕES QUE FALAM EM TABELA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Só podiam vir aqui: devolvem ou recebem o tipo de uma tabela — `setof
-- conversas` e parentes —, e isso o Postgres resolve na hora de criar.

CREATE OR REPLACE FUNCTION public.supervisao_lista(p_de timestamp with time zone DEFAULT NULL::timestamp with time zone, p_ate timestamp with time zone DEFAULT NULL::timestamp with time zone, p_limite integer DEFAULT 500)
 RETURNS SETOF conversas
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select c.*
    from public.conversas c
   where (p_de is null
          or exists (select 1 from public.mensagens m
                      where m.conversa_id = c.id
                        and m.momento >= p_de
                        and (p_ate is null or m.momento < p_ate)))
   -- A ordem continua sendo a última mensagem: a lista é de acompanhamento do
   -- agora, e quem se mexeu por último vem primeiro. O que mudou foi QUEM
   -- ENTRA na lista, não a ordem dentro dela.
   order by c.ultima_msg_at desc nulls last
   limit greatest(p_limite, 1);
$function$
;


-- ══════════════════════════════════════════════════════════════════════════
-- GATILHOS
-- ══════════════════════════════════════════════════════════════════════════

drop trigger if exists atendimentos_municipio_uma_grafia on public.atendimentos;
CREATE TRIGGER atendimentos_municipio_uma_grafia BEFORE INSERT OR UPDATE OF municipio ON public.atendimentos FOR EACH ROW EXECUTE FUNCTION municipio_na_grafia_oficial();

drop trigger if exists candidato_votos_municipio_oficial on public.candidato_votos;
CREATE TRIGGER candidato_votos_municipio_oficial BEFORE INSERT OR UPDATE ON public.candidato_votos FOR EACH ROW EXECUTE FUNCTION municipio_na_grafia_oficial();

drop trigger if exists candidato_votos_municipio_valido on public.candidato_votos;
CREATE TRIGGER candidato_votos_municipio_valido BEFORE INSERT OR UPDATE ON public.candidato_votos FOR EACH ROW EXECUTE FUNCTION municipio_da_votacao_existe();

drop trigger if exists tag_alimenta_eixos on public.conversa_tags;
CREATE TRIGGER tag_alimenta_eixos AFTER INSERT OR DELETE ON public.conversa_tags FOR EACH ROW EXECUTE FUNCTION tag_alimenta_eixos();

drop trigger if exists conversa_cai_no_padrao on public.conversas;
CREATE TRIGGER conversa_cai_no_padrao BEFORE INSERT ON public.conversas FOR EACH ROW EXECUTE FUNCTION conversa_cai_no_padrao();

drop trigger if exists conversa_municipio_limpo on public.conversas;
CREATE TRIGGER conversa_municipio_limpo BEFORE INSERT OR UPDATE OF municipio, municipio_sugerido ON public.conversas FOR EACH ROW EXECUTE FUNCTION municipio_normaliza_conversa();

drop trigger if exists conversa_nasce_com_dona on public.conversas;
CREATE TRIGGER conversa_nasce_com_dona BEFORE INSERT ON public.conversas FOR EACH ROW EXECUTE FUNCTION conversa_nasce_com_dona();

drop trigger if exists conversa_nasce_conhecida on public.conversas;
CREATE TRIGGER conversa_nasce_conhecida BEFORE INSERT ON public.conversas FOR EACH ROW EXECUTE FUNCTION conversa_nasce_conhecida();

drop trigger if exists conversas_municipio_uma_grafia on public.conversas;
CREATE TRIGGER conversas_municipio_uma_grafia BEFORE INSERT OR UPDATE OF municipio, municipio_sugerido ON public.conversas FOR EACH ROW EXECUTE FUNCTION conversa_municipio_na_grafia_oficial();

drop trigger if exists conversas_puxa_etiquetas on public.conversas;
CREATE TRIGGER conversas_puxa_etiquetas AFTER INSERT ON public.conversas FOR EACH ROW EXECUTE FUNCTION puxa_etiquetas_pendentes();

drop trigger if exists demandas_municipio_uma_grafia on public.demandas;
CREATE TRIGGER demandas_municipio_uma_grafia BEFORE INSERT OR UPDATE OF municipio ON public.demandas FOR EACH ROW EXECUTE FUNCTION municipio_na_grafia_oficial();

drop trigger if exists demandas_touch_trg on public.demandas;
CREATE TRIGGER demandas_touch_trg BEFORE UPDATE ON public.demandas FOR EACH ROW EXECUTE FUNCTION demandas_touch();

drop trigger if exists departamento_um_padrao on public.departamentos;
CREATE TRIGGER departamento_um_padrao BEFORE INSERT OR UPDATE OF padrao ON public.departamentos FOR EACH ROW EXECUTE FUNCTION departamento_um_padrao();

drop trigger if exists lideranca_municipio_limpo on public.liderancas;
CREATE TRIGGER lideranca_municipio_limpo BEFORE INSERT OR UPDATE OF municipio ON public.liderancas FOR EACH ROW EXECUTE FUNCTION municipio_normaliza();

drop trigger if exists liderancas_municipio_uma_grafia on public.liderancas;
CREATE TRIGGER liderancas_municipio_uma_grafia BEFORE INSERT OR UPDATE OF municipio ON public.liderancas FOR EACH ROW EXECUTE FUNCTION municipio_na_grafia_oficial();

drop trigger if exists liderancas_normaliza_telefone on public.liderancas;
CREATE TRIGGER liderancas_normaliza_telefone BEFORE INSERT OR UPDATE OF telefone ON public.liderancas FOR EACH ROW EXECUTE FUNCTION liderancas_normaliza_telefone();

drop trigger if exists conversa_marca_entrada on public.mensagens;
CREATE TRIGGER conversa_marca_entrada AFTER INSERT ON public.mensagens FOR EACH ROW EXECUTE FUNCTION conversa_marca_entrada();

drop trigger if exists fluxo_cala_quando_gente_fala on public.mensagens;
CREATE TRIGGER fluxo_cala_quando_gente_fala AFTER INSERT ON public.mensagens FOR EACH ROW EXECUTE FUNCTION fluxo_cala_quando_gente_fala();

drop trigger if exists mensagem_do_celular_tem_autor on public.mensagens;
CREATE TRIGGER mensagem_do_celular_tem_autor AFTER INSERT ON public.mensagens FOR EACH ROW WHEN (((new.direcao = 'outbound'::text) AND (new.enviada_por IS NULL) AND (new.bruto IS NOT NULL))) EXECUTE FUNCTION creditar_resposta_do_celular();

drop trigger if exists profiles_nasce_pendente on public.profiles;
CREATE TRIGGER profiles_nasce_pendente BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_nasce_pendente();

drop trigger if exists profiles_papel_arruma_o_resto on public.profiles;
CREATE TRIGGER profiles_papel_arruma_o_resto AFTER UPDATE OF role ON public.profiles FOR EACH ROW EXECUTE FUNCTION papel_arruma_o_resto();

drop trigger if exists profiles_trava_privilegio on public.profiles;
CREATE TRIGGER profiles_trava_privilegio BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_trava_privilegio();


-- ══════════════════════════════════════════════════════════════════════════
-- GATILHOS EM OUTROS SCHEMAS
-- ══════════════════════════════════════════════════════════════════════════
--
-- `on_auth_user_created` é o que cria o perfil de quem se cadastra. Ele mora em
-- `auth.users`, então um dump só de `public` o deixa para trás — e a instalação
-- sobe inteira com o login quebrado, sem nada na tela dizer o porquê.

drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ══════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ══════════════════════════════════════════════════════════════════════════
--
-- Os de chave primária e única não entram: já vieram com as restrições acima, e
-- recriá-los daria erro de nome repetido.

CREATE INDEX atendentes_disponivel ON public.atendentes USING btree (disponivel) WHERE disponivel;

CREATE INDEX atendimentos_atualizado_em ON public.atendimentos USING btree (atualizado_em DESC);

CREATE INDEX atendimentos_criado_em ON public.atendimentos USING btree (criado_em DESC);

CREATE INDEX atendimentos_municipio ON public.atendimentos USING btree (municipio);

CREATE INDEX atendimentos_sem_resposta ON public.atendimentos USING btree (primeira_msg_at) WHERE ((primeira_resp_at IS NULL) AND (tipo = 'lead'::text));

CREATE INDEX atendimentos_status_lead ON public.atendimentos USING btree (status_lead);

CREATE INDEX atendimentos_tipo ON public.atendimentos USING btree (tipo);

CREATE INDEX atribuicoes_conversa ON public.atribuicoes USING btree (conversa_id, criado_em DESC);

CREATE INDEX atribuicoes_para ON public.atribuicoes USING btree (para_atendente, criado_em DESC);

CREATE INDEX atribuicoes_telefone ON public.atribuicoes USING btree (telefone, criado_em DESC);

CREATE INDEX candidato_votos_por_candidato ON public.candidato_votos USING btree (candidato_id);

CREATE INDEX conexao_eventos_por_instancia ON public.conexao_eventos USING btree (instancia, em DESC);

CREATE INDEX conversa_tags_por_quem_marcou ON public.conversa_tags USING btree (marcada_por, conversa_id) WHERE (marcada_por IS NOT NULL);

CREATE INDEX conversa_tags_tag ON public.conversa_tags USING btree (tag_id);

CREATE INDEX conversas_a_cadastrar ON public.conversas USING btree (ultima_msg_at DESC) WHERE (cadastrado_em IS NULL);

CREATE INDEX conversas_atendente ON public.conversas USING btree (atendente_id);

CREATE INDEX conversas_carga ON public.conversas USING btree (atendente_id) WHERE (encerrada_em IS NULL);

CREATE INDEX conversas_id_atendente ON public.conversas USING btree (id, atendente_id);

CREATE INDEX conversas_janela ON public.conversas USING btree (ultima_entrada_at DESC) WHERE (encerrada_em IS NULL);

CREATE INDEX conversas_minhas ON public.conversas USING btree (atendente_id, ultima_msg_at DESC) WHERE (encerrada_em IS NULL);

CREATE INDEX conversas_municipio ON public.conversas USING btree (municipio);

CREATE INDEX conversas_orfas ON public.conversas USING btree (primeira_msg_at) WHERE ((atendente_id IS NULL) AND (encerrada_em IS NULL));

CREATE INDEX conversas_por_atendente ON public.conversas USING btree (atendente_id, ultima_msg_at DESC);

CREATE INDEX conversas_por_cadastrador ON public.conversas USING btree (cadastrado_por) WHERE (cadastrado_por IS NOT NULL);

CREATE INDEX conversas_por_chegada ON public.conversas USING btree (COALESCE(primeira_msg_at, criado_em) DESC);

CREATE INDEX conversas_por_departamento ON public.conversas USING btree (departamento_id) WHERE (encerrada_em IS NULL);

CREATE INDEX conversas_por_encerramento ON public.conversas USING btree (encerrada_em DESC) WHERE (encerrada_em IS NOT NULL);

CREATE INDEX conversas_por_entrada ON public.conversas USING btree (tipo, primeira_msg_at DESC);

CREATE INDEX conversas_por_municipio ON public.conversas USING btree (municipio) WHERE (municipio IS NOT NULL);

CREATE INDEX conversas_por_numero ON public.conversas USING btree (numero_id, ultima_msg_at DESC) WHERE (encerrada_em IS NULL);

CREATE INDEX conversas_por_origem ON public.conversas USING btree (origem) WHERE (origem IS NOT NULL);

CREATE INDEX conversas_por_primeira_resposta ON public.conversas USING btree (primeira_resp_at DESC) WHERE (primeira_resp_at IS NOT NULL);

CREATE INDEX conversas_por_telefone ON public.conversas USING btree (telefone);

CREATE INDEX conversas_recentes ON public.conversas USING btree (ultima_msg_at DESC);

CREATE INDEX conversas_sem_resposta ON public.conversas USING btree (primeira_msg_at) WHERE ((primeira_resp_at IS NULL) AND (tipo = 'lead'::text));

CREATE INDEX conversas_status ON public.conversas USING btree (status_lead);

CREATE INDEX conversas_telefone ON public.conversas USING btree (telefone);

CREATE UNIQUE INDEX conversas_telefone_numero ON public.conversas USING btree (telefone, numero_id);

CREATE INDEX demandas_created_idx ON public.demandas USING btree (created_at DESC);

CREATE INDEX demandas_municipe_idx ON public.demandas USING btree (municipe_id);

CREATE INDEX demandas_status_idx ON public.demandas USING btree (status);

CREATE INDEX dep_membros_atendente ON public.departamento_membros USING btree (atendente_id);

CREATE INDEX turnos_por_departamento ON public.departamento_turnos USING btree (departamento_id, dia);

CREATE UNIQUE INDEX departamento_unico_padrao ON public.departamentos USING btree (padrao) WHERE padrao;

CREATE INDEX envios_material_numero_em ON public.envios_material USING btree (numero_id, em DESC);

CREATE INDEX exportacoes_recentes ON public.exportacoes USING btree (criado_em DESC);

CREATE INDEX fluxo_passos_fluxo ON public.fluxo_passos USING btree (fluxo_id, ordem);

CREATE UNIQUE INDEX fluxos_um_ativo ON public.fluxos USING btree (ativo) WHERE ativo;

CREATE INDEX kit_itens_kit ON public.kit_itens USING btree (kit_id, ordem);

CREATE INDEX liderancas_municipio_idx ON public.liderancas USING btree (municipio) WHERE (municipio IS NOT NULL);

CREATE INDEX liderancas_nome_trgm_idx ON public.liderancas USING gin (nome gin_trgm_ops);

CREATE INDEX liderancas_parent_idx ON public.liderancas USING btree (parent_id) WHERE (parent_id IS NOT NULL);

CREATE INDEX liderancas_por_indicador ON public.liderancas USING btree (parent_id) WHERE (parent_id IS NOT NULL);

CREATE INDEX liderancas_telefone_digitos ON public.liderancas USING btree (telefone_digitos) WHERE (telefone_digitos IS NOT NULL);

CREATE INDEX liderancas_telefone_trgm_idx ON public.liderancas USING gin (telefone gin_trgm_ops);

CREATE INDEX liderancas_tipo_criado_idx ON public.liderancas USING btree (tipo, created_at DESC);

CREATE INDEX link_leituras_por_impressao ON public.link_leituras USING btree (link_id, impressao) WHERE (impressao IS NOT NULL);

CREATE INDEX link_leituras_por_lider ON public.link_leituras USING btree (lider_id) WHERE (lider_id IS NOT NULL);

CREATE INDEX link_leituras_por_link ON public.link_leituras USING btree (link_id, em DESC);

CREATE INDEX link_lideres_por_link ON public.link_lideres USING btree (link_id);

CREATE INDEX links_por_categoria ON public.links USING btree (categoria, criado_em DESC);

CREATE INDEX materiais_ordem ON public.materiais USING btree (ordem, titulo) WHERE ativo;

CREATE INDEX mensagens_autor ON public.mensagens USING btree (enviada_por, momento DESC) WHERE (enviada_por IS NOT NULL);

CREATE INDEX mensagens_com_midia ON public.mensagens USING btree (conversa_id) WHERE (midia_arquivo IS NOT NULL);

CREATE INDEX mensagens_conversa ON public.mensagens USING btree (conversa_id, momento);

CREATE INDEX mensagens_editada_por ON public.mensagens USING btree (editada_por) WHERE (editada_por IS NOT NULL);

CREATE INDEX mensagens_editadas ON public.mensagens USING btree (editada_em DESC) WHERE (editada_em IS NOT NULL);

CREATE INDEX mensagens_por_autor ON public.mensagens USING btree (enviada_por, conversa_id) WHERE ((direcao = 'outbound'::text) AND (enviada_por IS NOT NULL));

CREATE INDEX mensagens_por_conversa_e_momento ON public.mensagens USING btree (conversa_id, momento DESC);

CREATE INDEX mensagens_por_momento ON public.mensagens USING btree (direcao, momento DESC);

CREATE INDEX mensagens_por_wa_id ON public.mensagens USING btree (wa_id) WHERE (wa_id IS NOT NULL);

CREATE INDEX idx_metricas_trafego_data ON public.metricas_trafego USING btree (data);

CREATE INDEX municipios_ba_chave_idx ON public.municipios_ba USING btree (chave);

CREATE UNIQUE INDEX numeros_uma_dona ON public.numeros USING btree (atendente_id) WHERE (atendente_id IS NOT NULL);


-- ══════════════════════════════════════════════════════════════════════════
-- SEGURANÇA POR LINHA
-- ══════════════════════════════════════════════════════════════════════════
--
-- A RLS é o que separa uma atendente da base inteira. Uma tabela que suba sem
-- ela fica aberta para qualquer conta autenticada — e nada na tela denuncia.

alter table public.atendentes enable row level security;

alter table public.atendimentos enable row level security;

alter table public.atribuicoes enable row level security;

alter table public.campanhas_trafego enable row level security;

alter table public.candidato_votos enable row level security;

alter table public.candidatos_dobradinha enable row level security;

alter table public.conexao_eventos enable row level security;

alter table public.conjuntos_trafego enable row level security;

alter table public.conversa_tags enable row level security;

alter table public.conversas enable row level security;

alter table public.criativos_trafego enable row level security;

alter table public.demandas enable row level security;

alter table public.departamento_membros enable row level security;

alter table public.departamento_turnos enable row level security;

alter table public.departamentos enable row level security;

alter table public.envios_material enable row level security;

alter table public.etiquetas_pendentes enable row level security;

alter table public.exportacoes enable row level security;

alter table public.fluxo_passos enable row level security;

alter table public.fluxos enable row level security;

alter table public.kit_itens enable row level security;

alter table public.kits enable row level security;

alter table public.liderancas enable row level security;

alter table public.link_leituras enable row level security;

alter table public.link_lideres enable row level security;

alter table public.links enable row level security;

alter table public.materiais enable row level security;

alter table public.mensagens enable row level security;

alter table public.metas_campanha enable row level security;

alter table public.metricas_trafego enable row level security;

alter table public.municipios_ba enable row level security;

alter table public.numeros enable row level security;

alter table public.profiles enable row level security;

alter table public.registros_disparo enable row level security;

alter table public.tags enable row level security;

alter table public.trafego_sync enable row level security;



drop policy if exists "atendentes equipe" on public.atendentes;
create policy "atendentes equipe" on public.atendentes
  as permissive
  for all to authenticated
  using (perfil_supervisao())
  with check (perfil_supervisao());

drop policy if exists "atendentes le" on public.atendentes;
create policy "atendentes le" on public.atendentes
  as permissive
  for select to authenticated
  using (perfil_atendimento());

drop policy if exists "atendentes proprio" on public.atendentes;
create policy "atendentes proprio" on public.atendentes
  as permissive
  for update to authenticated
  using (((id = auth.uid()) OR perfil_supervisao()))
  with check (((id = auth.uid()) OR perfil_supervisao()));

drop policy if exists "atendimentos equipe ativa" on public.atendimentos;
create policy "atendimentos equipe ativa" on public.atendimentos
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "atribuicoes equipe" on public.atribuicoes;
create policy "atribuicoes equipe" on public.atribuicoes
  as permissive
  for all to authenticated
  using (perfil_atendimento())
  with check (perfil_atendimento());

drop policy if exists "camp_traf criar" on public.campanhas_trafego;
create policy "camp_traf criar" on public.campanhas_trafego
  as permissive
  for insert to public
  with check ((auth.uid() = criado_por));

drop policy if exists "camp_traf editar" on public.campanhas_trafego;
create policy "camp_traf editar" on public.campanhas_trafego
  as permissive
  for update to public
  using ((is_admin() OR (criado_por = auth.uid())));

drop policy if exists "camp_traf excluir" on public.campanhas_trafego;
create policy "camp_traf excluir" on public.campanhas_trafego
  as permissive
  for delete to public
  using (is_admin());

drop policy if exists "camp_traf ler" on public.campanhas_trafego;
create policy "camp_traf ler" on public.campanhas_trafego
  as permissive
  for select to public
  using ((auth.uid() IS NOT NULL));

drop policy if exists "campanhas_trafego equipe ativa" on public.campanhas_trafego;
create policy "campanhas_trafego equipe ativa" on public.campanhas_trafego
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "votos le" on public.candidato_votos;
create policy "votos le" on public.candidato_votos
  as permissive
  for select to authenticated
  using (( SELECT perfil_equipe() AS perfil_equipe));

drop policy if exists "votos mexe" on public.candidato_votos;
create policy "votos mexe" on public.candidato_votos
  as permissive
  for all to authenticated
  using (( SELECT perfil_equipe() AS perfil_equipe))
  with check (( SELECT perfil_equipe() AS perfil_equipe));

drop policy if exists "candidatos le" on public.candidatos_dobradinha;
create policy "candidatos le" on public.candidatos_dobradinha
  as permissive
  for select to authenticated
  using (( SELECT perfil_equipe() AS perfil_equipe));

drop policy if exists "candidatos mexe" on public.candidatos_dobradinha;
create policy "candidatos mexe" on public.candidatos_dobradinha
  as permissive
  for all to authenticated
  using (( SELECT perfil_equipe() AS perfil_equipe))
  with check (( SELECT perfil_equipe() AS perfil_equipe));

drop policy if exists "eventos de conexao, quem supervisiona le" on public.conexao_eventos;
create policy "eventos de conexao, quem supervisiona le" on public.conexao_eventos
  as permissive
  for select to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "conj criar" on public.conjuntos_trafego;
create policy "conj criar" on public.conjuntos_trafego
  as permissive
  for insert to public
  with check ((auth.uid() = criado_por));

drop policy if exists "conj editar" on public.conjuntos_trafego;
create policy "conj editar" on public.conjuntos_trafego
  as permissive
  for update to public
  using ((is_admin() OR (criado_por = auth.uid())));

drop policy if exists "conj excluir" on public.conjuntos_trafego;
create policy "conj excluir" on public.conjuntos_trafego
  as permissive
  for delete to public
  using (is_admin());

drop policy if exists "conj ler" on public.conjuntos_trafego;
create policy "conj ler" on public.conjuntos_trafego
  as permissive
  for select to public
  using ((auth.uid() IS NOT NULL));

drop policy if exists "conjuntos_trafego equipe ativa" on public.conjuntos_trafego;
create policy "conjuntos_trafego equipe ativa" on public.conjuntos_trafego
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "conversa_tags mexe" on public.conversa_tags;
create policy "conversa_tags mexe" on public.conversa_tags
  as permissive
  for all to authenticated
  using ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = conversa_tags.conversa_id) AND ((c.atendente_id = ( SELECT auth.uid() AS uid)) OR (c.atendente_id IS NULL)))))))
  with check ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = conversa_tags.conversa_id) AND ((c.atendente_id = ( SELECT auth.uid() AS uid)) OR (c.atendente_id IS NULL)))))));

drop policy if exists "conversas escreve" on public.conversas;
create policy "conversas escreve" on public.conversas
  as permissive
  for all to authenticated
  using ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (( SELECT perfil_atendimento() AS perfil_atendimento) AND ((atendente_id = ( SELECT auth.uid() AS uid)) OR (atendente_id IS NULL)))))
  with check ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (( SELECT perfil_atendimento() AS perfil_atendimento) AND ((atendente_id = ( SELECT auth.uid() AS uid)) OR (atendente_id IS NULL)))));

drop policy if exists "conversas le" on public.conversas;
create policy "conversas le" on public.conversas
  as permissive
  for select to authenticated
  using ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (( SELECT perfil_atendimento() AS perfil_atendimento) AND ((atendente_id = ( SELECT auth.uid() AS uid)) OR (atendente_id IS NULL)))));

drop policy if exists "criativos criar" on public.criativos_trafego;
create policy "criativos criar" on public.criativos_trafego
  as permissive
  for insert to public
  with check ((auth.uid() = criado_por));

drop policy if exists "criativos editar" on public.criativos_trafego;
create policy "criativos editar" on public.criativos_trafego
  as permissive
  for update to public
  using ((is_admin() OR (criado_por = auth.uid())));

drop policy if exists "criativos excluir" on public.criativos_trafego;
create policy "criativos excluir" on public.criativos_trafego
  as permissive
  for delete to public
  using (is_admin());

drop policy if exists "criativos ler" on public.criativos_trafego;
create policy "criativos ler" on public.criativos_trafego
  as permissive
  for select to public
  using ((auth.uid() IS NOT NULL));

drop policy if exists "criativos_trafego equipe ativa" on public.criativos_trafego;
create policy "criativos_trafego equipe ativa" on public.criativos_trafego
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "demandas equipe ativa" on public.demandas;
create policy "demandas equipe ativa" on public.demandas
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "departamento_membros le" on public.departamento_membros;
create policy "departamento_membros le" on public.departamento_membros
  as permissive
  for select to authenticated
  using (perfil_atendimento());

drop policy if exists "departamento_membros mexe" on public.departamento_membros;
create policy "departamento_membros mexe" on public.departamento_membros
  as permissive
  for all to authenticated
  using (perfil_supervisao())
  with check (perfil_supervisao());

drop policy if exists "turnos le" on public.departamento_turnos;
create policy "turnos le" on public.departamento_turnos
  as permissive
  for select to authenticated
  using (perfil_atendimento());

drop policy if exists "turnos mexe" on public.departamento_turnos;
create policy "turnos mexe" on public.departamento_turnos
  as permissive
  for all to authenticated
  using (perfil_supervisao())
  with check (perfil_supervisao());

drop policy if exists "departamentos le" on public.departamentos;
create policy "departamentos le" on public.departamentos
  as permissive
  for select to authenticated
  using (perfil_atendimento());

drop policy if exists "departamentos mexe" on public.departamentos;
create policy "departamentos mexe" on public.departamentos
  as permissive
  for all to authenticated
  using (perfil_supervisao())
  with check (perfil_supervisao());

drop policy if exists "envios le" on public.envios_material;
create policy "envios le" on public.envios_material
  as permissive
  for select to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "pendentes le" on public.etiquetas_pendentes;
create policy "pendentes le" on public.etiquetas_pendentes
  as permissive
  for select to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "exportacoes le" on public.exportacoes;
create policy "exportacoes le" on public.exportacoes
  as permissive
  for select to authenticated
  using (perfil_equipe());

drop policy if exists "exportacoes registra" on public.exportacoes;
create policy "exportacoes registra" on public.exportacoes
  as permissive
  for insert to authenticated
  with check ((perfil_supervisao() AND (quem = auth.uid())));

drop policy if exists "fluxo_passos equipe" on public.fluxo_passos;
create policy "fluxo_passos equipe" on public.fluxo_passos
  as permissive
  for all to authenticated
  using (perfil_supervisao())
  with check (perfil_supervisao());

drop policy if exists "fluxo_passos le" on public.fluxo_passos;
create policy "fluxo_passos le" on public.fluxo_passos
  as permissive
  for select to authenticated
  using ((( SELECT perfil_atendimento() AS perfil_atendimento) OR ( SELECT perfil_supervisao() AS perfil_supervisao)));

drop policy if exists "fluxo_passos mexe" on public.fluxo_passos;
create policy "fluxo_passos mexe" on public.fluxo_passos
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "fluxos equipe" on public.fluxos;
create policy "fluxos equipe" on public.fluxos
  as permissive
  for all to authenticated
  using (perfil_supervisao())
  with check (perfil_supervisao());

drop policy if exists "fluxos le" on public.fluxos;
create policy "fluxos le" on public.fluxos
  as permissive
  for select to authenticated
  using ((( SELECT perfil_atendimento() AS perfil_atendimento) OR ( SELECT perfil_supervisao() AS perfil_supervisao)));

drop policy if exists "fluxos mexe" on public.fluxos;
create policy "fluxos mexe" on public.fluxos
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "kit_itens cuida" on public.kit_itens;
create policy "kit_itens cuida" on public.kit_itens
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "kit_itens le" on public.kit_itens;
create policy "kit_itens le" on public.kit_itens
  as permissive
  for select to authenticated
  using ((( SELECT perfil_atendimento() AS perfil_atendimento) OR ( SELECT perfil_supervisao() AS perfil_supervisao)));

drop policy if exists "kits cuida" on public.kits;
create policy "kits cuida" on public.kits
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "kits le" on public.kits;
create policy "kits le" on public.kits
  as permissive
  for select to authenticated
  using ((( SELECT perfil_atendimento() AS perfil_atendimento) OR ( SELECT perfil_supervisao() AS perfil_supervisao)));

drop policy if exists "liderancas apaga" on public.liderancas;
create policy "liderancas apaga" on public.liderancas
  as permissive
  for delete to authenticated
  using (perfil_equipe());

drop policy if exists "liderancas atualiza" on public.liderancas;
create policy "liderancas atualiza" on public.liderancas
  as permissive
  for update to authenticated
  using (perfil_equipe())
  with check (perfil_equipe());

drop policy if exists "liderancas escreve" on public.liderancas;
create policy "liderancas escreve" on public.liderancas
  as permissive
  for insert to authenticated
  with check (
CASE
    WHEN perfil_equipe() THEN true
    ELSE (parent_id IN ( SELECT minha_subarvore() AS minha_subarvore))
END);

drop policy if exists "liderancas le" on public.liderancas;
create policy "liderancas le" on public.liderancas
  as permissive
  for select to authenticated
  using (
CASE
    WHEN perfil_equipe() THEN true
    ELSE (id IN ( SELECT minha_subarvore() AS minha_subarvore))
END);

drop policy if exists "leituras le" on public.link_leituras;
create policy "leituras le" on public.link_leituras
  as permissive
  for select to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "lideres le" on public.link_lideres;
create policy "lideres le" on public.link_lideres
  as permissive
  for select to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "lideres mexe" on public.link_lideres;
create policy "lideres mexe" on public.link_lideres
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "links le" on public.links;
create policy "links le" on public.links
  as permissive
  for select to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "links mexe" on public.links;
create policy "links mexe" on public.links
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "materiais cuida" on public.materiais;
create policy "materiais cuida" on public.materiais
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "materiais lista" on public.materiais;
create policy "materiais lista" on public.materiais
  as permissive
  for select to authenticated
  using ((( SELECT perfil_atendimento() AS perfil_atendimento) OR ( SELECT perfil_supervisao() AS perfil_supervisao)));

drop policy if exists "mensagens escreve" on public.mensagens;
create policy "mensagens escreve" on public.mensagens
  as permissive
  for all to authenticated
  using ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = mensagens.conversa_id) AND ((c.atendente_id = ( SELECT auth.uid() AS uid)) OR (c.atendente_id IS NULL)))))))
  with check ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = mensagens.conversa_id) AND ((c.atendente_id = ( SELECT auth.uid() AS uid)) OR (c.atendente_id IS NULL)))))));

drop policy if exists "mensagens le" on public.mensagens;
create policy "mensagens le" on public.mensagens
  as permissive
  for select to authenticated
  using ((( SELECT perfil_supervisao() AS perfil_supervisao) OR (EXISTS ( SELECT 1
   FROM conversas c
  WHERE ((c.id = mensagens.conversa_id) AND ((c.atendente_id = ( SELECT auth.uid() AS uid)) OR (c.atendente_id IS NULL)))))));

drop policy if exists "metas_camp criar" on public.metas_campanha;
create policy "metas_camp criar" on public.metas_campanha
  as permissive
  for insert to public
  with check ((auth.uid() = criado_por));

drop policy if exists "metas_camp editar" on public.metas_campanha;
create policy "metas_camp editar" on public.metas_campanha
  as permissive
  for update to public
  using ((is_admin() OR (criado_por = auth.uid())));

drop policy if exists "metas_camp excluir" on public.metas_campanha;
create policy "metas_camp excluir" on public.metas_campanha
  as permissive
  for delete to public
  using (is_admin());

drop policy if exists "metas_camp ler" on public.metas_campanha;
create policy "metas_camp ler" on public.metas_campanha
  as permissive
  for select to public
  using ((auth.uid() IS NOT NULL));

drop policy if exists "metas_campanha equipe ativa" on public.metas_campanha;
create policy "metas_campanha equipe ativa" on public.metas_campanha
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "metricas_trafego equipe ativa" on public.metricas_trafego;
create policy "metricas_trafego equipe ativa" on public.metricas_trafego
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "trafego criar" on public.metricas_trafego;
create policy "trafego criar" on public.metricas_trafego
  as permissive
  for insert to public
  with check ((auth.uid() = criado_por));

drop policy if exists "trafego editar" on public.metricas_trafego;
create policy "trafego editar" on public.metricas_trafego
  as permissive
  for update to public
  using ((is_admin() OR (criado_por = auth.uid())));

drop policy if exists "trafego excluir" on public.metricas_trafego;
create policy "trafego excluir" on public.metricas_trafego
  as permissive
  for delete to public
  using (is_admin());

drop policy if exists "trafego ler" on public.metricas_trafego;
create policy "trafego ler" on public.metricas_trafego
  as permissive
  for select to public
  using ((auth.uid() IS NOT NULL));

drop policy if exists "municipios_leitura" on public.municipios_ba;
create policy "municipios_leitura" on public.municipios_ba
  as permissive
  for select to anon, authenticated
  using (true);

drop policy if exists "numeros le" on public.numeros;
create policy "numeros le" on public.numeros
  as permissive
  for select to authenticated
  using ((( SELECT perfil_atendimento() AS perfil_atendimento) OR ( SELECT perfil_supervisao() AS perfil_supervisao)));

drop policy if exists "numeros mexe" on public.numeros;
create policy "numeros mexe" on public.numeros
  as permissive
  for all to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao))
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "admin atualiza" on public.profiles;
create policy "admin atualiza" on public.profiles
  as permissive
  for update to authenticated
  using (is_admin())
  with check (is_admin());

drop policy if exists "ler proprio ou admin" on public.profiles;
create policy "ler proprio ou admin" on public.profiles
  as permissive
  for select to authenticated
  using (((id = auth.uid()) OR is_admin()));

drop policy if exists "profiles atualizacao" on public.profiles;
create policy "profiles atualizacao" on public.profiles
  as permissive
  for update to authenticated
  using (((id = auth.uid()) OR perfil_admin()))
  with check (((id = auth.uid()) OR perfil_admin()));

drop policy if exists "profiles cria a propria linha" on public.profiles;
create policy "profiles cria a propria linha" on public.profiles
  as permissive
  for insert to authenticated
  with check ((id = auth.uid()));

drop policy if exists "profiles leitura" on public.profiles;
create policy "profiles leitura" on public.profiles
  as permissive
  for select to authenticated
  using (((id = auth.uid()) OR perfil_ativo()));

drop policy if exists "conv criar" on public.registros_disparo;
create policy "conv criar" on public.registros_disparo
  as permissive
  for insert to authenticated
  with check ((criado_por = auth.uid()));

drop policy if exists "conv editar" on public.registros_disparo;
create policy "conv editar" on public.registros_disparo
  as permissive
  for update to authenticated
  using ((is_admin() OR ((criado_por = auth.uid()) AND (data = CURRENT_DATE))))
  with check ((is_admin() OR ((criado_por = auth.uid()) AND (data = CURRENT_DATE))));

drop policy if exists "conv excluir" on public.registros_disparo;
create policy "conv excluir" on public.registros_disparo
  as permissive
  for delete to authenticated
  using (is_admin());

drop policy if exists "registros_disparo equipe ativa" on public.registros_disparo;
create policy "registros_disparo equipe ativa" on public.registros_disparo
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "tags apaga" on public.tags;
create policy "tags apaga" on public.tags
  as permissive
  for delete to authenticated
  using (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "tags cria" on public.tags;
create policy "tags cria" on public.tags
  as permissive
  for insert to authenticated
  with check (( SELECT perfil_supervisao() AS perfil_supervisao));

drop policy if exists "tags equipe" on public.tags;
create policy "tags equipe" on public.tags
  as permissive
  for all to authenticated
  using (perfil_supervisao())
  with check (perfil_supervisao());

drop policy if exists "tags le" on public.tags;
create policy "tags le" on public.tags
  as permissive
  for select to authenticated
  using (perfil_atendimento());

drop policy if exists "trafego_sync equipe ativa" on public.trafego_sync;
create policy "trafego_sync equipe ativa" on public.trafego_sync
  as permissive
  for all to authenticated
  using (perfil_ativo())
  with check (perfil_ativo());

drop policy if exists "trafego_sync escrever" on public.trafego_sync;
create policy "trafego_sync escrever" on public.trafego_sync
  as permissive
  for all to public
  using ((auth.uid() IS NOT NULL))
  with check ((auth.uid() IS NOT NULL));

drop policy if exists "trafego_sync ler" on public.trafego_sync;
create policy "trafego_sync ler" on public.trafego_sync
  as permissive
  for select to public
  using ((auth.uid() IS NOT NULL));


-- ══════════════════════════════════════════════════════════════════════════
-- PERMISSÕES DE EXECUÇÃO
-- ══════════════════════════════════════════════════════════════════════════
--
-- Várias funções são `security definer` e foram fechadas de propósito — quem
-- pode chamá-las faz parte do desenho, não é detalhe.

revoke all on function public.aplicar_pendentes() from public;
grant execute on function public.aplicar_pendentes() to authenticated;
grant execute on function public.aplicar_pendentes() to service_role;

revoke all on function public.assumir_conversa(p_conversa bigint) from public;
grant execute on function public.assumir_conversa(p_conversa bigint) to authenticated;
grant execute on function public.assumir_conversa(p_conversa bigint) to service_role;

revoke all on function public.atribuir_conversa(p_conversa bigint, p_atendente uuid, p_regra text, p_motivo text) from public;
grant execute on function public.atribuir_conversa(p_conversa bigint, p_atendente uuid, p_regra text, p_motivo text) to anon;
grant execute on function public.atribuir_conversa(p_conversa bigint, p_atendente uuid, p_regra text, p_motivo text) to service_role;

revoke all on function public.audio_usado(p_audio bigint) from public;
grant execute on function public.audio_usado(p_audio bigint) to authenticated;
grant execute on function public.audio_usado(p_audio bigint) to service_role;

revoke all on function public.cadastrar_lead_publico(p_code text, p_nome text, p_telefone text, p_municipio text, p_bairro text) from public;
grant execute on function public.cadastrar_lead_publico(p_code text, p_nome text, p_telefone text, p_municipio text, p_bairro text) to public;
grant execute on function public.cadastrar_lead_publico(p_code text, p_nome text, p_telefone text, p_municipio text, p_bairro text) to anon;
grant execute on function public.cadastrar_lead_publico(p_code text, p_nome text, p_telefone text, p_municipio text, p_bairro text) to authenticated;
grant execute on function public.cadastrar_lead_publico(p_code text, p_nome text, p_telefone text, p_municipio text, p_bairro text) to service_role;

revoke all on function public.cadastrar_manual(p_nome text, p_telefone text, p_municipio text, p_bairro text, p_tipo text, p_tags bigint[]) from public;
grant execute on function public.cadastrar_manual(p_nome text, p_telefone text, p_municipio text, p_bairro text, p_tipo text, p_tags bigint[]) to authenticated;
grant execute on function public.cadastrar_manual(p_nome text, p_telefone text, p_municipio text, p_bairro text, p_tipo text, p_tags bigint[]) to service_role;

revoke all on function public.cadastros_de_hoje() from public;
grant execute on function public.cadastros_de_hoje() to authenticated;
grant execute on function public.cadastros_de_hoje() to service_role;

revoke all on function public.cadastros_por_cidade() from public;
grant execute on function public.cadastros_por_cidade() to public;
grant execute on function public.cadastros_por_cidade() to anon;
grant execute on function public.cadastros_por_cidade() to authenticated;
grant execute on function public.cadastros_por_cidade() to service_role;

revoke all on function public.chave_etiqueta(t text) from public;
grant execute on function public.chave_etiqueta(t text) to public;
grant execute on function public.chave_etiqueta(t text) to anon;
grant execute on function public.chave_etiqueta(t text) to authenticated;
grant execute on function public.chave_etiqueta(t text) to service_role;

revoke all on function public.chave_municipio(t text) from public;
grant execute on function public.chave_municipio(t text) to public;
grant execute on function public.chave_municipio(t text) to anon;
grant execute on function public.chave_municipio(t text) to authenticated;
grant execute on function public.chave_municipio(t text) to service_role;

revoke all on function public.conferir_telefone(p_telefone text) from public;
grant execute on function public.conferir_telefone(p_telefone text) to authenticated;
grant execute on function public.conferir_telefone(p_telefone text) to service_role;

revoke all on function public.confirmar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text) from public;
grant execute on function public.confirmar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text) to authenticated;
grant execute on function public.confirmar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text) to service_role;

revoke all on function public.conta_de_lideranca() from public;
grant execute on function public.conta_de_lideranca() to anon;
grant execute on function public.conta_de_lideranca() to authenticated;
grant execute on function public.conta_de_lideranca() to service_role;

revoke all on function public.conversa_cai_no_padrao() from public;
grant execute on function public.conversa_cai_no_padrao() to public;
grant execute on function public.conversa_cai_no_padrao() to anon;
grant execute on function public.conversa_cai_no_padrao() to authenticated;
grant execute on function public.conversa_cai_no_padrao() to service_role;

revoke all on function public.conversa_do_telefone(p_telefone text, p_nome text, p_instancia text, p_foto text) from public;
grant execute on function public.conversa_do_telefone(p_telefone text, p_nome text, p_instancia text, p_foto text) to anon;
grant execute on function public.conversa_do_telefone(p_telefone text, p_nome text, p_instancia text, p_foto text) to service_role;

revoke all on function public.conversa_marca_entrada() from public;
grant execute on function public.conversa_marca_entrada() to public;
grant execute on function public.conversa_marca_entrada() to anon;
grant execute on function public.conversa_marca_entrada() to authenticated;
grant execute on function public.conversa_marca_entrada() to service_role;

revoke all on function public.conversa_municipio_na_grafia_oficial() from public;
grant execute on function public.conversa_municipio_na_grafia_oficial() to public;
grant execute on function public.conversa_municipio_na_grafia_oficial() to anon;
grant execute on function public.conversa_municipio_na_grafia_oficial() to authenticated;
grant execute on function public.conversa_municipio_na_grafia_oficial() to service_role;

revoke all on function public.conversa_nasce_com_dona() from public;
grant execute on function public.conversa_nasce_com_dona() to public;
grant execute on function public.conversa_nasce_com_dona() to anon;
grant execute on function public.conversa_nasce_com_dona() to authenticated;
grant execute on function public.conversa_nasce_com_dona() to service_role;

revoke all on function public.conversa_nasce_conhecida() from public;
grant execute on function public.conversa_nasce_conhecida() to public;
grant execute on function public.conversa_nasce_conhecida() to anon;
grant execute on function public.conversa_nasce_conhecida() to authenticated;
grant execute on function public.conversa_nasce_conhecida() to service_role;

revoke all on function public.creditar_resposta_do_celular() from public;
grant execute on function public.creditar_resposta_do_celular() to public;
grant execute on function public.creditar_resposta_do_celular() to anon;
grant execute on function public.creditar_resposta_do_celular() to authenticated;
grant execute on function public.creditar_resposta_do_celular() to service_role;

revoke all on function public.ddd_valido(v text) from public;
grant execute on function public.ddd_valido(v text) to public;
grant execute on function public.ddd_valido(v text) to anon;
grant execute on function public.ddd_valido(v text) to authenticated;
grant execute on function public.ddd_valido(v text) to service_role;

revoke all on function public.demandas_touch() from public;
grant execute on function public.demandas_touch() to public;
grant execute on function public.demandas_touch() to anon;
grant execute on function public.demandas_touch() to authenticated;
grant execute on function public.demandas_touch() to service_role;

revoke all on function public.departamento_aberto(p_departamento bigint, p_momento timestamp with time zone) from public;
grant execute on function public.departamento_aberto(p_departamento bigint, p_momento timestamp with time zone) to public;
grant execute on function public.departamento_aberto(p_departamento bigint, p_momento timestamp with time zone) to anon;
grant execute on function public.departamento_aberto(p_departamento bigint, p_momento timestamp with time zone) to authenticated;
grant execute on function public.departamento_aberto(p_departamento bigint, p_momento timestamp with time zone) to service_role;

revoke all on function public.departamento_um_padrao() from public;
grant execute on function public.departamento_um_padrao() to public;
grant execute on function public.departamento_um_padrao() to anon;
grant execute on function public.departamento_um_padrao() to authenticated;
grant execute on function public.departamento_um_padrao() to service_role;

revoke all on function public.editar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text) from public;
grant execute on function public.editar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text) to authenticated;
grant execute on function public.editar_cadastro(p_conversa bigint, p_nome text, p_municipio text, p_bairro text) to service_role;

revoke all on function public.etiqueta_do_whatsapp(p_telefone text, p_instancia text, p_label text, p_remover boolean) from public;
grant execute on function public.etiqueta_do_whatsapp(p_telefone text, p_instancia text, p_label text, p_remover boolean) to service_role;

revoke all on function public.fluxo_cala_quando_gente_fala() from public;
grant execute on function public.fluxo_cala_quando_gente_fala() to public;
grant execute on function public.fluxo_cala_quando_gente_fala() to anon;
grant execute on function public.fluxo_cala_quando_gente_fala() to authenticated;
grant execute on function public.fluxo_cala_quando_gente_fala() to service_role;

revoke all on function public.fluxo_responder(p_conversa bigint, p_texto text) from public;
grant execute on function public.fluxo_responder(p_conversa bigint, p_texto text) to service_role;

revoke all on function public.fundir_lid(p_lid text, p_telefone text, p_instancia text) from public;
grant execute on function public.fundir_lid(p_lid text, p_telefone text, p_instancia text) to service_role;

revoke all on function public.handle_new_user() from public;
grant execute on function public.handle_new_user() to public;
grant execute on function public.handle_new_user() to anon;
grant execute on function public.handle_new_user() to authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to public;
grant execute on function public.is_admin() to anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_admin() to service_role;

revoke all on function public.kit_usado(p_kit bigint) from public;
grant execute on function public.kit_usado(p_kit bigint) to authenticated;
grant execute on function public.kit_usado(p_kit bigint) to service_role;

revoke all on function public.leads_por_dia(p_dias integer, p_atendente uuid, p_municipio text, p_origem text) from public;
grant execute on function public.leads_por_dia(p_dias integer, p_atendente uuid, p_municipio text, p_origem text) to public;
grant execute on function public.leads_por_dia(p_dias integer, p_atendente uuid, p_municipio text, p_origem text) to anon;
grant execute on function public.leads_por_dia(p_dias integer, p_atendente uuid, p_municipio text, p_origem text) to authenticated;
grant execute on function public.leads_por_dia(p_dias integer, p_atendente uuid, p_municipio text, p_origem text) to service_role;

revoke all on function public.lider_por_code(p_code text) from public;
grant execute on function public.lider_por_code(p_code text) to public;
grant execute on function public.lider_por_code(p_code text) to anon;
grant execute on function public.lider_por_code(p_code text) to authenticated;
grant execute on function public.lider_por_code(p_code text) to service_role;

revoke all on function public.liderancas_normaliza_telefone() from public;
grant execute on function public.liderancas_normaliza_telefone() to public;
grant execute on function public.liderancas_normaliza_telefone() to anon;
grant execute on function public.liderancas_normaliza_telefone() to authenticated;
grant execute on function public.liderancas_normaliza_telefone() to service_role;

revoke all on function public.marcar_conexao(p_instancia text, p_estado text, p_motivo text) from public;
grant execute on function public.marcar_conexao(p_instancia text, p_estado text, p_motivo text) to service_role;

revoke all on function public.material_pode_sair(p_numero bigint) from public;
grant execute on function public.material_pode_sair(p_numero bigint) to authenticated;
grant execute on function public.material_pode_sair(p_numero bigint) to service_role;

revoke all on function public.material_saiu(p_numero bigint, p_conversa bigint, p_kit bigint, p_material bigint, p_atendente uuid) from public;
grant execute on function public.material_saiu(p_numero bigint, p_conversa bigint, p_kit bigint, p_material bigint, p_atendente uuid) to authenticated;
grant execute on function public.material_saiu(p_numero bigint, p_conversa bigint, p_kit bigint, p_material bigint, p_atendente uuid) to service_role;

revoke all on function public.metricas_ateh(p_ate date) from public;
grant execute on function public.metricas_ateh(p_ate date) to public;
grant execute on function public.metricas_ateh(p_ate date) to anon;
grant execute on function public.metricas_ateh(p_ate date) to authenticated;
grant execute on function public.metricas_ateh(p_ate date) to service_role;

revoke all on function public.metricas_atendimento(p_dias integer, p_atendente uuid, p_municipio text, p_origem text, p_de date, p_ate date) from public;
grant execute on function public.metricas_atendimento(p_dias integer, p_atendente uuid, p_municipio text, p_origem text, p_de date, p_ate date) to public;
grant execute on function public.metricas_atendimento(p_dias integer, p_atendente uuid, p_municipio text, p_origem text, p_de date, p_ate date) to anon;
grant execute on function public.metricas_atendimento(p_dias integer, p_atendente uuid, p_municipio text, p_origem text, p_de date, p_ate date) to authenticated;
grant execute on function public.metricas_atendimento(p_dias integer, p_atendente uuid, p_municipio text, p_origem text, p_de date, p_ate date) to service_role;

revoke all on function public.metricas_desde(p_dias integer, p_de date) from public;
grant execute on function public.metricas_desde(p_dias integer, p_de date) to public;
grant execute on function public.metricas_desde(p_dias integer, p_de date) to anon;
grant execute on function public.metricas_desde(p_dias integer, p_de date) to authenticated;
grant execute on function public.metricas_desde(p_dias integer, p_de date) to service_role;

revoke all on function public.metricas_janelas(p_atendente uuid, p_municipio text, p_origem text) from public;
grant execute on function public.metricas_janelas(p_atendente uuid, p_municipio text, p_origem text) to public;
grant execute on function public.metricas_janelas(p_atendente uuid, p_municipio text, p_origem text) to anon;
grant execute on function public.metricas_janelas(p_atendente uuid, p_municipio text, p_origem text) to authenticated;
grant execute on function public.metricas_janelas(p_atendente uuid, p_municipio text, p_origem text) to service_role;

revoke all on function public.metricas_janelas_completo(p_atendente uuid, p_municipio text, p_origem text) from public;
grant execute on function public.metricas_janelas_completo(p_atendente uuid, p_municipio text, p_origem text) to public;
grant execute on function public.metricas_janelas_completo(p_atendente uuid, p_municipio text, p_origem text) to anon;
grant execute on function public.metricas_janelas_completo(p_atendente uuid, p_municipio text, p_origem text) to authenticated;
grant execute on function public.metricas_janelas_completo(p_atendente uuid, p_municipio text, p_origem text) to service_role;

revoke all on function public.minha_subarvore() from public;
grant execute on function public.minha_subarvore() to anon;
grant execute on function public.minha_subarvore() to authenticated;
grant execute on function public.minha_subarvore() to service_role;

revoke all on function public.municipio_da_votacao_existe() from public;
grant execute on function public.municipio_da_votacao_existe() to public;
grant execute on function public.municipio_da_votacao_existe() to anon;
grant execute on function public.municipio_da_votacao_existe() to authenticated;
grant execute on function public.municipio_da_votacao_existe() to service_role;

revoke all on function public.municipio_na_grafia_oficial() from public;
grant execute on function public.municipio_na_grafia_oficial() to public;
grant execute on function public.municipio_na_grafia_oficial() to anon;
grant execute on function public.municipio_na_grafia_oficial() to authenticated;
grant execute on function public.municipio_na_grafia_oficial() to service_role;

revoke all on function public.municipio_normaliza() from public;
grant execute on function public.municipio_normaliza() to public;
grant execute on function public.municipio_normaliza() to anon;
grant execute on function public.municipio_normaliza() to authenticated;
grant execute on function public.municipio_normaliza() to service_role;

revoke all on function public.municipio_normaliza_conversa() from public;
grant execute on function public.municipio_normaliza_conversa() to public;
grant execute on function public.municipio_normaliza_conversa() to anon;
grant execute on function public.municipio_normaliza_conversa() to authenticated;
grant execute on function public.municipio_normaliza_conversa() to service_role;

revoke all on function public.municipio_oficial(v text) from public;
grant execute on function public.municipio_oficial(v text) to public;
grant execute on function public.municipio_oficial(v text) to anon;
grant execute on function public.municipio_oficial(v text) to authenticated;
grant execute on function public.municipio_oficial(v text) to service_role;

revoke all on function public.municipios_nao_reconhecidos() from public;
grant execute on function public.municipios_nao_reconhecidos() to public;
grant execute on function public.municipios_nao_reconhecidos() to anon;
grant execute on function public.municipios_nao_reconhecidos() to authenticated;
grant execute on function public.municipios_nao_reconhecidos() to service_role;

revoke all on function public.nome_lideranca_por_code(p_code text) from public;
grant execute on function public.nome_lideranca_por_code(p_code text) to public;
grant execute on function public.nome_lideranca_por_code(p_code text) to anon;
grant execute on function public.nome_lideranca_por_code(p_code text) to authenticated;
grant execute on function public.nome_lideranca_por_code(p_code text) to service_role;

revoke all on function public.opcoes_metricas() from public;
grant execute on function public.opcoes_metricas() to authenticated;
grant execute on function public.opcoes_metricas() to service_role;

revoke all on function public.painel_territorio() from public;
grant execute on function public.painel_territorio() to public;
grant execute on function public.painel_territorio() to anon;
grant execute on function public.painel_territorio() to authenticated;
grant execute on function public.painel_territorio() to service_role;

revoke all on function public.papel_arruma_o_resto() from public;
grant execute on function public.papel_arruma_o_resto() to public;
grant execute on function public.papel_arruma_o_resto() to anon;
grant execute on function public.papel_arruma_o_resto() to authenticated;
grant execute on function public.papel_arruma_o_resto() to service_role;

revoke all on function public.perfil_admin() from public;
grant execute on function public.perfil_admin() to anon;
grant execute on function public.perfil_admin() to authenticated;
grant execute on function public.perfil_admin() to service_role;

revoke all on function public.perfil_atendimento() from public;
grant execute on function public.perfil_atendimento() to anon;
grant execute on function public.perfil_atendimento() to authenticated;
grant execute on function public.perfil_atendimento() to service_role;

revoke all on function public.perfil_ativo() from public;
grant execute on function public.perfil_ativo() to anon;
grant execute on function public.perfil_ativo() to authenticated;
grant execute on function public.perfil_ativo() to service_role;

revoke all on function public.perfil_equipe() from public;
grant execute on function public.perfil_equipe() to anon;
grant execute on function public.perfil_equipe() to authenticated;
grant execute on function public.perfil_equipe() to service_role;

revoke all on function public.perfil_supervisao() from public;
grant execute on function public.perfil_supervisao() to anon;
grant execute on function public.perfil_supervisao() to authenticated;
grant execute on function public.perfil_supervisao() to service_role;

revoke all on function public.pessoa_ja_conhecida(p_conversa bigint) from public;
grant execute on function public.pessoa_ja_conhecida(p_conversa bigint) to authenticated;
grant execute on function public.pessoa_ja_conhecida(p_conversa bigint) to service_role;

revoke all on function public.placar_liderancas() from public;
grant execute on function public.placar_liderancas() to public;
grant execute on function public.placar_liderancas() to anon;
grant execute on function public.placar_liderancas() to authenticated;
grant execute on function public.placar_liderancas() to service_role;

revoke all on function public.placar_qr() from public;
grant execute on function public.placar_qr() to public;
grant execute on function public.placar_qr() to anon;
grant execute on function public.placar_qr() to authenticated;
grant execute on function public.placar_qr() to service_role;

revoke all on function public.profiles_nasce_pendente() from public;
grant execute on function public.profiles_nasce_pendente() to public;
grant execute on function public.profiles_nasce_pendente() to anon;
grant execute on function public.profiles_nasce_pendente() to authenticated;
grant execute on function public.profiles_nasce_pendente() to service_role;

revoke all on function public.profiles_trava_privilegio() from public;
grant execute on function public.profiles_trava_privilegio() to public;
grant execute on function public.profiles_trava_privilegio() to anon;
grant execute on function public.profiles_trava_privilegio() to authenticated;
grant execute on function public.profiles_trava_privilegio() to service_role;

revoke all on function public.puxa_etiquetas_pendentes() from public;
grant execute on function public.puxa_etiquetas_pendentes() to public;
grant execute on function public.puxa_etiquetas_pendentes() to anon;
grant execute on function public.puxa_etiquetas_pendentes() to authenticated;
grant execute on function public.puxa_etiquetas_pendentes() to service_role;

revoke all on function public.receber_mensagem(p_telefone text, p_nome text, p_instancia text, p_wa_id text, p_direcao text, p_tipo text, p_texto text, p_resumo text, p_midia_url text, p_midia_mime text, p_duracao integer, p_status text, p_momento timestamp with time zone, p_bruto jsonb, p_municipio_sug text, p_bairro_sug text, p_indicou text) from public;
grant execute on function public.receber_mensagem(p_telefone text, p_nome text, p_instancia text, p_wa_id text, p_direcao text, p_tipo text, p_texto text, p_resumo text, p_midia_url text, p_midia_mime text, p_duracao integer, p_status text, p_momento timestamp with time zone, p_bruto jsonb, p_municipio_sug text, p_bairro_sug text, p_indicou text) to anon;
grant execute on function public.receber_mensagem(p_telefone text, p_nome text, p_instancia text, p_wa_id text, p_direcao text, p_tipo text, p_texto text, p_resumo text, p_midia_url text, p_midia_mime text, p_duracao integer, p_status text, p_momento timestamp with time zone, p_bruto jsonb, p_municipio_sug text, p_bairro_sug text, p_indicou text) to service_role;

revoke all on function public.registrar_contato_wa(p_code text) from public;
grant execute on function public.registrar_contato_wa(p_code text) to public;
grant execute on function public.registrar_contato_wa(p_code text) to anon;
grant execute on function public.registrar_contato_wa(p_code text) to authenticated;
grant execute on function public.registrar_contato_wa(p_code text) to service_role;

revoke all on function public.resumo_geral() from public;
grant execute on function public.resumo_geral() to public;
grant execute on function public.resumo_geral() to anon;
grant execute on function public.resumo_geral() to authenticated;
grant execute on function public.resumo_geral() to service_role;

revoke all on function public.sem_sessao() from public;
grant execute on function public.sem_sessao() to public;
grant execute on function public.sem_sessao() to anon;
grant execute on function public.sem_sessao() to authenticated;
grant execute on function public.sem_sessao() to service_role;

revoke all on function public.so_digitos(v text) from public;
grant execute on function public.so_digitos(v text) to public;
grant execute on function public.so_digitos(v text) to anon;
grant execute on function public.so_digitos(v text) to authenticated;
grant execute on function public.so_digitos(v text) to service_role;

revoke all on function public.supervisao_janelas() from public;
grant execute on function public.supervisao_janelas() to public;
grant execute on function public.supervisao_janelas() to anon;
grant execute on function public.supervisao_janelas() to authenticated;
grant execute on function public.supervisao_janelas() to service_role;

revoke all on function public.supervisao_lista(p_de timestamp with time zone, p_ate timestamp with time zone, p_limite integer) from public;
grant execute on function public.supervisao_lista(p_de timestamp with time zone, p_ate timestamp with time zone, p_limite integer) to public;
grant execute on function public.supervisao_lista(p_de timestamp with time zone, p_ate timestamp with time zone, p_limite integer) to anon;
grant execute on function public.supervisao_lista(p_de timestamp with time zone, p_ate timestamp with time zone, p_limite integer) to authenticated;
grant execute on function public.supervisao_lista(p_de timestamp with time zone, p_ate timestamp with time zone, p_limite integer) to service_role;

revoke all on function public.tag_alimenta_eixos() from public;
grant execute on function public.tag_alimenta_eixos() to public;
grant execute on function public.tag_alimenta_eixos() to anon;
grant execute on function public.tag_alimenta_eixos() to authenticated;
grant execute on function public.tag_alimenta_eixos() to service_role;

revoke all on function public.tag_do_whatsapp(p_nome text) from public;
grant execute on function public.tag_do_whatsapp(p_nome text) to public;
grant execute on function public.tag_do_whatsapp(p_nome text) to anon;
grant execute on function public.tag_do_whatsapp(p_nome text) to authenticated;
grant execute on function public.tag_do_whatsapp(p_nome text) to service_role;

revoke all on function public.transferir_conversa(p_conversa bigint, p_departamento bigint, p_para_atendente uuid, p_observacao text) from public;
grant execute on function public.transferir_conversa(p_conversa bigint, p_departamento bigint, p_para_atendente uuid, p_observacao text) to authenticated;
grant execute on function public.transferir_conversa(p_conversa bigint, p_departamento bigint, p_para_atendente uuid, p_observacao text) to service_role;

revoke all on function public.unaccent_simples(t text) from public;
grant execute on function public.unaccent_simples(t text) to public;
grant execute on function public.unaccent_simples(t text) to anon;
grant execute on function public.unaccent_simples(t text) to authenticated;
grant execute on function public.unaccent_simples(t text) to service_role;

revoke all on function public.vincular_lideranca(p_codigo text, p_nome text) from public;
grant execute on function public.vincular_lideranca(p_codigo text, p_nome text) to public;
grant execute on function public.vincular_lideranca(p_codigo text, p_nome text) to anon;
grant execute on function public.vincular_lideranca(p_codigo text, p_nome text) to authenticated;
grant execute on function public.vincular_lideranca(p_codigo text, p_nome text) to service_role;


-- ══════════════════════════════════════════════════════════════════════════
-- PERMISSÕES DE TABELA
-- ══════════════════════════════════════════════════════════════════════════
--
-- Quem fala com o banco pelo PostgREST é `anon` ou `authenticated`. Sem estas
-- linhas a instalação sobe e o aplicativo leva "permission denied" em tudo — e
-- no banco da Talita elas vieram de uma caixa marcada no painel, não de código.

grant delete, insert, references, select, trigger, truncate, update on public.atendentes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.atendentes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.atendentes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.atendimentos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.atendimentos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.atendimentos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.atribuicoes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.atribuicoes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.atribuicoes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.campanhas_trafego to anon;

grant delete, insert, references, select, trigger, truncate, update on public.campanhas_trafego to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.campanhas_trafego to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.candidato_votos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.candidato_votos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.candidato_votos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.candidatos_dobradinha to anon;

grant delete, insert, references, select, trigger, truncate, update on public.candidatos_dobradinha to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.candidatos_dobradinha to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.carga_atendentes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.carga_atendentes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.conexao_eventos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.conexao_eventos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.conexao_eventos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.conjuntos_trafego to anon;

grant delete, insert, references, select, trigger, truncate, update on public.conjuntos_trafego to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.conjuntos_trafego to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.conversa_tags to anon;

grant delete, insert, references, select, trigger, truncate, update on public.conversa_tags to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.conversa_tags to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.conversas to anon;

grant delete, insert, references, select, trigger, truncate, update on public.conversas to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.conversas to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.conversas_creditadas to anon;

grant delete, insert, references, select, trigger, truncate, update on public.conversas_creditadas to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.conversas_creditadas to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.criativos_trafego to anon;

grant delete, insert, references, select, trigger, truncate, update on public.criativos_trafego to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.criativos_trafego to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.demandas to anon;

grant delete, insert, references, select, trigger, truncate, update on public.demandas to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.demandas to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.departamento_membros to anon;

grant delete, insert, references, select, trigger, truncate, update on public.departamento_membros to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.departamento_membros to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.departamento_turnos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.departamento_turnos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.departamento_turnos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.departamentos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.departamentos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.departamentos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.departamentos_painel to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.departamentos_painel to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.envios_material to anon;

grant delete, insert, references, select, trigger, truncate, update on public.envios_material to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.envios_material to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.etiquetas_pendentes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.etiquetas_pendentes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.etiquetas_pendentes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.exportacoes to anon;

grant delete, insert, references, select, trigger, truncate, update on public.exportacoes to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.exportacoes to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.fluxo_passos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.fluxo_passos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.fluxo_passos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.fluxos to anon;

grant delete, insert, references, select, trigger, truncate, update on public.fluxos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.fluxos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.kit_itens to anon;

grant delete, insert, references, select, trigger, truncate, update on public.kit_itens to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.kit_itens to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.kits to anon;

grant delete, insert, references, select, trigger, truncate, update on public.kits to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.kits to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.kits_prontos to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.kits_prontos to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.liderancas to anon;

grant delete, insert, references, select, trigger, truncate, update on public.liderancas to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.liderancas to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.link_leituras to anon;

grant delete, insert, references, select, trigger, truncate, update on public.link_leituras to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.link_leituras to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.link_lideres to anon;

grant delete, insert, references, select, trigger, truncate, update on public.link_lideres to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.link_lideres to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.links to anon;

grant delete, insert, references, select, trigger, truncate, update on public.links to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.links to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.materiais to anon;

grant delete, insert, references, select, trigger, truncate, update on public.materiais to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.materiais to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.membros_por_setor to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.membros_por_setor to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.mensagens to anon;

grant delete, insert, references, select, trigger, truncate, update on public.mensagens to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.mensagens to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.metas_campanha to anon;

grant delete, insert, references, select, trigger, truncate, update on public.metas_campanha to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.metas_campanha to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.metricas_trafego to anon;

grant delete, insert, references, select, trigger, truncate, update on public.metricas_trafego to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.metricas_trafego to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.municipios_ba to anon;

grant delete, insert, references, select, trigger, truncate, update on public.municipios_ba to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.municipios_ba to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.numeros to anon;

grant delete, insert, references, select, trigger, truncate, update on public.numeros to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.numeros to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.numeros_painel to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.numeros_painel to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.profiles to anon;

grant delete, insert, references, select, trigger, truncate, update on public.profiles to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.profiles to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.registros_disparo to anon;

grant delete, insert, references, select, trigger, truncate, update on public.registros_disparo to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.registros_disparo to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.tags to anon;

grant delete, insert, references, select, trigger, truncate, update on public.tags to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.tags to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.trabalho_conversa to anon;

grant delete, insert, references, select, trigger, truncate, update on public.trabalho_conversa to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.trabalho_conversa to service_role;

grant delete, insert, references, select, trigger, truncate, update on public.trafego_sync to anon;

grant delete, insert, references, select, trigger, truncate, update on public.trafego_sync to authenticated;

grant delete, insert, references, select, trigger, truncate, update on public.trafego_sync to service_role;


-- ══════════════════════════════════════════════════════════════════════════
-- STORAGE
-- ══════════════════════════════════════════════════════════════════════════
--
-- Os baldes de arquivo e quem pode mexer neles. Os dois são PRIVADOS: áudio de
-- campanha e mídia de eleitor não ficam em endereço público, que qualquer um
-- acerta por tentativa.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios', 'audios', false, 26214400, null)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('conversas', 'conversas', false, 26214400, null)
on conflict (id) do nothing;

drop policy if exists "audios escreve" on storage.objects;
create policy "audios escreve" on storage.objects
  as permissive
  for all to authenticated
  using (((bucket_id = 'audios'::text) AND ( SELECT perfil_supervisao() AS perfil_supervisao)))
  with check (((bucket_id = 'audios'::text) AND ( SELECT perfil_supervisao() AS perfil_supervisao)));

drop policy if exists "audios le" on storage.objects;
create policy "audios le" on storage.objects
  as permissive
  for select to authenticated
  using (((bucket_id = 'audios'::text) AND (( SELECT perfil_atendimento() AS perfil_atendimento) OR ( SELECT perfil_supervisao() AS perfil_supervisao))));

drop policy if exists "midia le" on storage.objects;
create policy "midia le" on storage.objects
  as permissive
  for select to authenticated
  using (((bucket_id = 'conversas'::text) AND perfil_atendimento()));
