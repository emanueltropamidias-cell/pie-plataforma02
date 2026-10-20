-- ============================================================================
-- MÉTRICAS DO ATENDIMENTO — a conta feita no banco, não no navegador
-- ============================================================================
--
-- Rode inteiro no SQL Editor do Supabase. Pode rodar de novo sem medo: só cria
-- e substitui funções, não toca em dado nenhum.
--
-- POR QUE NO BANCO.
--
-- A tela precisa de quatro números grandes, a distribuição por status e a
-- contagem por demanda — tudo isso recortado por período, atendente, município
-- e origem da campanha.
--
-- Fazer isso no navegador significa trazer as linhas para contar. A 600–1000
-- leads por dia, trinta dias são até 30 mil conversas por carga de tela, e a
-- pessoa ainda troca de filtro cinco vezes seguidas. O Postgres já sabe contar;
-- o que ele devolve aqui são algumas dezenas de bytes.
--
-- SEM `security definer`, DE PROPÓSITO.
--
-- A função roda como quem chamou, então a RLS de `conversas` continua valendo.
-- Uma função que ignorasse a RLS viraria a porta dos fundos para a base inteira
-- — bastaria alguém autenticado chamá-la.

-- ── os números da tela ──────────────────────────────────────────────────────
create or replace function public.metricas_atendimento(
  p_dias      int   default 30,     -- 0 = hoje · null = desde sempre
  p_atendente uuid  default null,
  p_municipio text  default null,
  p_origem    text  default null
) returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  with recorte as (
    select c.tipo, c.status_lead, c.demandas
      from public.conversas c
     where (
             p_dias is null
             or coalesce(c.primeira_msg_at, c.criado_em) >= (
                  case
                    -- HOJE é desde a meia-noite da Bahia, não as últimas 24h.
                    --
                    -- E o fuso é obrigatório aqui: o Supabase roda em UTC, então
                    -- `date_trunc('day', now())` começaria o dia às 21h de
                    -- ontem no horário de quem trabalha. Às 8h da manhã, o
                    -- "leads de hoje" já viria com onze horas de ontem dentro —
                    -- e ninguém desconfiaria do número.
                    when p_dias = 0 then
                      date_trunc('day', now() at time zone 'America/Bahia')
                        at time zone 'America/Bahia'
                    else now() - make_interval(days => p_dias)
                  end
                )
           )
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
       and (
             p_dias is null
             or ct.marcada_em >= (
                  case
                    when p_dias = 0 then
                      date_trunc('day', now() at time zone 'America/Bahia')
                        at time zone 'America/Bahia'
                    else now() - make_interval(days => p_dias)
                  end
                )
           )
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
  'Os dois eixos do atendimento, agregados no banco. Eixo 1 (status) fecha 100% dos leads; eixo 2 (demandas) não fecha, porque uma pessoa pode ter várias.';

-- ── o que preencher nos filtros ─────────────────────────────────────────────
--
-- Município e origem vêm do que EXISTE nas conversas, não de uma lista fixa: um
-- filtro que oferece cidade sem nenhuma conversa faz a pessoa achar que a tela
-- quebrou quando o resultado vem vazio.
create or replace function public.opcoes_metricas()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'municipios', coalesce((
      select jsonb_agg(m order by m)
        from (select distinct municipio as m from public.conversas
               where municipio is not null and municipio <> '') a
    ), '[]'::jsonb),
    'origens', coalesce((
      select jsonb_agg(o order by o)
        from (select distinct origem as o from public.conversas
               where origem is not null and origem <> '') b
    ), '[]'::jsonb)
  );
$$;

-- ── quem pode chamar ────────────────────────────────────────────────────────
--
-- `authenticated` e não `anon`: a RLS de `conversas` já separa quem vê o quê,
-- mas conta anônima não tem por que sequer alcançar a função.
revoke all on function public.metricas_atendimento(int, uuid, text, text) from public, anon;
revoke all on function public.opcoes_metricas() from public, anon;
grant execute on function public.metricas_atendimento(int, uuid, text, text) to authenticated;
grant execute on function public.opcoes_metricas() to authenticated;

-- ── o índice que sustenta o recorte por período ─────────────────────────────
--
-- Todo filtro da tela começa cortando por data. Sem índice, cada troca de
-- período é uma varredura da tabela inteira.
-- Os parênteses a mais não são estilo: COALESCE é construção da linguagem, não
-- chamada de função, e sem eles o Postgres recusa a expressão no índice.
create index if not exists conversas_por_chegada
  on public.conversas ((coalesce(primeira_msg_at, criado_em)) desc);

create index if not exists conversas_por_municipio
  on public.conversas (municipio) where municipio is not null;

create index if not exists conversas_por_origem
  on public.conversas (origem) where origem is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- O editor do Supabase mostra só o resultado da ÚLTIMA consulta, então esta é
-- a única que devolve algo. Se aparecer uma linha com números, funcionou.
select
  'metricas_atendimento' as funcao,
  (public.metricas_atendimento(30, null, null, null) -> 'leads')::text    as leads_30d,
  (public.metricas_atendimento(30, null, null, null) -> 'status')::text   as status,
  (public.metricas_atendimento(30, null, null, null) -> 'demandas')::text as demandas,
  -- `classificadas` DE HOJE, e não de 30 dias: é o número que a equipe olha, e
  -- é o que prova que esta versão da função entrou. Sem ele na conferência,
  -- rodar uma cópia antiga do arquivo passava como sucesso — foi o que
  -- aconteceu em 28/08, e a coluna nova voltou nula sem ninguém entender.
  --
  -- Conferência que não olha o que a mudança acrescentou não confere nada.
  (public.metricas_atendimento(0, null, null, null) -> 'classificadas')::text
                                                                         as classificadas_hoje,
  (public.opcoes_metricas() -> 'municipios')::text                        as municipios;
