-- ============================================================================
-- EDITAR O CADASTRO DEPOIS DE FEITO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- A conversa não chega pronta. A pessoa manda o nome, some, volta dois dias
-- depois e só então diz de onde é. A atendente cadastrava com o que tinha, e a
-- ficha virava pedra: "Cadastrada na base às 14h32" e mais nada. O município
-- que chegou depois não tinha onde entrar.
--
-- O contorno era pior que o buraco — cadastrar de novo criaria pessoa
-- duplicada, ou a menina anotava no caderno.
--
-- ── POR QUE NÃO REAPROVEITAR `confirmar_cadastro` ───────────────────────────
--
-- Ele parece servir e não serve, por três motivos:
--
--   1. Na liderança ele grava `municipio = coalesce(municipio, novo)` — só
--      PREENCHE VAZIO, nunca corrige. Editar um município já preenchido mudaria
--      a conversa e deixaria a liderança no valor velho. Duas verdades sobre a
--      mesma pessoa, e a tela de Leads lê da liderança.
--
--   2. Ele reescreve `cadastrado_por = auth.uid()`. Quem editasse roubaria o
--      crédito de quem cadastrou — e crédito é o que a métrica por atendente
--      conta.
--
--   3. Ele reescreve `cadastrado_em = now()`, jogando a pessoa para o dia de
--      hoje no relatório de cadastros.
--
-- Editar e cadastrar são gestos diferentes. Função diferente.
--
-- ── O QUE ESTA FUNÇÃO NÃO TOCA, E É DE PROPÓSITO ────────────────────────────
--
-- `demandas.municipio` e `demandas.municipe_nome` são CÓPIA HISTÓRICA — está
-- escrito no `demandas.sql`: "se o cadastro sumir, a demanda continua legível
-- no histórico". Corrigir o cadastro não reescreve o que já foi registrado.
--
-- Também não toca em `cadastrado_em` nem em `cadastrado_por`: a pessoa foi
-- cadastrada uma vez, por alguém, e editar não muda nenhuma das duas coisas.

create or replace function public.editar_cadastro(
  p_conversa  bigint,
  p_nome      text,
  p_municipio text,
  p_bairro    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lideranca uuid;
  v_dono      uuid;
  v_cadastro  timestamptz;
begin
  -- ── QUEM PODE EDITAR ────────────────────────────────────────────────────
  --
  -- `security definer` desliga a RLS, então a trava tem de ser explícita aqui.
  -- Espelha a política de `conversas`: supervisão mexe em tudo; atendente mexe
  -- no que é dela ou no que não é de ninguém.
  select lideranca_id, atendente_id, cadastrado_em
    into v_lideranca, v_dono, v_cadastro
    from public.conversas where id = p_conversa;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Conversa não encontrada.');
  end if;

  if not (
    public.perfil_supervisao()
    or (public.perfil_atendimento()
        and (v_dono = auth.uid() or v_dono is null))
  ) then
    return jsonb_build_object('ok', false, 'erro', 'Esta conversa não é sua.');
  end if;

  -- Editar é para cadastro que existe. Sem isto, a tela poderia "editar" quem
  -- nunca foi cadastrado e a pessoa ficaria com dados preenchidos e
  -- `cadastrado_em` nulo — invisível para a métrica e para a lista de Leads.
  if v_cadastro is null then
    return jsonb_build_object('ok', false, 'erro', 'Esta pessoa ainda não foi cadastrada. Use Cadastrar.');
  end if;

  if coalesce(trim(p_nome), '') = '' or coalesce(trim(p_municipio), '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Nome e município são obrigatórios.');
  end if;

  -- ── A CONVERSA ──────────────────────────────────────────────────────────
  update public.conversas set
    nome          = trim(p_nome),
    municipio     = trim(p_municipio),
    bairro        = nullif(trim(p_bairro), ''),
    atualizado_em = now()
  where id = p_conversa;

  -- ── A PESSOA, NA MESMA TRANSAÇÃO ────────────────────────────────────────
  --
  -- SOBRESCREVE, e não `coalesce`: aqui é correção deliberada de gente que
  -- está olhando a ficha. `coalesce` é a regra certa para ingestão automática,
  -- onde o palpite não pode vencer o que alguém conferiu — e é a regra errada
  -- para o gesto de corrigir.
  --
  -- As duas juntas ou nenhuma: a tela de Leads lê da liderança e a caixa lê da
  -- conversa. Atualizar uma só é criar duas verdades sobre a mesma pessoa.
  if v_lideranca is not null then
    update public.liderancas set
      nome      = trim(p_nome),
      municipio = trim(p_municipio),
      bairro    = nullif(trim(p_bairro), '')
    where id = v_lideranca;
  end if;

  return jsonb_build_object(
    'ok', true,
    'lideranca_id', v_lideranca,
    'sem_lideranca', v_lideranca is null
  );
end $$;

revoke all on function public.editar_cadastro(bigint, text, text, text)
  from public, anon;
grant execute on function public.editar_cadastro(bigint, text, text, text)
  to authenticated;

comment on function public.editar_cadastro is
  'Corrige nome, município e bairro de uma pessoa JÁ cadastrada, na conversa e na liderança ao mesmo tempo. Não mexe em cadastrado_em/cadastrado_por nem no histórico de demandas.';

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Tem de devolver uma linha. Se vier vazia, a função não entrou.
select p.proname as funcao,
       pg_get_function_identity_arguments(p.oid) as argumentos
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public' and p.proname = 'editar_cadastro';
