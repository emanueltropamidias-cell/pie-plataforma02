-- ============================================================================
-- ASSUMIR CONVERSA — e o fechamento de uma porta que estava aberta
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A PORTA QUE ESTAVA ABERTA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `atribuir_conversa` é `security definer` — ignora a RLS — e estava concedida
-- a `authenticated`. Qualquer conta logada podia atribuir QUALQUER conversa a
-- QUALQUER pessoa: tirar um caso da colega, empurrar a própria fila para outra,
-- ou simplesmente embaralhar a distribuição inteira.
--
-- Ninguém no aplicativo a chama do navegador; só o webhook, que usa a chave de
-- serviço. A concessão era herança de quando a tela ainda ia usá-la.
revoke execute on function public.atribuir_conversa(bigint, uuid, text, text)
  from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ASSUMIR É PARA SI, E SÓ O QUE ESTÁ SEM DONO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A diferença para a função acima é o que ela NÃO deixa fazer:
--
--   · o destino é sempre quem chamou. Não há parâmetro de atendente, então não
--     existe "atribuir para outra pessoa";
--   · só pega o que está SEM DONO. Conversa da colega não se toma — supervisão
--     redistribui, e isso é outro gesto, com outro nome e outro registro.
--
-- O `for update` é o que faz isso funcionar com cinco pessoas na mesma fila:
-- duas clicando no mesmo lead ao mesmo tempo, a segunda espera a primeira
-- terminar e então enxerga o dono já preenchido. Sem ele, as duas leriam "sem
-- dono", as duas gravariam, e a última venceria em silêncio — com as duas
-- achando que o lead é seu.
create or replace function public.assumir_conversa(p_conversa bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eu       uuid := auth.uid();
  v_dono     uuid;
  v_telefone text;
  v_nome_dono text;
begin
  if v_eu is null or not public.perfil_atendimento() then
    raise exception 'sem permissao para assumir';
  end if;

  -- Precisa existir na escala. Quem não está cadastrado como atendente não tem
  -- capacidade nem carga, e a distribuição passaria a contar uma pessoa que o
  -- painel não enxerga.
  if not exists (select 1 from public.atendentes a where a.id = v_eu) then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'nao_e_atendente'
    );
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
    -- Alguém chegou primeiro. Devolve o nome para a tela poder dizer QUEM, em
    -- vez de um "não foi possível" que não ajuda ninguém.
    select a.nome into v_nome_dono from public.atendentes a where a.id = v_dono;
    return jsonb_build_object(
      'ok', false,
      'motivo', 'ja_tem_dono',
      'dono', coalesce(v_nome_dono, 'outra pessoa')
    );
  end if;

  update public.conversas
     set atendente_id = v_eu,
         atribuido_em = now(),
         atualizado_em = now()
   where id = p_conversa;

  -- `manual` e não `automatica`: no relatório de distribuição, o que a pessoa
  -- puxou da fila não pode se confundir com o que o sistema entregou. São duas
  -- histórias diferentes sobre a mesma equipe.
  insert into public.atribuicoes (
    conversa_id, telefone, de_atendente, para_atendente, motivo, regra, feita_por
  ) values (
    p_conversa, v_telefone, null, v_eu, 'manual', 'assumiu-da-fila', v_eu
  );

  return jsonb_build_object('ok', true, 'motivo', 'assumida');
end $$;

revoke all on function public.assumir_conversa(bigint) from public, anon;
grant execute on function public.assumir_conversa(bigint) to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  p.proname                                             as funcao,
  pg_get_userbyid(p.proowner)                           as dona,
  array_to_string(p.proacl::text[], ' | ')              as quem_pode_executar
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('assumir_conversa', 'atribuir_conversa')
order by 1;
