-- ============================================================================
-- FORA O PLANTÃO — o lead espera na fila e a atendente puxa
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- ANTES: a conversa chegava e o sistema escolhia uma atendente disponível,
-- pela proporção da carga. Isso exige que alguém mantenha a chave de plantão
-- em dia — e chave desatualizada distribui lead para quem não está na cadeira.
--
-- AGORA: a conversa chega, entra no setor padrão SEM DONO, e fica em
-- "Aguardando" até alguém puxar. Quem puxa é quem vai atender, então não existe
-- estado para manter atualizado. Menos peça, menos jeito de errar.
--
-- A capacidade e a disponibilidade deixam de ser usadas. Não apago as colunas:
-- se um dia a distribuição automática voltar, o histórico está lá — e coluna
-- apagada leva junto o que já foi gravado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. TRANSFERIR PASSA A SÓ MUDAR DE SETOR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sem plantão não há para quem entregar. Transferir agora move a conversa para
-- o setor de destino e a DEIXA SEM DONO — ou seja, ela volta para "Aguardando",
-- e alguém daquele setor puxa. É o mesmo caminho de um lead novo, e ter um
-- caminho só é o que torna a fila confiável.
create or replace function public.transferir_conversa(
  p_conversa      bigint,
  p_departamento  bigint,
  p_observacao    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_de_atendente    uuid;
  v_de_departamento bigint;
  v_telefone        text;
  v_nome_setor      text;
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

  update public.conversas
     set departamento_id = p_departamento,
         atendente_id    = null,      -- volta para a fila do setor
         atribuido_em    = null,
         atualizado_em   = now()
   where id = p_conversa;

  insert into public.atribuicoes (
    conversa_id, telefone, de_atendente, para_atendente,
    de_departamento, para_departamento, motivo, regra, feita_por
  ) values (
    p_conversa, v_telefone, v_de_atendente, null,
    v_de_departamento, p_departamento, 'transferencia',
    coalesce(p_observacao, 'para-a-fila'), auth.uid()
  );

  return jsonb_build_object('ok', true, 'setor', v_nome_setor);
end $$;

revoke all on function public.transferir_conversa(bigint, bigint, text) from public, anon;
grant execute on function public.transferir_conversa(bigint, bigint, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ASSUMIR NÃO EXIGE MAIS ESTAR NO PLANTÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Continua exigindo estar cadastrada como atendente — quem não está na lista
-- não aparece em relatório nenhum, e conversa atribuída a fantasma é pior que
-- conversa sem dono.
create or replace function public.assumir_conversa(p_conversa bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
end $$;

grant execute on function public.assumir_conversa(bigint) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O PAINEL DE SETORES SEM "NO PLANTÃO"
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists public.departamentos_painel;

create view public.departamentos_painel
with (security_invoker = on) as
  select
    d.id, d.nome, d.cor, d.descricao, d.ativo, d.ordem,
    d.padrao, d.auto_atribuir, d.sla_resposta_min, d.palavras_chave, d.fuso,
    public.departamento_aberto(d.id)                             as aberto_agora,
    count(distinct m.atendente_id)                               as membros,
    (select count(*) from public.conversas c
      where c.departamento_id = d.id and c.encerrada_em is null) as abertas,
    -- O número que manda alguém agir: chegou, ninguém puxou.
    (select count(*) from public.conversas c
      where c.departamento_id = d.id
        and c.encerrada_em is null
        and c.atendente_id is null)                              as aguardando,
    (select count(*) from public.conversas c
      where c.departamento_id = d.id
        and c.encerrada_em is null
        and c.primeira_resp_at is null
        and c.primeira_msg_at is not null
        and c.primeira_msg_at < now() - make_interval(mins => d.sla_resposta_min))
                                                                 as fora_do_sla,
    (select count(*) from public.departamento_turnos t
      where t.departamento_id = d.id)                            as turnos
  from public.departamentos d
  left join public.departamento_membros m on m.departamento_id = d.id
  group by d.id, d.nome, d.cor, d.descricao, d.ativo, d.ordem,
           d.padrao, d.auto_atribuir, d.sla_resposta_min, d.palavras_chave, d.fuso;

revoke all on public.departamentos_painel from anon;
grant select on public.departamentos_painel to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. UM SETOR SÓ: GERAL
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A ordem importa: primeiro o Geral existe e vira padrão, depois as conversas
-- mudam de casa, e só então os outros somem. Apagar antes deixaria conversa
-- apontando para setor inexistente no meio do caminho.
insert into public.departamentos (nome, cor, descricao, ordem, padrao, sla_resposta_min)
select 'Geral', '#0525f7', 'Todo lead chega aqui e espera alguem puxar.', 10, true, 15
where not exists (select 1 from public.departamentos where nome = 'Geral');

update public.departamentos set padrao = true, ativo = true where nome = 'Geral';

update public.conversas
   set departamento_id = (select id from public.departamentos where nome = 'Geral')
 where departamento_id is null
    or departamento_id <> (select id from public.departamentos where nome = 'Geral');

delete from public.departamentos where nome <> 'Geral';

-- ── conferência ─────────────────────────────────────────────────────────────
select nome, padrao, ativo, membros, abertas, aguardando, fora_do_sla,
       sla_resposta_min as sla_min, turnos
  from public.departamentos_painel
 order by ordem, nome;
