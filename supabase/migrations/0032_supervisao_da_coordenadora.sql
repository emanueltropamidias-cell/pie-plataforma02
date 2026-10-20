-- ============================================================================
-- SUPERVISÃO PARA A COORDENADORA — o painel da equipe e o poder de mexer
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- 15/09: "A parte de supervisão deixe redondo. Agora vamos ter uma coordenadora
-- para acompanhar as meninas."
--
-- A coordenadora entra com papel `supervisor`. A auditoria desse papel mostrou
-- que ela VIA tudo e não conseguia AGIR na tela de Supervisão, e que o número
-- por atendente era contado em cima das 500 conversas carregadas — o teto da
-- consulta virando métrica (regra 7 do CLAUDE.md).
--
-- ── 1. supervisao_equipe() ──────────────────────────────────────────────────
--
-- Uma linha por atendente, contada no banco, com o que se cobra de alguém:
--
--   abertas            conversas na mão dela agora
--   nao_atendidas      abertas em que ninguém respondeu nunca
--   aguardando         abertas em que a pessoa falou por último
--   espera_mais_antiga desde quando espera a pior das duas acima
--   chegaram_hoje      conversas dela que chegaram hoje
--   respondeu_hoje     conversas em que ela mandou mensagem hoje
--   enviadas_hoje      mensagens que ela mandou hoje
--   cadastros_hoje     pessoas que ela cadastrou hoje
--   classificou_hoje   conversas em que marcou status hoje
--   ultima_atividade   a última mensagem que ela mandou
--   chips              números dela e se estão conectados
--
-- As regras de "não atendida" e "aguardando" são as de `espera()` em
-- src/lib/conversa.ts. Mudou lá, muda aqui.
--
-- ── 2. supervisao_mover() ───────────────────────────────────────────────────
--
-- Passar conversas para outra atendente, ou devolver para a fila, uma ou várias
-- de uma vez. `transferir_conversa` continua sendo o caminho da caixa; ela exige
-- setor e que a pessoa seja do setor, o que serve para a atendente passar
-- adiante e trava a coordenação que só quer tirar vinte conversas esquecidas
-- de uma menina. Aqui o setor fica como está, e cada mudança fica registrada em
-- `atribuicoes`, como na transferência.

create or replace function public.supervisao_equipe()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Bahia') at time zone 'America/Bahia' as ini
  ),
  abertas as (
    select c.atendente_id,
           count(*) as abertas,
           count(*) filter (where c.tipo is distinct from 'disparo'
                              and c.primeira_resp_at is null and c.primeira_msg_at is not null) as nao_atendidas,
           count(*) filter (where c.tipo is distinct from 'disparo'
                              and c.primeira_resp_at is not null and c.ultima_direcao = 'inbound') as aguardando,
           min(case when c.tipo is distinct from 'disparo' and c.primeira_resp_at is null and c.primeira_msg_at is not null
                      then c.primeira_msg_at
                    when c.tipo is distinct from 'disparo' and c.ultima_direcao = 'inbound'
                      then c.ultima_msg_at end) as espera_mais_antiga
      from conversas c
     where c.encerrada_em is null and c.atendente_id is not null
     group by c.atendente_id
  ),
  chegaram as (
    select c.atendente_id, count(*) as n
      from conversas c, hoje
     where coalesce(c.primeira_msg_at, c.criado_em) >= hoje.ini and c.atendente_id is not null
     group by 1
  ),
  enviadas as (
    select m.enviada_por as atendente_id, count(*) as enviadas, count(distinct m.conversa_id) as conversas,
           max(m.momento) as ultima
      from mensagens m, hoje
     where m.direcao = 'outbound' and m.enviada_por is not null and m.momento >= hoje.ini
     group by 1
  ),
  ultima as (
    select a.id, (select max(m.momento) from mensagens m
                   where m.enviada_por = a.id and m.direcao = 'outbound') as quando
      from atendentes a
  ),
  cadastros as (
    select c.cadastrado_por as atendente_id, count(*) as n
      from conversas c, hoje
     where c.cadastrado_em >= hoje.ini and c.cadastrado_por is not null
     group by 1
  ),
  classificou as (
    select ct.marcada_por as atendente_id, count(distinct ct.conversa_id) as n
      from conversa_tags ct join tags t on t.id = ct.tag_id, hoje
     where t.eixo = 'status' and ct.marcada_em >= hoje.ini and ct.marcada_por is not null
     group by 1
  ),
  chips as (
    select n.atendente_id,
           jsonb_agg(jsonb_build_object('apelido', n.apelido, 'conexao', n.conexao, 'caiu_em', n.caiu_em) order by n.ordem) as lista
      from numeros n
     where n.ativo and n.atendente_id is not null
     group by 1
  )
  select case when not public.perfil_supervisao() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', a.id,
             'nome', a.nome,
             'papel', p.role,
             'abertas', coalesce(ab.abertas, 0),
             'nao_atendidas', coalesce(ab.nao_atendidas, 0),
             'aguardando', coalesce(ab.aguardando, 0),
             'espera_mais_antiga', ab.espera_mais_antiga,
             'chegaram_hoje', coalesce(ch.n, 0),
             'respondeu_hoje', coalesce(en.conversas, 0),
             'enviadas_hoje', coalesce(en.enviadas, 0),
             'cadastros_hoje', coalesce(ca.n, 0),
             'classificou_hoje', coalesce(cl.n, 0),
             'ultima_atividade', u.quando,
             'chips', coalesce(cp.lista, '[]'::jsonb)
           ) order by coalesce(ab.nao_atendidas, 0) + coalesce(ab.aguardando, 0) desc, a.nome)
      from atendentes a
      left join profiles p on p.id = a.id
      left join abertas ab on ab.atendente_id = a.id
      left join chegaram ch on ch.atendente_id = a.id
      left join enviadas en on en.atendente_id = a.id
      left join ultima u on u.id = a.id
      left join cadastros ca on ca.atendente_id = a.id
      left join classificou cl on cl.atendente_id = a.id
      left join chips cp on cp.atendente_id = a.id
  ), '[]'::jsonb) end
$$;

revoke all on function public.supervisao_equipe() from public, anon;
grant execute on function public.supervisao_equipe() to authenticated;

-- p_para nulo = volta para a fila, sem dono.
-- p_so_sem_resposta: com `true`, das conversas pedidas só mexe nas que ninguém
-- respondeu ou em que a pessoa falou por último — a tela usa isso no "devolver
-- as esquecidas da fulana", para não arrancar conversa que está andando.
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
begin
  if not public.perfil_supervisao() then
    raise exception 'Só a supervisão redistribui conversas.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_conversas, 1), 0) = 0 then
    return jsonb_build_object('movidas', 0);
  end if;
  if p_para is not null then
    select nome into v_nome from atendentes where id = p_para;
    if v_nome is null then
      raise exception 'Essa pessoa não está na lista de atendentes.';
    end if;
  end if;

  with alvo as (
    select c.id, c.telefone, c.atendente_id as de, c.departamento_id
      from conversas c
     where c.id = any(p_conversas)
       and c.encerrada_em is null
       and c.atendente_id is distinct from p_para
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

  return jsonb_build_object('movidas', v_movidas, 'para', v_nome);
end $$;

revoke all on function public.supervisao_mover(bigint[], uuid, boolean) from public, anon;
grant execute on function public.supervisao_mover(bigint[], uuid, boolean) to authenticated;

-- Para o "devolver as esquecidas da fulana" sem a tela ter de carregar as
-- conversas dela: os ids vêm do banco, com a mesma regra.
create or replace function public.supervisao_esquecidas(p_atendente uuid, p_horas integer)
returns bigint[]
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.perfil_supervisao() then '{}'::bigint[] else coalesce(array_agg(c.id), '{}') end
    from conversas c
   where c.atendente_id = p_atendente
     and c.encerrada_em is null
     and c.tipo is distinct from 'disparo'
     and ((c.primeira_resp_at is null and c.primeira_msg_at is not null
           and c.primeira_msg_at < now() - make_interval(hours => greatest(coalesce(p_horas, 0), 0)))
       or (c.primeira_resp_at is not null and c.ultima_direcao = 'inbound'
           and c.ultima_msg_at < now() - make_interval(hours => greatest(coalesce(p_horas, 0), 0))))
$$;

revoke all on function public.supervisao_esquecidas(uuid, integer) from public, anon;
grant execute on function public.supervisao_esquecidas(uuid, integer) to authenticated;
