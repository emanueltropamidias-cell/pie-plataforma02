-- ============================================================================
-- A ETIQUETA ESPERA A CONVERSA CHEGAR
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O PROBLEMA ──────────────────────────────────────────────────────────────
--
-- Chip cai. A equipe atende pelo aparelho e marca as etiquetas lá — Apoiador,
-- Saúde, Emprego. Chip volta.
--
-- Na volta o WhatsApp reenvia tudo: as conversas E as etiquetas. Só que sem
-- ordem garantida. E quando a etiqueta chega antes de a conversa existir no
-- PIE, `etiqueta_do_whatsapp` devolve "conversa nao encontrada" e a marcação é
-- JOGADA FORA.
--
-- Numa queda longa isso é a maioria: a pessoa escreveu durante a queda, então a
-- conversa só nasce quando a importação de mensagens roda. Toda a classificação
-- feita no aparelho se perdia, e a menina precisaria remarcar uma por uma —
-- sem saber quais.
--
-- ── A SOLUÇÃO ───────────────────────────────────────────────────────────────
--
-- Em vez de descartar, a etiqueta fica ESPERANDO. Quando a conversa daquele
-- telefone aparece, ela é aplicada sozinha.
--
-- Não é fila de reprocessamento com relógio — é gatilho: a conversa nasce, o
-- banco olha se havia etiqueta esperando por aquele número, e aplica na hora.
-- Sem tarefa agendada, sem nada para lembrar de ligar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ONDE A ETIQUETA ESPERA
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.etiquetas_pendentes (
  id         bigserial primary key,

  -- Guardado como veio, e também em dígitos: o casamento com a conversa é por
  -- dígito (os últimos 11), porque o mesmo número aparece escrito de três
  -- jeitos entre WhatsApp, planilha e cadastro manual.
  telefone   text not null,
  digitos    text generated always as (right(public.so_digitos(telefone), 11)) stored,

  instancia  text,

  -- O NOME da etiqueta, e não o id. O id é interno de cada aparelho — o mesmo
  -- "Apoiador" tem id 4 num chip e 7 noutro. Guardar o nome é o que faz esta
  -- fila sobreviver a repareamento.
  label      text not null,
  remover    boolean not null default false,

  chegou_em  timestamptz not null default now(),
  aplicada_em timestamptz
);

-- A busca é sempre "tem algo pendente para estes dígitos?". Parcial porque o
-- que já foi aplicado não interessa mais, e a tabela só cresce.
create index if not exists etiquetas_pendentes_abertas
  on public.etiquetas_pendentes (digitos)
  where aplicada_em is null;

alter table public.etiquetas_pendentes enable row level security;

drop policy if exists "pendentes le" on public.etiquetas_pendentes;
create policy "pendentes le" on public.etiquetas_pendentes
  for select to authenticated
  using ((select public.perfil_supervisao()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A APLICAÇÃO PASSA A GUARDAR O QUE NÃO COUBE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Mesma função de antes, com uma diferença: onde ela devolvia "conversa nao
-- encontrada" e desistia, agora ela GUARDA.
create or replace function public.etiqueta_do_whatsapp(
  p_telefone  text,
  p_instancia text,
  p_label     text,
  p_remover   boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tag      bigint;
  v_conversa bigint;
  v_dig      text := right(public.so_digitos(p_telefone), 11);
begin
  select public.tag_do_whatsapp(p_label) into v_tag;

  -- ── SEM TELEFONE UTILIZÁVEL NÃO ENTRA NEM NA FILA ───────────────────────
  --
  -- Endereço `lid.` faz `so_digitos` devolver vazio, e `right(vazio, 11)` é
  -- vazio. Sem esta guarda a busca vira `digitos = ''`, que casa com TODA
  -- conversa sem telefone — a etiqueta cairia na pessoa errada.
  --
  -- Esta proteção veio do `conversa-por-lid.sql` e eu a tinha perdido ao usar
  -- o arquivo mais antigo como base. Fica aqui, que é onde a função mora agora.
  if v_dig is null or length(v_dig) < 10 then
    return jsonb_build_object('ok', false, 'motivo', 'sem telefone utilizavel',
                              'telefone', p_telefone);
  end if;

  -- ── A CONVERSA ──────────────────────────────────────────────────────────
  select c.id into v_conversa
    from public.conversas c
    left join public.numeros n on n.id = c.numero_id
   where right(public.so_digitos(c.telefone), 11) = v_dig
     -- A conversa endereçada por `lid.` nunca é o destino: ela não tem
     -- telefone, e casar por dígito vazio é como a etiqueta ia para a pessoa
     -- errada. Também do `conversa-por-lid.sql`.
     and c.telefone not like 'lid.%'
     and (p_instancia is null or n.instancia = p_instancia)
   order by (c.encerrada_em is null) desc, c.ultima_msg_at desc nulls last
   limit 1;

  -- ── AINDA NÃO CHEGOU: ESPERA ────────────────────────────────────────────
  --
  -- Guarda mesmo quando a etiqueta não tem par no PIE. O par pode ser criado
  -- depois — a coordenação cadastra "Alimento" na tela e o que ficou esperando
  -- passa a valer. Descartar aqui exigiria remarcar tudo no aparelho.
  if v_conversa is null then
    insert into public.etiquetas_pendentes (telefone, instancia, label, remover)
    values (p_telefone, p_instancia, p_label, p_remover);
    return jsonb_build_object('ok', true, 'esperando', true,
                              'motivo', 'conversa ainda nao existe',
                              'telefone', p_telefone, 'label', p_label);
  end if;

  if v_tag is null then
    -- A conversa existe mas a etiqueta não tem par. Também espera: o par pode
    -- nascer hoje à tarde, e aí a marcação entra sem ninguém refazer nada.
    insert into public.etiquetas_pendentes (telefone, instancia, label, remover)
    values (p_telefone, p_instancia, p_label, p_remover);
    return jsonb_build_object('ok', true, 'esperando', true,
                              'motivo', 'etiqueta sem par no PIE',
                              'label', p_label);
  end if;

  if p_remover then
    delete from public.conversa_tags
     where conversa_id = v_conversa and tag_id = v_tag;
  else
    insert into public.conversa_tags (conversa_id, tag_id)
    values (v_conversa, v_tag)
    on conflict do nothing;

    -- O EIXO 'STATUS' É EXCLUSIVO: marcar uma tira a outra, senão o painel
    -- passa de 100%.
    delete from public.conversa_tags ct
     using public.tags t, public.tags novo
     where ct.conversa_id = v_conversa
       and ct.tag_id = t.id
       and novo.id = v_tag
       and novo.eixo = 'status'
       and t.eixo = 'status'
       and t.id <> v_tag;
  end if;

  return jsonb_build_object('ok', true, 'conversa', v_conversa, 'tag', v_tag,
                            'removida', p_remover);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A CONVERSA NASCE E PUXA O QUE ESTAVA ESPERANDO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Gatilho, e não tarefa agendada: no instante em que a conversa entra, o banco
-- olha a fila daquele número e aplica. Nada para lembrar de ligar, nada que
-- fique parado se um relógio falhar.
create or replace function public.puxa_etiquetas_pendentes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dig text := right(public.so_digitos(new.telefone), 11);
  v_p   record;
  v_tag bigint;
begin
  -- `lid.` não tem telefone: `so_digitos` devolve vazio e casaria com qualquer
  -- coisa. Sai fora antes de fazer estrago.
  if v_dig is null or v_dig = '' then
    return new;
  end if;

  for v_p in
    select * from public.etiquetas_pendentes
     where digitos = v_dig and aplicada_em is null
     order by chegou_em
  loop
    select public.tag_do_whatsapp(v_p.label) into v_tag;
    -- Sem par ainda: continua esperando, para o dia em que a etiqueta existir.
    if v_tag is null then
      continue;
    end if;

    if v_p.remover then
      delete from public.conversa_tags
       where conversa_id = new.id and tag_id = v_tag;
    else
      insert into public.conversa_tags (conversa_id, tag_id)
      values (new.id, v_tag)
      on conflict do nothing;

      delete from public.conversa_tags ct
       using public.tags t, public.tags novo
       where ct.conversa_id = new.id
         and ct.tag_id = t.id
         and novo.id = v_tag
         and novo.eixo = 'status'
         and t.eixo = 'status'
         and t.id <> v_tag;
    end if;

    update public.etiquetas_pendentes
       set aplicada_em = now() where id = v_p.id;
  end loop;

  return new;
end $$;

-- AFTER, e não BEFORE: `conversa_tags` aponta para `conversas.id`, e no BEFORE
-- a linha ainda não existe — a chave estrangeira recusaria.
drop trigger if exists conversas_puxa_etiquetas on public.conversas;
create trigger conversas_puxa_etiquetas
  after insert on public.conversas
  for each row execute function public.puxa_etiquetas_pendentes();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. E O QUE JÁ ESTAVA NA FILA QUANDO A ETIQUETA FOI CRIADA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O outro caso: a conversa já existia, mas a etiqueta do WhatsApp não tinha par
-- no PIE. A coordenação cria o par depois, e o que esperava tem de entrar.
--
-- Chamar na mão depois de mexer nas etiquetas: `select public.aplicar_pendentes();`
create or replace function public.aplicar_pendentes()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p    record;
  v_tag  bigint;
  v_conv bigint;
  v_n    int := 0;
begin
  for v_p in
    select * from public.etiquetas_pendentes
     where aplicada_em is null
     order by chegou_em
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
end $$;

revoke all on function public.aplicar_pendentes() from public, anon;
grant execute on function public.aplicar_pendentes() to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
select count(*) filter (where aplicada_em is null) as esperando,
       count(*) filter (where aplicada_em is not null) as ja_aplicadas,
       count(*) as total
  from public.etiquetas_pendentes;
