-- ============================================================================
-- TRANSFERIR PARA UMA PESSOA, E NÃO SÓ PARA O SETOR
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE OS DOIS CAMINHOS ────────────────────────────────────────────────
--
-- Deixar na fila do setor é o certo quando qualquer uma pode pegar: a conversa
-- espera, e quem estiver livre puxa.
--
-- Mas às vezes se sabe QUEM. "A Thami já falou com essa senhora ontem", "esse
-- caso é da Altineia". Sem escolher pessoa, a atendente transfere e depois
-- manda mensagem no grupo pedindo para fulana pegar — e é aí que a conversa se
-- perde entre o pedido e a memória de alguém.
--
-- A função aceita os dois. Sem pessoa, vai para a fila; com pessoa, já cai na
-- caixa dela.

-- Some a versão de três argumentos. Deixar as duas faz o PostgREST não saber
-- qual chamar quando o parâmetro novo não vem — e o erro só aparece em
-- produção, no meio de um atendimento.
drop function if exists public.transferir_conversa(bigint, bigint, text);

create or replace function public.transferir_conversa(
  p_conversa       bigint,
  p_departamento   bigint,
  p_para_atendente uuid default null,
  p_observacao     text default null
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
    -- A tela precisa do NOME para dizer "ficou com a Thami" em vez de um
    -- "transferido" que não diz nada.
    'pessoa', v_nome_pessoa
  );
end $$;

revoke all on function public.transferir_conversa(bigint, bigint, uuid, text) from public, anon;
grant execute on function public.transferir_conversa(bigint, bigint, uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- QUEM ESTÁ EM CADA SETOR, PARA A TELA MONTAR A LISTA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `security_invoker` porque view roda como DONA por padrão — e sem isso ela
-- devolveria a lista inteira para quem a RLS deveria limitar.
create or replace view public.membros_por_setor
with (security_invoker = on) as
  select m.departamento_id, a.id as atendente_id, a.nome,
         (select count(*) from public.conversas c
           where c.atendente_id = a.id and c.encerrada_em is null) as abertas
    from public.departamento_membros m
    join public.atendentes a on a.id = m.atendente_id;

revoke all on public.membros_por_setor from anon;
grant select on public.membros_por_setor to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
select d.nome as setor,
       coalesce(string_agg(v.nome || ' (' || v.abertas || ')', ', ' order by v.nome),
                '(ninguem)') as pessoas
  from public.departamentos d
  left join public.membros_por_setor v on v.departamento_id = d.id
 where d.ativo
 group by d.id, d.nome, d.ordem
 order by d.ordem, d.nome;
