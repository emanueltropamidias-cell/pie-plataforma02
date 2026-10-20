-- ============================================================================
-- SUBIR BASE TAMBÉM POR SCRIPT — a mesma regra, um lugar só
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- 15/09, noite: o Emanuel manda os arquivos da base do Manassés e EU subo. Pela
-- tela não dá: a tela grava como o usuário logado (`perfil_admin()`), e um
-- script roda como dono do banco, sem sessão nenhuma.
--
-- A tentação era o script escrever direto nas tabelas. Seria a mesma regra de
-- normalização escrita duas vezes — telefone, município, repetido — e duas
-- cópias sempre desencontram (regra 4 do CLAUDE.md).
--
-- Então o miolo vira `base_externa_gravar`, sem checagem, fechado para todo
-- mundo de fora; `base_externa_adicionar` (a da tela) passa a ser a checagem
-- mais uma chamada a ele. Quem roda por script chama o miolo como dono.

create or replace function public.base_externa_gravar(p_base uuid, p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes integer;
  v_depois integer;
begin
  select count(*) into v_antes from bases_externas_pessoas where base_id = p_base;

  with bruto as (
    select (x->>'linha')::int as linha,
           nullif(btrim(x->>'nome'), '')      as nome,
           -- Só tira o 55 do país; nunca corta pela direita, que num fixo
           -- 55 71 3333-4444 comeria o DDD.
           regexp_replace(regexp_replace(coalesce(x->>'telefone', ''), '\D', '', 'g'), '^55(?=[0-9]{10,11}$)', '') as tel,
           nullif(btrim(x->>'municipio'), '') as municipio,
           nullif(btrim(x->>'bairro'), '')    as bairro,
           coalesce(x->'extras', '{}'::jsonb) as extras
      from jsonb_array_elements(p_linhas) x
  ),
  limpo as (
    select linha, nome, municipio, bairro, extras,
           case when tel ~ '^[0-9]{10,11}$' then tel end as telefone
      from bruto
     where nome is not null or tel is not null or municipio is not null
  ),
  cidades as (
    select m.municipio, public.local_do_municipio(m.municipio) as local, mb.nome as oficial
      from (select distinct municipio from limpo where municipio is not null) m
      left join municipios_ba mb on mb.chave = public.chave_municipio(m.municipio)
  ),
  unico as (
    select distinct on (coalesce(l.telefone, 'linha:' || l.linha))
           l.*, coalesce(c.local, 'vazio') as local, c.oficial
      from limpo l left join cidades c on c.municipio = l.municipio
     order by coalesce(l.telefone, 'linha:' || l.linha),
              (c.local = 'bahia') desc nulls last, (l.nome is not null) desc, l.linha
  )
  insert into bases_externas_pessoas as p
         (base_id, linha, nome, telefone, municipio, municipio_oficial, local, bairro, extras)
  select p_base, linha, nome, telefone, municipio, oficial, local, bairro, extras from unico
  on conflict (base_id, telefone) where telefone is not null do update set
    nome              = coalesce(p.nome, excluded.nome),
    municipio         = case when p.local = 'bahia' or excluded.local = 'vazio' then p.municipio else excluded.municipio end,
    municipio_oficial = case when p.local = 'bahia' or excluded.local = 'vazio' then p.municipio_oficial else excluded.municipio_oficial end,
    local             = case when p.local = 'bahia' or excluded.local = 'vazio' then p.local else excluded.local end,
    bairro            = coalesce(p.bairro, excluded.bairro),
    extras            = excluded.extras || p.extras;

  select count(*) into v_depois from bases_externas_pessoas where base_id = p_base;
  return jsonb_build_object('recebidas', jsonb_array_length(p_linhas), 'novas', v_depois - v_antes);
end $$;

revoke all on function public.base_externa_gravar(uuid, jsonb) from public, anon, authenticated;

-- A da tela: a checagem, e o mesmo miolo.
create or replace function public.base_externa_adicionar(p_base uuid, p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.perfil_admin() then
    raise exception 'Só a coordenação sobe base.' using errcode = '42501';
  end if;
  if not exists (select 1 from bases_externas where id = p_base and situacao = 'subindo') then
    raise exception 'Essa base não está recebendo linhas (já foi concluída ou não existe).';
  end if;
  return public.base_externa_gravar(p_base, p_linhas);
end $$;

-- ── A PORTA DO SCRIPT ───────────────────────────────────────────────────────
--
-- Abre pelo NOME: cria se não existir, reabre se existir. É o que faz a base
-- chegar em pedaços sem virar várias gavetas. Fechada para qualquer papel — só
-- o dono do banco (o script) e o service_role alcançam.
create or replace function public.base_externa_servico_abrir(
  p_nome text, p_categoria text, p_descricao text, p_arquivo text, p_linhas integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if nullif(btrim(p_nome), '') is null then
    raise exception 'A base precisa de um nome.';
  end if;

  select id into v_id from bases_externas where lower(btrim(nome)) = lower(btrim(p_nome));

  if v_id is null then
    insert into bases_externas (nome, categoria, descricao, arquivo, linhas_arquivo, situacao)
    values (btrim(p_nome), coalesce(p_categoria, 'outra'), nullif(btrim(p_descricao), ''),
            p_arquivo, coalesce(p_linhas, 0), 'subindo')
    returning id into v_id;
  else
    update bases_externas
       set situacao       = 'subindo',
           arquivo        = case when arquivo is null or arquivo = p_arquivo then p_arquivo
                                 else arquivo || ' + ' || p_arquivo end,
           linhas_arquivo = linhas_arquivo + coalesce(p_linhas, 0)
     where id = v_id;
  end if;

  return v_id;
end $$;

create or replace function public.base_externa_servico_concluir(p_base uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update bases_externas set situacao = 'pronta', concluida_em = now() where id = p_base;
$$;

revoke all on function public.base_externa_servico_abrir(text, text, text, text, integer) from public, anon, authenticated;
revoke all on function public.base_externa_servico_concluir(uuid) from public, anon, authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
select proname, pg_get_function_identity_arguments(oid) as argumentos
  from pg_proc where pronamespace = 'public'::regnamespace
   and proname in ('base_externa_gravar', 'base_externa_adicionar', 'base_externa_servico_abrir', 'base_externa_servico_concluir')
 order by 1;
