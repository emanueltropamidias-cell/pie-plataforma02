-- ============================================================================
-- APOIADOR **E** MULTIPLICADOR — as duas coisas ao mesmo tempo
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- "as meninas hoje conseguem marcar somente uma tag" / "às vezes a pessoa é
-- apoiador e multiplicador".
--
-- ── POR QUE SÓ CABIA UMA ────────────────────────────────────────────────────
--
-- `conversas.status_lead` é UMA COLUNA DE TEXTO, não lista. O gatilho
-- `tag_alimenta_eixos` escreve o status novo por cima do antigo — de propósito,
-- e é isso que faz o painel fechar 100%: cada pessoa, um status.
--
-- Mas apoiador e multiplicador NÃO SÃO ALTERNATIVAS. Apoiador é a POSIÇÃO dela
-- (está com a gente). Multiplicador é o PAPEL (traz outras pessoas). Uma coisa
-- não exclui a outra — a própria campanha manda a mensagem "Convite para ser um
-- Multiplicador" justamente para quem já declarou apoio.
--
-- Eram duas perguntas diferentes disputando o mesmo campo.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
--
-- Multiplicador sai do eixo `status` e ganha eixo próprio, `perfil`, guardado
-- em LISTA — exatamente como as demandas já são. A atendente passa a marcar os
-- dois, e marcar o perfil não apaga o status.
--
-- Não foi preciso inventar desenho novo: a plataforma já fazia isso para
-- demanda. Faltava dizer que multiplicador é perfil, não status.

-- ── 1. A COLUNA ─────────────────────────────────────────────────────────────
alter table public.conversas
  add column if not exists perfis text[] not null default '{}'::text[];

create index if not exists conversas_perfis on public.conversas using gin (perfis);

-- ── 2. O GATILHO APRENDE O TERCEIRO EIXO ────────────────────────────────────
--
-- `status` continua sendo um só (coluna, escreve por cima). `perfil` e
-- `demanda` são listas: acrescentam e tiram sem tocar no resto.
create or replace function public.tag_alimenta_eixos()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_eixo     text;
  v_valor    text;
  v_conversa bigint;
begin
  v_conversa := coalesce(new.conversa_id, old.conversa_id);
  select t.eixo, t.valor into v_eixo, v_valor
    from public.tags t
   where t.id = coalesce(new.tag_id, old.tag_id);

  -- Etiqueta da equipe (sem eixo) não alimenta coluna nenhuma.
  if v_eixo is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if v_eixo = 'status' then
      -- A trava da 0033 continua: dois cliques rápidos em status diferentes
      -- corriam juntos e os dois ficavam. Aqui a segunda espera a primeira.
      perform pg_advisory_xact_lock(hashtext('status:' || v_conversa::text));
      delete from public.conversa_tags ct
       using public.tags t
       where ct.tag_id = t.id
         and ct.conversa_id = v_conversa
         and t.eixo = 'status'
         and ct.tag_id <> new.tag_id;
      update public.conversas
         set status_lead = v_valor, atualizado_em = now()
       where id = v_conversa;

    elsif v_eixo = 'perfil' then
      -- LISTA, e sem tocar no status: é esta linha que permite apoiador E
      -- multiplicador ao mesmo tempo.
      update public.conversas
         set perfis = (select array(select distinct unnest(perfis || array[v_valor]))),
             atualizado_em = now()
       where id = v_conversa;

    else
      update public.conversas
         set demandas = (select array(select distinct unnest(demandas || array[v_valor]))),
             atualizado_em = now()
       where id = v_conversa;
    end if;

  elsif tg_op = 'DELETE' then
    if v_eixo = 'status' then
      update public.conversas
         set status_lead = null, atualizado_em = now()
       where id = v_conversa and status_lead = v_valor;
    elsif v_eixo = 'perfil' then
      update public.conversas
         set perfis = array_remove(perfis, v_valor), atualizado_em = now()
       where id = v_conversa;
    else
      update public.conversas
         set demandas = array_remove(demandas, v_valor), atualizado_em = now()
       where id = v_conversa;
    end if;
  end if;

  return coalesce(new, old);
end $function$;

-- ── 3. A TRAVA DE EIXO APRENDE O TERCEIRO ───────────────────────────────────
--
-- `tags_eixo_check` só admitia 'status' e 'demanda'. Ela existe para impedir
-- eixo digitado errado virar um grupo fantasma na tela, e continua valendo —
-- só passa a conhecer 'perfil'.
alter table public.tags drop constraint if exists tags_eixo_check;
alter table public.tags add constraint tags_eixo_check
  check (eixo = any (array['status'::text, 'demanda'::text, 'perfil'::text]));

-- ── 4. MULTIPLICADOR MUDA DE EIXO ───────────────────────────────────────────
update public.tags set eixo = 'perfil' where valor = 'multiplicador';

-- ── 5. QUEM JÁ ESTAVA MARCADO ───────────────────────────────────────────────
--
-- 471 conversas tinham `status_lead = 'multiplicador'`. Elas passam a ter o
-- perfil, e o status delas vira `apoiador`.
--
-- ISSO É UMA INFERÊNCIA, e fica escrita aqui para não passar por fato: o
-- status anterior dessas pessoas foi APAGADO quando alguém marcou
-- multiplicador — a informação não existe mais. Mas na operação desta campanha
-- multiplicador é convidado entre quem já declarou apoio (a mensagem pronta
-- "Convite para ser um Multiplicador" é mandada nesse momento), então apoiador
-- é a leitura mais próxima da verdade.
--
-- Desfazer, se estiver errado:
--     update public.conversas set status_lead = 'multiplicador'
--      where 'multiplicador' = any(perfis) and status_lead = 'apoiador';
update public.conversas
   set perfis = (select array(select distinct unnest(perfis || array['multiplicador']))),
       status_lead = 'apoiador'
 where status_lead = 'multiplicador';

-- ── 6. AS MÉTRICAS CONTINUAM MOSTRANDO MULTIPLICADORES ──────────────────────
--
-- As telas leem a contagem por status. Sem isto, multiplicador sumiria delas no
-- mesmo instante — conserto que apaga um número da tela não é conserto.
--
-- A conta passa a sair da lista de perfis. Atenção ao que isso significa: quem
-- é apoiador E multiplicador entra nas DUAS contagens, e a soma das fatias
-- passa de 100%. É o preço de deixar a pessoa ser as duas coisas, e era
-- exatamente isso que foi pedido.
create or replace function public.contar_perfil(p_perfil text, p_desde timestamptz)
returns bigint
language sql
stable
set search_path = public, pg_temp
as $function$
  select count(*) from public.conversas
   where p_perfil = any(perfis)
     and coalesce(primeira_msg_at, criado_em) >= p_desde;
$function$;

revoke all on function public.contar_perfil(text, timestamptz) from public, anon;
grant execute on function public.contar_perfil(text, timestamptz) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
select nome, eixo, valor from public.tags where valor = 'multiplicador';

select count(*) filter (where 'multiplicador' = any(perfis))        as com_perfil_multiplicador,
       count(*) filter (where status_lead = 'multiplicador')        as ainda_no_status,
       count(*) filter (where status_lead = 'apoiador'
                          and 'multiplicador' = any(perfis))        as apoiador_e_multiplicador
  from public.conversas;
