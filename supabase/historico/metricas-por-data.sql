-- ============================================================================
-- A JANELA PASSA A ACEITAR DIA DO CALENDÁRIO
-- ============================================================================
--
-- Rode DEPOIS de `metricas.sql`. Pode rodar de novo sem medo.
--
-- ── POR QUE `p_dias` NÃO DAVA CONTA ─────────────────────────────────────────
--
-- `p_dias` só sabe dizer "para trás a partir de agora". Serve para 7, 15, 30 —
-- e não serve para a pergunta que a coordenação faz de verdade: "quantos leads
-- entraram no sábado do comício?", "e na semana da dobradinha?".
--
-- Um dia específico é um intervalo com COMEÇO E FIM, e `p_dias` não tem fim.
-- Aproximar com "N dias atrás" traria tudo o que veio depois junto, e o número
-- pareceria certo.
--
-- ── A JANELA VIRA UMA REGRA SÓ ──────────────────────────────────────────────
--
-- O cálculo do começo estava escrito DUAS vezes dentro da função: uma para os
-- leads, outra para o trabalho de classificar. Duas cópias da mesma regra de
-- fuso horário é o tipo de coisa que desencontra na primeira mudança — e aqui
-- desencontrar significa dois números na mesma tela discordando sobre que dia
-- é hoje.
--
-- Agora são duas funções pequenas, e as duas pontas chamam as mesmas.
--
-- ── O FUSO NÃO É DETALHE ────────────────────────────────────────────────────
--
-- O Supabase roda em UTC. `2026-09-04` sem fuso começaria às 21h do dia 3 para
-- quem trabalha na Bahia — às 8h da manhã, o "dia 4" já viria com onze horas do
-- dia 3 dentro, e ninguém desconfiaria.
--
-- O fim é EXCLUSIVO, no primeiro instante do dia seguinte: `<= 23:59:59`
-- perderia as mensagens do último segundo, que existem.

create or replace function public.metricas_desde(p_dias int, p_de date)
returns timestamptz language sql stable
set search_path = public, pg_temp as $$
  select case
           when p_de is not null
             then p_de::timestamp at time zone 'America/Bahia'
           when p_dias is null then null
           -- HOJE é desde a meia-noite da Bahia, não as últimas 24 horas.
           when p_dias = 0
             then date_trunc('day', now() at time zone 'America/Bahia')
                    at time zone 'America/Bahia'
           else now() - make_interval(days => p_dias)
         end;
$$;

create or replace function public.metricas_ateh(p_ate date)
returns timestamptz language sql stable
set search_path = public, pg_temp as $$
  select case
           when p_ate is null then null
           else (p_ate + 1)::timestamp at time zone 'America/Bahia'
         end;
$$;

-- A aridade muda, e `create or replace` não troca lista de argumentos: sem o
-- drop ficariam DUAS funções com o mesmo nome, e a chamada por nome de
-- argumento viraria ambígua — erro em produção, não em desenvolvimento.
drop function if exists public.metricas_atendimento(int, uuid, text, text);

create or replace function public.metricas_atendimento(
  p_dias      int   default 30,     -- 0 = hoje · null = desde sempre
  p_atendente uuid  default null,
  p_municipio text  default null,
  p_origem    text  default null,
  -- Dia do calendário, na Bahia. Quando vêm preenchidas, mandam em `p_dias`.
  p_de        date  default null,
  p_ate       date  default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with recorte as (
    select c.tipo, c.status_lead, c.demandas
      from public.conversas c
     where (public.metricas_desde(p_dias, p_de) is null
            or coalesce(c.primeira_msg_at, c.criado_em)
                 >= public.metricas_desde(p_dias, p_de))
       and (public.metricas_ateh(p_ate) is null
            or coalesce(c.primeira_msg_at, c.criado_em)
                 < public.metricas_ateh(p_ate))
       -- ── O CRÉDITO É DE QUEM CADASTROU ────────────────────────────────
       --
       -- Era `c.atendente_id`: quem está COM a conversa. Regra do Emanuel em
       -- 28/08 — o lead credita para quem cadastrou.
       --
       -- A diferença deixou de ser teórica quando os chips começaram a cair. A
       -- equipe atende pelo WhatsApp no aparelho, onde não existe atribuição
       -- nenhuma, e cadastra aqui. Contar por `atendente_id` daria crédito a
       -- quem a distribuição encostou na conversa, e zero a quem sentou e
       -- cadastrou as quatrocentas.
       --
       -- `cadastrado_por` vem de `cadastrar_manual` e de `confirmar_cadastro`,
       -- e a conversa de quem já estava na base herda o cadastrador original
       -- pelo gatilho `conversa_nasce_conhecida` — o crédito não muda de dono
       -- porque a pessoa escreveu de novo.
       --
       -- ── MAS SÓ `cadastrado_por` ZERAVA A TELA ────────────────────────
       --
       -- A regra nasceu com os chips caídos: a equipe atendia no aparelho e
       -- cadastrava aqui, então cadastrar ERA o trabalho e `cadastrado_por`
       -- era o único registro dele.
       --
       -- Agora as meninas atendem DENTRO do PIE. O lead chega pelo WhatsApp,
       -- ninguém "cadastra" nada, e `cadastrado_por` fica nulo. Filtrar por
       -- atendente devolvia zero para todas — 65 apoiadores no total e nenhum
       -- com dono, porque a pergunta era "quem cadastrou?" numa operação onde
       -- ninguém cadastra.
       --
       -- `coalesce` atende as duas operações sem escolher entre elas:
       --   cadastrou na mão  -> crédito de quem cadastrou (a regra dele, intacta)
       --   chegou pelo chip  -> crédito de quem está com a conversa, que num
       --                        chip por atendente é a dona do chip
       and (p_atendente is null
            or coalesce(c.cadastrado_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio    = p_municipio)
       and (p_origem    is null or c.origem       = p_origem)
  ),
  -- O eixo zero: lead e disparo separados. `filter` conta os dois numa
  -- varredura só, em vez de uma consulta para cada.
  totais as (
    select
      count(*) filter (where tipo = 'lead')    as leads,
      count(*) filter (where tipo = 'disparo') as disparos
    from recorte
  ),
  -- O eixo 1: uma categoria por pessoa, e por isso a soma FECHA o total.
  eixo1 as (
    select coalesce(jsonb_object_agg(s, n), '{}'::jsonb) as status
      from (
        select status_lead as s, count(*) as n
          from recorte
         where status_lead is not null
         group by 1
      ) x
  ),
  -- O eixo 2 é independente: uma pessoa pode ter zero, uma ou várias demandas.
  -- Por isso ele SAI de um unnest e nunca fecha 100% — somar os dois eixos é o
  -- erro clássico, e o formato separado aqui é o que impede a soma.
  eixo2 as (
    select coalesce(jsonb_object_agg(d, n), '{}'::jsonb) as demandas
      from (
        -- `lateral unnest` e não unnest na lista de seleção: função que
        -- devolve conjunto misturada com group by tem ordem de avaliação
        -- traiçoeira, e aqui o número tem que estar certo.
        select d, count(*) as n
          from recorte r, lateral unnest(r.demandas) as d
         group by 1
      ) y
  ),
  -- ── O TRABALHO DA EQUIPE, QUE É OUTRA PERGUNTA ─────────────────────────
  --
  -- Os eixos acima medem O TRÁFEGO: dos leads que ENTRARAM no período, quantos
  -- são apoiadores. A soma fecha 100% e é isso que faz o painel bater.
  --
  -- Só que essa conta não enxerga o trabalho de classificar. A pessoa que
  -- chegou anteontem e a atendente marcou como apoiadora hoje não aparece em
  -- lugar nenhum de "hoje" — foi assim que 49 classificações viraram 41 na
  -- tela, e as duas marcadas às 22h sumiram.
  --
  -- Este número responde a outra pergunta, e por isso vem SEPARADO em vez de
  -- entrar no eixo: quantas pessoas a equipe classificou no período. Somá-lo
  -- às barras faria o eixo passar de 100% dos leads, e painel que não fecha é
  -- painel que ninguém confia.
  --
  -- A janela aqui é `marcada_em` — quando o trabalho foi feito, e não quando a
  -- pessoa chegou. É a diferença inteira.
  --
  -- O crédito segue a mesma regra do resto: quem marcou, e na falta dele
  -- (marcação antiga, de antes de `marcada_por` ser gravado) quem está com a
  -- conversa.
  trabalho as (
    select count(distinct c.id) as classificadas
      from public.conversa_tags ct
      join public.tags t       on t.id = ct.tag_id
      join public.conversas c  on c.id = ct.conversa_id
     where t.eixo = 'status'
       and (public.metricas_desde(p_dias, p_de) is null
            or ct.marcada_em >= public.metricas_desde(p_dias, p_de))
       and (public.metricas_ateh(p_ate) is null
            or ct.marcada_em < public.metricas_ateh(p_ate))
       and (p_atendente is null
            or coalesce(ct.marcada_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  )
  select jsonb_build_object(
    'leads',         (select leads    from totais),
    'disparos',      (select disparos from totais),
    'status',        (select status   from eixo1),
    'demandas',      (select demandas from eixo2),
    'classificadas', (select classificadas from trabalho)
  );
$$;


comment on function public.metricas_atendimento is
  'Os dois eixos do atendimento, agregados no banco. A janela é `p_dias` (para trás a partir de agora) ou `p_de`/`p_ate` (dia do calendário na Bahia, fim exclusivo). Eixo 1 fecha 100% dos leads; eixo 2 não fecha, porque uma pessoa pode ter várias demandas.';

-- ── conferência ─────────────────────────────────────────────────────────────
-- Os dois caminhos têm de bater no mesmo dia.
select (public.metricas_atendimento(0,    null, null, null) -> 'leads')::text as hoje_por_dias,
       (public.metricas_atendimento(null, null, null, null,
          (now() at time zone 'America/Bahia')::date,
          (now() at time zone 'America/Bahia')::date) -> 'leads')::text        as hoje_por_data;
