-- ============================================================================
-- STATUS É UM SÓ — também quando a atendente clica duas vezes rápido
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- 15/09, revisão da caixa ("as tags nunca ficam marcadas da forma correta").
-- Quatro conversas tinham DOIS status ao mesmo tempo, marcados pela mesma
-- atendente no mesmo milissegundo — dois cliques seguidos em status diferentes:
--
--   41511  aguardando retorno + pedido de PIX     14/09 22:25:17.331 (os dois)
--   47999  apoiador + multiplicador               10/09 10:44:27.678 (os dois)
--   105350 apoiador + em tratativa                14/09 10:15:27.016 / .037
--   107606 não apoiador + hater                   14/09 15:53:23.870 / .872
--
-- `tag_alimenta_eixos` apaga o status anterior quando entra um novo. Mas as
-- duas gravações correram JUNTAS: cada uma, ao apagar "os outros", ainda não
-- enxergava a outra (não confirmada). As duas ficaram, e o painel deixou de
-- fechar 100%.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
--
-- Uma trava por conversa (`pg_advisory_xact_lock`) antes de mexer no status. A
-- segunda gravação espera a primeira terminar e, quando anda, já enxerga a
-- marcação anterior e a apaga. Ganha o último clique — que é o que a tela
-- mostra (src/components/caixa/etiquetas.tsx faz a mesma troca).
--
-- A trava é por CONVERSA: marcações em conversas diferentes continuam em
-- paralelo, e o webhook do WhatsApp não espera ninguém.

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

  -- Etiqueta de trabalho não mexe em métrica.
  if v_eixo is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if v_eixo = 'status' then
      -- Uma marcação de status por vez nesta conversa (ver o cabeçalho).
      perform pg_advisory_xact_lock(hashtext('status_da_conversa'), (v_conversa % 2147483647)::int);

      -- STATUS É UM SÓ. Marcar "Apoiador" em quem já era "Indeciso" tem de
      -- TIRAR o indeciso — senão a soma passa de 100% e o eixo perde o sentido.
      delete from public.conversa_tags ct
       using public.tags t
       where ct.conversa_id = v_conversa
         and ct.tag_id = t.id
         and t.eixo = 'status'
         and ct.tag_id <> new.tag_id;

      -- Se a própria marcação já foi apagada por um clique posterior que
      -- chegou antes, não escreve um status que não tem mais etiqueta.
      if exists (select 1 from public.conversa_tags
                  where conversa_id = v_conversa and tag_id = new.tag_id) then
        update public.conversas
           set status_lead = v_valor, atualizado_em = now()
         where id = v_conversa;
      end if;
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
end $function$;

-- ── OS CASOS QUE JÁ ESTAVAM TORTOS ──────────────────────────────────────────
--
-- Onde há dois status, fica o que `status_lead` já dizia (é o que a caixa e as
-- métricas mostravam) e sai a outra etiqueta. Rodar de novo não acha nada.
delete from public.conversa_tags ct
 using public.tags t, public.conversas c
 where ct.tag_id = t.id and t.eixo = 'status'
   and c.id = ct.conversa_id
   and c.status_lead is not null
   and t.valor <> c.status_lead
   and exists (select 1 from public.conversa_tags ct2 join public.tags t2 on t2.id = ct2.tag_id
                where ct2.conversa_id = c.id and t2.eixo = 'status' and t2.valor = c.status_lead);

-- Conversa com etiqueta de status e `status_lead` vazio (8643, de 31/08): o
-- status volta a ser o da etiqueta.
update public.conversas c
   set status_lead = t.valor, atualizado_em = now()
  from public.conversa_tags ct join public.tags t on t.id = ct.tag_id and t.eixo = 'status'
 where ct.conversa_id = c.id
   and c.status_lead is null;

-- ── conferência: as duas contas têm de dar zero ─────────────────────────────
select
  (select count(*) from (select ct.conversa_id from public.conversa_tags ct join public.tags t on t.id = ct.tag_id
                          where t.eixo = 'status' group by 1 having count(*) > 1) x) as conversas_com_dois_status,
  (select count(*) from public.conversas c join public.conversa_tags ct on ct.conversa_id = c.id
                   join public.tags t on t.id = ct.tag_id and t.eixo = 'status'
    where c.status_lead is distinct from t.valor) as status_diferente_da_etiqueta;
