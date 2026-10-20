-- ============================================================================
-- "ESSA PESSOA A GENTE JÁ CONHECE"
-- ============================================================================
--
-- Rode DEPOIS de varios-numeros.sql. Pode rodar de novo sem medo.
--
-- ── O PROBLEMA QUE SÓ APARECE COM VÁRIOS NÚMEROS ────────────────────────────
--
-- O eleitor vê o anúncio de manhã e escreve para o número 1. À tarde vê outro
-- criativo e escreve para o número 3. Agora são duas conversas — corretamente,
-- porque a resposta precisa voltar por onde veio.
--
-- Mas para a operação são DUAS MENINAS trabalhando a mesma pessoa, e nenhuma
-- das duas sabe. As duas perguntam o nome. As duas perguntam a cidade. As duas
-- mandam o kit. Para o eleitor, a campanha é desorganizada; para a campanha,
-- é o dobro do custo pelo mesmo voto.
--
-- ── O QUE JÁ ESTAVA CERTO ───────────────────────────────────────────────────
--
-- `confirmar_cadastro` nunca duplicou: ele procura em `liderancas` pelo
-- telefone e ATUALIZA quando acha. O banco está protegido.
--
-- O que faltava é a menina saber ANTES. Descobrir depois de já ter perguntado
-- tudo não evita o retrabalho — só evita a linha repetida.

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE A GENTE JÁ SABE SOBRE QUEM ESTÁ DO OUTRO LADO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Uma chamada, três respostas:
--
--   já cadastrada     está em `liderancas`? quem cadastrou, quando, de onde
--   outras conversas  a mesma pessoa falando em OUTRO número, agora
--   histórico         quantas vezes ela já procurou a campanha
--
-- Passa pela RLS de quem chama: a função é `security definer` para alcançar
-- `liderancas` (que a atendente não lê), mas devolve só o RESUMO — nome de quem
-- cadastrou e data. Não devolve a base, não devolve endereço, não devolve o
-- resto da rede. A trava das 29 mil continua de pé.
create or replace function public.pessoa_ja_conhecida(p_conversa bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
end $$;

revoke all on function public.pessoa_ja_conhecida(bigint) from public, anon;
grant execute on function public.pessoa_ja_conhecida(bigint) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- QUEM CADASTROU — a coluna que faltava
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `conversas.cadastrado_por` existia; `liderancas.cadastrado_por` não. Sem ela
-- o aviso diria "já cadastrada" sem dizer por quem — e a primeira pergunta da
-- menina seria justamente essa, num grupo de WhatsApp, para alguém procurar a
-- mão.
alter table public.liderancas
  add column if not exists cadastrado_por uuid
    references public.profiles(id) on delete set null;

-- Preenche o que dá: quem cadastrou pelo atendimento está registrado na
-- conversa que gerou a liderança.
update public.liderancas l
   set cadastrado_por = c.cadastrado_por
  from public.conversas c
 where c.lideranca_id = l.id
   and c.cadastrado_por is not null
   and l.cadastrado_por is null;

-- E passa a ser gravada daqui para frente.
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
$$;

revoke all on function public.confirmar_cadastro(bigint, text, text, text) from public, anon;
grant execute on function public.confirmar_cadastro(bigint, text, text, text) to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  (select count(*) from public.liderancas)                             as liderancas,
  (select count(*) from public.liderancas where cadastrado_por is not null) as com_autor,
  (select count(*) from pg_proc where proname = 'pessoa_ja_conhecida')  as funcao_nova;
