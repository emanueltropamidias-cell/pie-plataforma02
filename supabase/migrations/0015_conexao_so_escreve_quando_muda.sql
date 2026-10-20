-- ============================================================================
-- A CONEXÃO SÓ É GRAVADA QUANDO MUDA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- "A plataforma está travando muito, tanto para os atendentes quanto para mim."
--
-- ── O QUE A MEDIÇÃO MOSTROU ─────────────────────────────────────────────────
--
-- Escritas acumuladas por tabela:
--
--     numeros ......... 797.228     <- numa tabela de DEZOITO LINHAS
--     conversas ....... 244.309
--     liderancas ...... 108.981
--     mensagens ........ 84.792
--
-- `numeros` tem o TRIPLO das escritas de `conversas` e dez vezes as de
-- `mensagens`. Dezoito linhas escritas oitocentas mil vezes.
--
-- ── POR QUE ISSO TRAVA A PLATAFORMA INTEIRA ─────────────────────────────────
--
-- `sincronizarConexoes` pergunta à Evolution o estado de cada chip A CADA
-- CARREGAMENTO DE TELA, e chama esta função para os 18. Com 18 atendentes
-- navegando o dia todo, são centenas de milhares de `update`.
--
-- E o `update` era INCONDICIONAL: gravava `conexao_em = now()` mesmo quando o
-- chip continuava exatamente como estava. Escrever "nada mudou" custa o mesmo
-- que escrever uma mudança de verdade:
--
--   * cada `update` deixa uma linha morta — `numeros` chegou a 1140% de lixo,
--     mais linhas mortas que vivas numa tabela de 18;
--   * cada `update` gera WAL, e o Realtime PRECISA LER esse WAL para descobrir
--     que não interessa a ninguém. A leitura do WAL é hoje o maior consumidor
--     do banco: 11.290 segundos em 635 mil chamadas, mais que o dobro do
--     segundo colocado.
--
-- O chip que está `open` há três horas gerava milhares de escritas dizendo que
-- continua `open`.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- Escreve quando o estado MUDA. E escreve de novo, no máximo, a cada cinco
-- minutos — para `conexao_em` continuar servindo de sinal de vida, que é o que
-- responde "quando foi a última vez que perguntamos?".
--
-- Fora esses dois casos, não escreve nada e devolve o mesmo de antes. Quem
-- chama não percebe diferença nenhuma.
--
-- ── O QUE NÃO MUDA ──────────────────────────────────────────────────────────
--
-- `conexao_eventos` continua registrando TODA transição, que é o histórico de
-- quedas. Nenhuma queda deixa de ser vista: a economia é em cima do "continua
-- igual", nunca em cima da mudança.

create or replace function public.marcar_conexao(
  p_instancia text,
  p_estado    text,
  p_motivo    text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_antes   text;
  v_visto   timestamptz;
  v_novo    text := lower(coalesce(nullif(trim(p_estado), ''), 'desconhecido'));
  v_id      bigint;
  v_mudou   boolean;
begin
  if coalesce(p_instancia, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem instancia');
  end if;

  select id, conexao, conexao_em into v_id, v_antes, v_visto
    from public.numeros where instancia = p_instancia;

  -- Instância que a Evolution conhece e o PIE não: entra desligada e sem dono.
  -- Chip aparecendo sozinho no painel é melhor que chip invisível.
  if v_id is null then
    insert into public.numeros (apelido, instancia, ordem, conexao, conexao_em)
    values (p_instancia, p_instancia, 500, v_novo, now())
    on conflict (instancia) do nothing;
    select id, conexao, conexao_em into v_id, v_antes, v_visto
      from public.numeros where instancia = p_instancia;
  end if;

  v_mudou := coalesce(v_antes, '') is distinct from v_novo;

  -- ── O CORAÇÃO DESTA MIGRAÇÃO ──────────────────────────────────────────────
  --
  -- Sem esta condição, o `update` acontecia sempre. Com ela, o caso comum — o
  -- chip continua como estava — não escreve nada.
  --
  -- Os cinco minutos existem para `conexao_em` não congelar: ele responde "de
  -- quando é esta informação?", e uma resposta de três horas atrás não serve
  -- para decidir se o chip caiu. Cinco minutos é fino o bastante para a tela e
  -- grosso o bastante para a escrita deixar de pesar.
  if v_mudou or v_visto is null or v_visto < now() - interval '5 minutes' then
    update public.numeros set
      conexao      = v_novo,
      conexao_em   = now(),
      motivo_queda = case when v_novo = 'open' then null
                          else coalesce(p_motivo, motivo_queda) end,
      caiu_em      = case
                       when v_novo = 'open' then null
                       when coalesce(v_antes, '') = 'open' or caiu_em is null then now()
                       else caiu_em
                     end
     where id = v_id;
  end if;

  -- O histórico de quedas continua inteiro: toda transição vira evento,
  -- independente da economia acima.
  if v_mudou then
    insert into public.conexao_eventos (numero_id, instancia, de, para)
    values (v_id, p_instancia, v_antes, v_novo);
  end if;

  return jsonb_build_object('ok', true, 'de', v_antes, 'para', v_novo, 'mudou', v_mudou);
end $function$;

comment on function public.marcar_conexao is
  'Registra o estado do chip. Só ESCREVE quando o estado muda ou quando a informação passa de cinco minutos — antes escrevia a cada chamada, e 18 linhas acumularam 797 mil escritas que o Realtime tinha de ler e descartar.';

-- ── A FAXINA DO QUE JÁ FOI DEIXADO PARA TRÁS ────────────────────────────────
--
-- 797 mil escritas deixaram a tabela inchada de linha morta. `vacuum` NÃO roda
-- dentro de transação e este arquivo roda inteiro numa só, então a limpeza vai
-- por fora:
--
--     node scripts/faxina.mjs

-- ── conferência ─────────────────────────────────────────────────────────────
select relname as tabela, n_live_tup as vivas, n_dead_tup as mortas,
       pg_size_pretty(pg_total_relation_size(relid)) as tamanho
  from pg_stat_user_tables where schemaname='public' and relname='numeros';
