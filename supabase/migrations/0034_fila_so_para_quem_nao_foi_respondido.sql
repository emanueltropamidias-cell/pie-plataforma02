-- ============================================================================
-- "DEVOLVER PARA A FILA" SÓ LEVA O QUE NINGUÉM RESPONDEU
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- Revisão da caixa, 15/09. A aba "Aguardando" é do que NUNCA teve resposta
-- (`primeira_resp_at is null`), e "Meus atendimentos" exige dona. Uma conversa
-- já respondida e sem dona não cai em aba nenhuma de caixa nenhuma: some para
-- as atendentes e só a Supervisão enxerga.
--
-- A `supervisao_mover` da 0032 fazia exatamente isso ao "devolver para a fila"
-- as conversas "aguardando retorno" de uma atendente. Agora, com destino nulo,
-- só as nunca respondidas saem; as respondidas ficam com a dona e voltam na
-- resposta como `ficaram`, para a tela pedir uma pessoa para elas.
--
-- A transferência da caixa (`transferir.tsx`) ganhou a mesma regra na tela: em
-- conversa respondida a opção "deixar na fila do setor" não aparece.

create or replace function public.supervisao_mover(
  p_conversas bigint[], p_para uuid, p_so_sem_resposta boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nome text;
  v_movidas integer;
  v_ficaram integer := 0;
begin
  if not public.perfil_supervisao() then
    raise exception 'Só a supervisão redistribui conversas.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_conversas, 1), 0) = 0 then
    return jsonb_build_object('movidas', 0, 'ficaram', 0);
  end if;
  if p_para is not null then
    select nome into v_nome from atendentes where id = p_para;
    if v_nome is null then
      raise exception 'Essa pessoa não está na lista de atendentes.';
    end if;
  else
    select count(*) into v_ficaram
      from conversas c
     where c.id = any(p_conversas) and c.encerrada_em is null
       and c.atendente_id is not null and c.primeira_resp_at is not null;
  end if;

  with alvo as (
    select c.id, c.telefone, c.atendente_id as de, c.departamento_id
      from conversas c
     where c.id = any(p_conversas)
       and c.encerrada_em is null
       and c.atendente_id is distinct from p_para
       -- Para a fila, só o que nunca teve resposta (ver o cabeçalho).
       and (p_para is not null or c.primeira_resp_at is null)
       and (not coalesce(p_so_sem_resposta, false)
            or (c.tipo is distinct from 'disparo'
                and ((c.primeira_resp_at is null and c.primeira_msg_at is not null)
                     or c.ultima_direcao = 'inbound')))
     for update
  ),
  mudou as (
    update conversas c
       set atendente_id  = p_para,
           atribuido_em  = case when p_para is not null then now() end,
           atualizado_em = now()
      from alvo
     where c.id = alvo.id
    returning alvo.id, alvo.telefone, alvo.de, alvo.departamento_id
  ),
  log as (
    insert into atribuicoes (conversa_id, telefone, de_atendente, para_atendente,
                             de_departamento, para_departamento, motivo, regra, feita_por)
    select id, telefone, de, p_para, departamento_id, departamento_id, 'supervisao',
           case when p_para is null then 'para-a-fila' else 'para-pessoa' end, auth.uid()
      from mudou
    returning 1
  )
  select count(*) into v_movidas from log;

  return jsonb_build_object('movidas', v_movidas, 'ficaram', v_ficaram, 'para', v_nome);
end $$;

revoke all on function public.supervisao_mover(bigint[], uuid, boolean) from public, anon;
grant execute on function public.supervisao_mover(bigint[], uuid, boolean) to authenticated;
