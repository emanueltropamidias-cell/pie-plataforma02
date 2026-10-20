-- ============================================================
-- RODAR TUDO — na ordem. Gerado a partir dos arquivos com comentario.
-- Se truncar, o ultimo 'parte N ok' diz onde parou.
-- ============================================================

alter table public.liderancas
  add column if not exists cadastrado_por uuid
    references public.profiles(id) on delete set null;

-- ─── parte 1: janela-24h ───────────────────────────────────────────
alter table public.conversas
  add column if not exists ultima_entrada_at timestamptz;
comment on column public.conversas.ultima_entrada_at is
  'Momento da última mensagem RECEBIDA. É o que abre a janela de 24h da Cloud API.';
create or replace function public.conversa_marca_entrada()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
end $$;
drop trigger if exists conversa_marca_entrada on public.mensagens;
create trigger conversa_marca_entrada
  after insert on public.mensagens
  for each row execute function public.conversa_marca_entrada();
update public.conversas c
   set ultima_entrada_at = m.ultimo
  from (
    select conversa_id, max(momento) as ultimo
      from public.mensagens
     where direcao = 'inbound'
     group by conversa_id
  ) m
 where m.conversa_id = c.id
   and c.ultima_entrada_at is distinct from m.ultimo;
create index if not exists conversas_janela
  on public.conversas (ultima_entrada_at desc)
  where encerrada_em is null;
select 'parte 1 ok (janela-24h)' as marcador;

-- ─── parte 2: pessoa-ja-conhecida ───────────────────────────────────────────
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
  if not exists (select 1 from public.conversas where id = p_conversa) then
    return jsonb_build_object('ok', false);
  end if;
  select c.telefone, c.numero_id into v_tel, v_numero
    from public.conversas c where c.id = p_conversa;
  v_dig := right(public.so_digitos(v_tel), 11);
  select l.nome, l.municipio, l.bairro, l.tipo, l.created_at,
         p.nome as quem, l.created_via
    into v_lid
    from public.liderancas l
    left join public.profiles p on p.id = l.cadastrado_por
   where l.telefone_digitos = v_dig
   limit 1;
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
alter table public.liderancas
  add column if not exists cadastrado_por uuid
    references public.profiles(id) on delete set null;
update public.liderancas l
   set cadastrado_por = c.cadastrado_por
  from public.conversas c
 where c.lideranca_id = l.id
   and c.cadastrado_por is not null
   and l.cadastrado_por is null;
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
select 'parte 2 ok (pessoa-ja-conhecida)' as marcador;

-- ─── parte 3: conversa-nasce-conhecida ───────────────────────────────────────────
create or replace function public.conversa_nasce_conhecida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dig  text;
  v_lid  record;
begin
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
  new.lideranca_id   := v_lid.id;
  new.nome           := coalesce(new.nome, v_lid.nome);
  new.municipio      := coalesce(new.municipio, v_lid.municipio);
  new.bairro         := coalesce(new.bairro, v_lid.bairro);
  new.cadastrado_em  := now();
  new.cadastrado_por := v_lid.cadastrado_por;
  return new;
end $$;
drop trigger if exists conversa_nasce_conhecida on public.conversas;
create trigger conversa_nasce_conhecida
  before insert on public.conversas
  for each row execute function public.conversa_nasce_conhecida();
update public.conversas c
   set lideranca_id   = l.id,
       nome           = coalesce(c.nome, l.nome),
       municipio      = coalesce(c.municipio, l.municipio),
       bairro         = coalesce(c.bairro, l.bairro),
       cadastrado_em  = now(),
       cadastrado_por = l.cadastrado_por
  from public.liderancas l
 where l.telefone_digitos = right(public.so_digitos(c.telefone), 11)
   and c.cadastrado_em is null;
select 'parte 3 ok (conversa-nasce-conhecida)' as marcador;

-- ─── parte 4: numero-tem-dona ───────────────────────────────────────────
alter table public.numeros
  add column if not exists atendente_id uuid
    references public.atendentes(id) on delete set null;
comment on column public.numeros.atendente_id is
  'De quem é este número. O lead que entra por ele já nasce com ela.';
create unique index if not exists numeros_uma_dona
  on public.numeros (atendente_id)
  where atendente_id is not null;
create or replace function public.conversa_nasce_com_dona()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dona uuid;
begin
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
end $$;
drop trigger if exists conversa_nasce_com_dona on public.conversas;
create trigger conversa_nasce_com_dona
  before insert on public.conversas
  for each row execute function public.conversa_nasce_com_dona();
drop view if exists public.numeros_painel;
create view public.numeros_painel
with (security_invoker = on) as
  select
    n.id, n.apelido, n.telefone, n.instancia, n.provedor,
    n.cor, n.ativo, n.ordem, n.departamento_id, n.atendente_id,
    a.nome                                                      as atendente,
    (select count(*) from public.conversas c
      where c.numero_id = n.id and c.encerrada_em is null)      as abertas,
    (select count(*) from public.conversas c
      where c.numero_id = n.id and c.encerrada_em is null
        and c.atendente_id is null)                             as aguardando,
    (select count(*) from public.conversas c
      where c.numero_id = n.id
        and c.primeira_msg_at > now() - interval '24 hours')     as leads_24h,
    (select count(*) from public.conversas c
      where c.numero_id = n.id
        and c.primeira_msg_at > date_trunc('day', now() at time zone 'America/Bahia'))
                                                                as leads_hoje,
    (select max(c.ultima_msg_at) from public.conversas c
      where c.numero_id = n.id)                                 as ultima_atividade
  from public.numeros n
  left join public.atendentes a on a.id = n.atendente_id;
revoke all on public.numeros_painel from anon;
grant select on public.numeros_painel to authenticated;
update public.conversas c
   set atendente_id = n.atendente_id,
       atribuido_em = coalesce(c.atribuido_em, now())
  from public.numeros n
 where n.id = c.numero_id
   and n.atendente_id is not null
   and n.ativo
   and c.atendente_id is null
   and c.encerrada_em is null;
select apelido, instancia, coalesce(atendente, '— sem dona —') as dona,
       ativo, abertas, aguardando, leads_hoje
  from public.numeros_painel
 order by ordem, apelido;
select 'parte 4 ok (numero-tem-dona)' as marcador;

-- ─── parte 5: equipe-pronta ───────────────────────────────────────────
select a.nome, p.email, p.role
  from public.atendentes a
  left join public.profiles p on p.id = a.id
 where not exists (
   select 1 from public.departamento_membros m where m.atendente_id = a.id
 )
 order by a.nome;
insert into public.departamento_membros (departamento_id, atendente_id)
select d.id, a.id
  from public.atendentes a
 cross join (
   select id from public.departamentos
    where padrao and ativo
    order by ordem
    limit 1
 ) d
on conflict (departamento_id, atendente_id) do nothing;
update public.atendentes set disponivel = true where disponivel is not true;
select 'parte 5 ok (equipe-pronta)' as marcador;

-- ─── parte 6: fluxo ───────────────────────────────────────────
alter table public.fluxos
  add column if not exists modo text not null default 'rascunho'
    check (modo in ('rascunho', 'no-ar'));
alter table public.fluxos
  add column if not exists telefones_teste text[] not null default '{}';
comment on column public.fluxos.modo is
  'rascunho = responde só aos telefones_teste. no-ar = responde a todo lead novo.';
alter table public.fluxo_passos
  add column if not exists espera_resposta boolean not null default true;
alter table public.fluxo_passos
  add column if not exists guarda_em text
    check (guarda_em in ('nome', 'municipio', 'bairro'));
comment on column public.fluxo_passos.guarda_em is
  'Onde gravar a resposta da pessoa. Vai para o campo _sugerido — quem confirma é a atendente.';
alter table public.conversas
  add column if not exists fluxo_passo int not null default 0;
alter table public.conversas
  add column if not exists fluxo_em timestamptz;
comment on column public.conversas.fluxo_passo is
  'Em qual passo do roteiro esta conversa está. -1 = o robô se calou porque uma pessoa respondeu.';
create or replace function public.fluxo_cala_quando_gente_fala()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.direcao = 'outbound' and new.enviada_por is not null then
    update public.conversas
       set fluxo_passo = -1
     where id = new.conversa_id
       and fluxo_passo <> -1;
  end if;
  return new;
end $$;
drop trigger if exists fluxo_cala_quando_gente_fala on public.mensagens;
create trigger fluxo_cala_quando_gente_fala
  after insert on public.mensagens
  for each row execute function public.fluxo_cala_quando_gente_fala();
create or replace function public.fluxo_responder(
  p_conversa bigint,
  p_texto    text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
  if v_conv.fluxo_passo = -1 then
    return jsonb_build_object('enviar', false, 'motivo', 'gente assumiu');
  end if;
  if v_modo = 'rascunho'
     and not (right(public.so_digitos(v_conv.telefone), 11) = any (
       select right(public.so_digitos(t), 11) from unnest(v_teste) as t
     )) then
    return jsonb_build_object('enviar', false, 'motivo', 'rascunho: fora da lista de teste');
  end if;
  select count(*) into v_total from public.fluxo_passos where fluxo_id = v_fluxo;
  if v_conv.fluxo_passo >= v_total then
    return jsonb_build_object('enviar', false, 'motivo', 'roteiro terminou');
  end if;
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
  select * into v_passo
    from public.fluxo_passos
   where fluxo_id = v_fluxo and ordem = v_conv.fluxo_passo + 1;
  if v_passo.id is null or coalesce(trim(v_passo.mensagem), '') = '' then
    update public.conversas
       set fluxo_passo = v_conv.fluxo_passo + 1,
           fluxo_em = now()
     where id = p_conversa and fluxo_passo = v_conv.fluxo_passo;
    return jsonb_build_object('enviar', false, 'motivo', 'passo sem mensagem');
  end if;
  update public.conversas
     set fluxo_passo   = v_conv.fluxo_passo + 1,
         fluxo_em      = now(),
         fluxo_estagio = v_passo.estagio
   where id = p_conversa
     and fluxo_passo = v_conv.fluxo_passo;
  if not found then
    return jsonb_build_object('enviar', false, 'motivo', 'outra mensagem chegou antes');
  end if;
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
end $$;
revoke all on function public.fluxo_responder(bigint, text) from public, anon, authenticated;
grant execute on function public.fluxo_responder(bigint, text) to service_role;
insert into public.fluxos (nome, descricao, ativo, modo)
select 'Boas-vindas', 'Responde o primeiro contato e pergunta nome e cidade.', false, 'rascunho'
where not exists (select 1 from public.fluxos where nome = 'Boas-vindas');
do $$
declare v_id bigint;
begin
  select id into v_id from public.fluxos where nome = 'Boas-vindas';
  insert into public.fluxo_passos
    (fluxo_id, ordem, estagio, titulo, mensagem, espera_resposta, guarda_em, automatico)
  values
    (v_id, 1, 'novo', 'Cumprimenta e pergunta o nome',
     E'Oi! Aqui é da equipe da Talita Oliveira 💙\n\nQue bom que você chamou. Como é seu nome?',
     true, 'nome', true),
    (v_id, 2, 'qualificando', 'Pergunta a cidade',
     E'Prazer, {{nome}}! 🙏\n\nDe qual cidade você fala com a gente?',
     true, 'municipio', true),
    (v_id, 3, 'qualificando', 'Avisa que já vai ser atendido',
     E'Anotado, {{nome}}. Já já uma pessoa da equipe continua com você por aqui, tá bom?',
     false, null, true)
  on conflict (fluxo_id, ordem) do nothing;
end $$;
do $$
declare t text;
begin
  foreach t in array array['fluxos', 'fluxo_passos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s le" on public.%I', t, t);
    execute format(
      'create policy "%s le" on public.%I for select to authenticated
         using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()))', t, t);
    execute format('drop policy if exists "%s mexe" on public.%I', t, t);
    execute format(
      'create policy "%s mexe" on public.%I for all to authenticated
         using ((select public.perfil_supervisao()))
         with check ((select public.perfil_supervisao()))', t, t);
  end loop;
end $$;
select f.nome, f.ativo, f.modo,
       cardinality(f.telefones_teste) as telefones_de_teste,
       count(p.id)                    as passos
  from public.fluxos f
  left join public.fluxo_passos p on p.fluxo_id = f.id
 group by f.id, f.nome, f.ativo, f.modo, f.telefones_teste;
select 'parte 6 ok (fluxo)' as marcador;

-- ─── parte 7: audios ───────────────────────────────────────────
create table if not exists public.audios (
  id          bigserial primary key,
  titulo      text not null,
  quando      text,
  arquivo     text not null,          -- caminho no balde
  mime        text,
  duracao_seg int,
  bytes       int,
  ordem       int not null default 100,
  ativo       boolean not null default true,
  vezes       int not null default 0,
  ultimo_uso  timestamptz,
  criado_por  uuid references public.profiles(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index if not exists audios_ordem on public.audios (ordem, titulo)
  where ativo;
insert into storage.buckets (id, name, public, file_size_limit)
values ('audios', 'audios', false, 26214400)     -- 25 MB, o teto do WhatsApp
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400;
drop policy if exists "audios le" on storage.objects;
drop policy if exists "audios escreve" on storage.objects;
create policy "audios le" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audios'
    and ((select public.perfil_atendimento()) or (select public.perfil_supervisao()))
  );
create policy "audios escreve" on storage.objects
  for all to authenticated
  using (bucket_id = 'audios' and (select public.perfil_supervisao()))
  with check (bucket_id = 'audios' and (select public.perfil_supervisao()));
alter table public.audios enable row level security;
drop policy if exists "audios lista" on public.audios;
create policy "audios lista" on public.audios
  for select to authenticated
  using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()));
drop policy if exists "audios cuida" on public.audios;
create policy "audios cuida" on public.audios
  for all to authenticated
  using ((select public.perfil_supervisao()))
  with check ((select public.perfil_supervisao()));
create or replace function public.audio_usado(p_audio bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.audios
     set vezes = vezes + 1,
         ultimo_uso = now()
   where id = p_audio;
end $$;
revoke all on function public.audio_usado(bigint) from public, anon;
grant execute on function public.audio_usado(bigint) to authenticated, service_role;
select 'parte 7 ok (audios)' as marcador;

