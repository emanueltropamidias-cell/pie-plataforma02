-- ============================================================================
-- OUTRAS BASES — cada uma na sua gaveta, sem tocar a base da campanha
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 15/09: o Emanuel tem bases de fora do PIE — a de Talita do tempo do mandato
-- (29.506 pessoas), a do deputado Manassés (7 mil), as das dobradinhas — e quer
-- subir todas pela aba Base. Com uma condição dita duas vezes: "não se mistura
-- com a nova", "sem se misturarem em hipótese alguma".
--
-- ── COMO A SEPARAÇÃO É GARANTIDA ────────────────────────────────────────────
--
-- 1. Tabelas próprias. Nada vai para `liderancas` nem `conversas`. Por isso
--    nenhum número da campanha muda: `base_resumo`, `base_pessoas_mv`, mapa,
--    Pessoas, Métricas, disparo e fila leem só aquelas duas tabelas, e nenhuma
--    delas conhece estas.
--
-- 2. Cada pessoa carrega `base_id`. Telefone repetido só é juntado DENTRO da
--    mesma base (índice único em base_id + telefone). A mesma pessoa na base
--    antiga de Talita e na de Manassés continua sendo duas linhas, uma em cada
--    gaveta. Nenhuma função cruza uma base com outra.
--
-- 3. Ninguém lê as tabelas direto. RLS ligado e sem política para `anon` e
--    `authenticated`: a leitura passa só pelas funções abaixo, que exigem
--    `perfil_equipe()` para ver e exportar e `perfil_admin()` para subir e
--    apagar. Atendente e liderança não enxergam base nenhuma daqui.
--
-- A conferência no fim lista toda função do banco que cita estas tabelas. Se
-- aparecer alguma fora das `base_externa_*`, alguém misturou.

create table if not exists public.bases_externas (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  categoria        text not null default 'outra'
                   check (categoria in ('mandato', 'dobradinha', 'parceiro', 'outra')),
  descricao        text,
  arquivo          text,
  -- 'subindo' enquanto os lotes chegam. Base que parou no meio (aba fechada,
  -- internet caiu) fica visível como incompleta, para apagar e subir de novo —
  -- em vez de parecer uma base menor e verdadeira.
  situacao         text not null default 'subindo' check (situacao in ('subindo', 'pronta')),
  linhas_arquivo   integer not null default 0,
  criada_por       uuid references public.profiles(id) on delete set null,
  criada_por_email text,
  criada_em        timestamptz not null default now(),
  concluida_em     timestamptz
);

create unique index if not exists bases_externas_nome_key
  on public.bases_externas (lower(btrim(nome)));

create table if not exists public.bases_externas_pessoas (
  id                bigint generated always as identity primary key,
  base_id           uuid not null references public.bases_externas(id) on delete cascade,
  linha             integer,
  nome              text,
  -- DDD + número, só dígitos (10 ou 11). O mesmo formato de `liderancas`.
  telefone          text check (telefone ~ '^[0-9]{10,11}$'),
  municipio         text,          -- como veio escrito no arquivo
  municipio_oficial text,          -- um dos 417, quando casou
  local             text not null default 'vazio'
                    check (local in ('vazio', 'bahia', 'outro_estado', 'a_corrigir')),
  bairro            text,
  -- Toda coluna do arquivo que não é nome/telefone/município/bairro. Nada do
  -- que a pessoa subiu se perde: sai de volta na exportação.
  extras            jsonb not null default '{}'::jsonb
);

create unique index if not exists bases_externas_pessoas_tel_key
  on public.bases_externas_pessoas (base_id, telefone) where telefone is not null;
create index if not exists bases_externas_pessoas_base_idx
  on public.bases_externas_pessoas (base_id, local);

alter table public.bases_externas enable row level security;
alter table public.bases_externas_pessoas enable row level security;
revoke all on public.bases_externas, public.bases_externas_pessoas from anon, authenticated;

-- ── SUBIR ───────────────────────────────────────────────────────────────────

create or replace function public.base_externa_criar(
  p_nome text, p_categoria text, p_descricao text, p_arquivo text, p_linhas integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.perfil_admin() then
    raise exception 'Só a coordenação sobe base.' using errcode = '42501';
  end if;
  if nullif(btrim(p_nome), '') is null then
    raise exception 'A base precisa de um nome.';
  end if;
  if exists (select 1 from bases_externas where lower(btrim(nome)) = lower(btrim(p_nome))) then
    raise exception 'Já existe uma base chamada "%". Escolha outro nome ou apague a antiga.', btrim(p_nome);
  end if;

  insert into bases_externas (nome, categoria, descricao, arquivo, linhas_arquivo, criada_por, criada_por_email)
  values (btrim(p_nome), coalesce(p_categoria, 'outra'), nullif(btrim(p_descricao), ''), p_arquivo,
          coalesce(p_linhas, 0), auth.uid(), (select email from auth.users where id = auth.uid()))
  returning id into v_id;
  return v_id;
end $$;

-- Um lote por chamada (a tela manda de 2.000 em 2.000, bem abaixo do limite de
-- 8 segundos da conta logada). Cada lote é uma transação: ou entra inteiro, ou
-- não entra.
--
-- p_linhas: [{linha, nome, telefone, municipio, bairro, extras}]
create or replace function public.base_externa_adicionar(p_base uuid, p_linhas jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_antes integer;
  v_depois integer;
begin
  if not public.perfil_admin() then
    raise exception 'Só a coordenação sobe base.' using errcode = '42501';
  end if;
  if not exists (select 1 from bases_externas where id = p_base and situacao = 'subindo') then
    raise exception 'Essa base não está recebendo linhas (já foi concluída ou não existe).';
  end if;

  select count(*) into v_antes from bases_externas_pessoas where base_id = p_base;

  with bruto as (
    select (x->>'linha')::int as linha,
           nullif(btrim(x->>'nome'), '')      as nome,
           -- A tela já manda normalizado (`normalizarTelefone`, src/lib/csv.ts).
           -- Aqui só tira o 55 do país; nunca corta pela direita, que num fixo
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
  -- Município classificado uma vez por grafia, não uma vez por linha.
  cidades as (
    select m.municipio, public.local_do_municipio(m.municipio) as local, mb.nome as oficial
      from (select distinct municipio from limpo where municipio is not null) m
      left join municipios_ba mb on mb.chave = public.chave_municipio(m.municipio)
  ),
  -- Repetido dentro do MESMO lote: fica a linha com mais informação.
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
  -- Repetido com um lote ANTERIOR da mesma base: completa o que estava vazio,
  -- nunca apaga o que já tinha.
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

create or replace function public.base_externa_concluir(p_base uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.perfil_admin() then
    raise exception 'Só a coordenação sobe base.' using errcode = '42501';
  end if;
  update bases_externas set situacao = 'pronta', concluida_em = now()
   where id = p_base and situacao = 'subindo';
end $$;

-- Apaga UMA base, pelo id, e só ela. A base da campanha não tem caminho até
-- aqui: não há chave estrangeira nem gatilho ligando as tabelas.
create or replace function public.base_externa_apagar(p_base uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.perfil_admin() then
    raise exception 'Só a coordenação apaga base.' using errcode = '42501';
  end if;
  delete from bases_externas where id = p_base;
end $$;

-- ── LER ─────────────────────────────────────────────────────────────────────

-- Os mesmos tipos da base da campanha, contados só dentro de cada gaveta:
--   completos     nome, telefone e município da Bahia
--   sem_municipio nome e telefone, município vazio ou a corrigir
--   so_numero     telefone sem nome
--   outro_estado  município de outro estado
--   sem_telefone  ficha sem telefone
create or replace function public.base_externa_zeros()
returns jsonb language sql immutable as $$
  select '{"pessoas":0,"completos":0,"sem_municipio":0,"a_corrigir":0,"so_numero":0,"outro_estado":0,"sem_telefone":0}'::jsonb
$$;

-- Interna: sem checagem de perfil, e por isso sem permissão para ninguém de
-- fora. Só as funções desta migração chamam.
create or replace function public.base_externa_contar(p_base uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'pessoas',       count(*) filter (where telefone is not null),
    'completos',     count(*) filter (where telefone is not null and nome is not null and local = 'bahia'),
    'sem_municipio', count(*) filter (where telefone is not null and nome is not null and local in ('vazio', 'a_corrigir')),
    'a_corrigir',    count(*) filter (where telefone is not null and nome is not null and local = 'a_corrigir'),
    'so_numero',     count(*) filter (where telefone is not null and nome is null),
    'outro_estado',  count(*) filter (where telefone is not null and nome is not null and local = 'outro_estado'),
    'sem_telefone',  count(*) filter (where telefone is null)
  )
  from bases_externas_pessoas where base_id = p_base
$$;

create or replace function public.bases_externas_lista()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.perfil_equipe() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', b.id, 'nome', b.nome, 'categoria', b.categoria, 'descricao', b.descricao,
             'arquivo', b.arquivo, 'situacao', b.situacao, 'linhas_arquivo', b.linhas_arquivo,
             'criada_em', b.criada_em, 'criada_por', b.criada_por_email
           ) || coalesce(c.contagem, public.base_externa_zeros())
           order by b.criada_em desc)
      from bases_externas b
      left join lateral (select public.base_externa_contar(b.id) as contagem) c on true
  ), '[]'::jsonb) end
$$;

create or replace function public.base_externa_resumo(p_base uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.perfil_equipe() then null else (
    select jsonb_build_object(
             'id', b.id, 'nome', b.nome, 'categoria', b.categoria, 'descricao', b.descricao,
             'arquivo', b.arquivo, 'situacao', b.situacao, 'linhas_arquivo', b.linhas_arquivo,
             'criada_em', b.criada_em, 'criada_por', b.criada_por_email,
             'extras', coalesce((select jsonb_agg(distinct k order by k)
                                   from bases_externas_pessoas p, jsonb_object_keys(p.extras) k
                                  where p.base_id = b.id), '[]'::jsonb),
             'municipios', coalesce((
               select jsonb_agg(jsonb_build_object('nome', municipio_oficial, 'qtd', qtd) order by qtd desc, municipio_oficial)
                 from (select municipio_oficial, count(*) as qtd from bases_externas_pessoas
                        where base_id = b.id and local = 'bahia' and telefone is not null
                        group by municipio_oficial) t), '[]'::jsonb),
             'a_corrigir_lista', coalesce((
               select jsonb_agg(jsonb_build_object('nome', municipio, 'qtd', qtd) order by qtd desc, municipio)
                 from (select municipio, count(*) as qtd from bases_externas_pessoas
                        where base_id = b.id and local = 'a_corrigir' and telefone is not null
                        group by municipio order by 2 desc limit 30) t), '[]'::jsonb)
           ) || public.base_externa_contar(b.id)
      from bases_externas b where b.id = p_base
  ) end
$$;

create or replace function public.base_externa_exportar(p_base uuid, p_tipo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.perfil_equipe() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'telefone', telefone, 'nome', nome, 'municipio', coalesce(municipio_oficial, municipio),
             'municipio_a_corrigir', local = 'a_corrigir', 'bairro', bairro, 'extras', extras,
             'tipo', case
               when telefone is null then 'sem_telefone'
               when nome is null then 'so_numero'
               when local = 'bahia' then 'completos'
               when local = 'outro_estado' then 'outro_estado'
               else 'sem_municipio' end
           ) order by linha)
      from bases_externas_pessoas
     where base_id = p_base
       and case coalesce(p_tipo, '')
             when ''              then telefone is not null
             when 'completos'     then telefone is not null and nome is not null and local = 'bahia'
             when 'sem_municipio' then telefone is not null and nome is not null and local in ('vazio', 'a_corrigir')
             when 'so_numero'     then telefone is not null and nome is null
             when 'outro_estado'  then telefone is not null and nome is not null and local = 'outro_estado'
             when 'sem_telefone'  then telefone is null
             else false end
  ), '[]'::jsonb) end
$$;

revoke all on function public.base_externa_criar(text, text, text, text, integer) from public, anon;
revoke all on function public.base_externa_adicionar(uuid, jsonb) from public, anon;
revoke all on function public.base_externa_concluir(uuid) from public, anon;
revoke all on function public.base_externa_apagar(uuid) from public, anon;
revoke all on function public.bases_externas_lista() from public, anon;
revoke all on function public.base_externa_resumo(uuid) from public, anon;
revoke all on function public.base_externa_exportar(uuid, text) from public, anon;
revoke all on function public.base_externa_contar(uuid) from public, anon, authenticated;
grant execute on function public.base_externa_criar(text, text, text, text, integer) to authenticated;
grant execute on function public.base_externa_adicionar(uuid, jsonb) to authenticated;
grant execute on function public.base_externa_concluir(uuid) to authenticated;
grant execute on function public.base_externa_apagar(uuid) to authenticated;
grant execute on function public.bases_externas_lista() to authenticated;
grant execute on function public.base_externa_resumo(uuid) to authenticated;
grant execute on function public.base_externa_exportar(uuid, text) to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Toda função que cita as tabelas novas. Só podem aparecer as base_externa_*.
select p.proname as funcao_que_le_as_bases_externas
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.prokind = 'f'
   and pg_get_functiondef(p.oid) ~ 'bases_externas'
 order by 1;
