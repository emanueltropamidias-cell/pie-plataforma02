-- ============================================================================
-- O CRÉDITO POR PESSOA PASSA A SER DE QUEM TRABALHOU
-- ============================================================================
--
-- Rode DEPOIS de `metricas-por-data.sql` e `leads-por-dia.sql`.
-- Pode rodar de novo sem medo.
--
-- ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
--
-- O filtro "Creditado a" usava `coalesce(cadastrado_por, atendente_id)`.
-- `atendente_id` é quem a conversa foi ATRIBUÍDA — e a distribuição atribui
-- sozinha, então o crédito chegava sem ninguém ter feito nada.
--
--   Maiana   837 no placar,  517 de trabalho real   (-320)
--   Alana    316 no placar,  157 de trabalho real   (-159)
--   Boneca   691 no placar,  707 de trabalho real   (+16)
--   Matheus  230 no placar,  250 de trabalho real   (+20)
--
-- Errava para OS DOIS LADOS: inflava quem recebeu fila e apagava quem cobriu
-- o buraco dos outros, porque o `coalesce` só enxerga um dono.
--
-- ── O QUE É "TRABALHAR NUMA CONVERSA" ───────────────────────────────────────
--
-- As três ações que deixam rastro de gente:
--
--   RESPONDEU    mandou mensagem de saída — pelo PIE ou pelo celular, que
--                agora tem autor desde `respondeu-pelo-celular.sql`
--   CADASTROU    `conversas.cadastrado_por`
--   CLASSIFICOU  marcou etiqueta, `conversa_tags.marcada_por`
--
-- Receber a conversa na fila NÃO é uma delas.
--
-- ── DUAS CONSEQUÊNCIAS, DE PROPÓSITO ────────────────────────────────────────
--
-- 1. UMA CONVERSA PODE TER MAIS DE UM DONO. Se a Maiana respondeu e a Boneca
--    classificou, as duas contam — porque as duas trabalharam. Isso faz a soma
--    por pessoa passar do total de conversas, e está certo: o total geral não
--    é a soma dos placares individuais, e nunca foi.
--
-- 2. 636 CONVERSAS FICAM SEM DONO. Ninguém respondeu, cadastrou nem
--    classificou. Hoje elas contam para quem recebeu a atribuição; sair do
--    placar é o correto, e é por isso que o número de alguém cai.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. QUEM TRABALHOU EM QUE CONVERSA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Uma visão só, e não a regra repetida em cada função. Ela já estava escrita
-- de TRÊS jeitos diferentes — a tela por `coalesce`, o gráfico igual, e a
-- exportação filtrando só por `atendente_id`. Três respostas para a mesma
-- pergunta, na mesma campanha.
create or replace view public.trabalho_conversa as
  select c.id as conversa_id, c.cadastrado_por as quem
    from public.conversas c
   where c.cadastrado_por is not null
  union
  select m.conversa_id, m.enviada_por
    from public.mensagens m
   where m.direcao = 'outbound' and m.enviada_por is not null
  union
  select ct.conversa_id, ct.marcada_por
    from public.conversa_tags ct
   where ct.marcada_por is not null;

comment on view public.trabalho_conversa is
  'Quem AGIU em cada conversa: respondeu, cadastrou ou classificou. Receber na fila não conta. É a fonte única do crédito por pessoa.';

-- Os três lados da união, cada um com o índice do seu filtro. Sem eles a visão
-- varre `mensagens` inteira a cada troca de filtro na tela.
create index if not exists mensagens_por_autor
  on public.mensagens (enviada_por, conversa_id)
  where direcao = 'outbound' and enviada_por is not null;

create index if not exists conversa_tags_por_quem_marcou
  on public.conversa_tags (marcada_por, conversa_id)
  where marcada_por is not null;

create index if not exists conversas_por_cadastrador
  on public.conversas (cadastrado_por)
  where cadastrado_por is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AS DUAS FUNÇÕES PASSAM A USAR A VISÃO
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.metricas_atendimento(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
       -- ── O CRÉDITO É DE QUEM TRABALHOU ────────────────────────────────
       --
       -- Era `coalesce(cadastrado_por, atendente_id)`. O `atendente_id` é quem
       -- a conversa foi ATRIBUÍDA, e a distribuição atribui sozinha: o crédito
       -- vinha sem ninguém ter feito nada.
       --
       -- Errava para os dois lados. A Maiana aparecia com 837 e tinha
       -- trabalhado 517 — 320 conversas caíram na fila dela e nunca foram
       -- respondidas. A Boneca aparecia com 691 e tinha trabalhado 707, porque
       -- parte do que ela fez foi em conversa atribuída a outra pessoa, e o
       -- `coalesce` só enxerga uma.
       --
       -- Numa campanha que decide escala por este número, inflar quem recebeu
       -- fila e apagar quem cobriu o buraco dos outros são o mesmo erro.
       and (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
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
$function$
;

CREATE OR REPLACE FUNCTION public.leads_por_dia(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with regua as (
    select generate_series(
             (date_trunc('day', now() at time zone 'America/Bahia')
               - make_interval(days => greatest(p_dias, 1) - 1))::date,
             (now() at time zone 'America/Bahia')::date,
             interval '1 day'
           )::date as dia
  ),
  contados as (
    select ((coalesce(c.primeira_msg_at, c.criado_em) at time zone 'America/Bahia')::date) as dia,
           count(*) as n
      from public.conversas c
     where c.tipo = 'lead'
       and coalesce(c.primeira_msg_at, c.criado_em)
             >= public.metricas_desde(greatest(p_dias, 1), null)
       -- O mesmo crédito do resto das métricas: quem cadastrou, e na falta
       -- dele quem está com a conversa.
       -- O mesmo crédito da tela: quem trabalhou, e não quem recebeu a fila.
       -- Regra diferente aqui faria o gráfico discordar dos números logo acima.
       and (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
     group by 1
  )
  select coalesce(
           jsonb_agg(
             jsonb_build_object('dia', r.dia, 'leads', coalesce(c.n, 0))
             order by r.dia
           ),
           '[]'::jsonb
         )
    from regua r
    left join contados c on c.dia = r.dia;
$function$
;


-- ── conferência ─────────────────────────────────────────────────────────────
-- Antes e depois, por pessoa. A coluna `diferenca` é o tamanho do erro que
-- estava no placar.
select p.nome,
       count(*) filter (where coalesce(c.cadastrado_por, c.atendente_id) = p.id) as placar_antigo,
       (select count(distinct t.conversa_id)
          from public.trabalho_conversa t where t.quem = p.id)                   as placar_novo,
       (select count(distinct t.conversa_id)
          from public.trabalho_conversa t where t.quem = p.id)
         - count(*) filter (where coalesce(c.cadastrado_por, c.atendente_id) = p.id) as diferenca
  from public.profiles p
  left join public.conversas c on true
 where p.role in ('atendente','admin')
 group by p.id, p.nome
having (select count(distinct t.conversa_id) from public.trabalho_conversa t where t.quem = p.id) > 0
 order by 3 desc;
-- A visão roda com os direitos de QUEM CHAMA, e não com os do dono. Sem isto
-- ela seria porta dos fundos: a RLS de `conversas` e `mensagens` deixaria de
-- valer para quem consultasse por aqui.
alter view public.trabalho_conversa set (security_invoker = true);

-- A exportação filtra por PostgREST, que não faz subconsulta. Esta visão dá a
-- ela a mesma regra da tela: uma linha por (conversa, quem trabalhou).
--
-- Só serve FILTRADA por pessoa — sem filtro ela repete a conversa uma vez por
-- trabalhador, e a planilha sairia com gente duplicada. A rota só a usa quando
-- há atendente escolhido.
create or replace view public.conversas_creditadas
with (security_invoker = true) as
  select c.*, t.quem as creditada_a
    from public.conversas c
    join public.trabalho_conversa t on t.conversa_id = c.id;

comment on view public.conversas_creditadas is
  'conversas + quem trabalhou nela. Use SEMPRE com filtro por creditada_a: sem ele a conversa se repete uma vez por trabalhador.';

select count(*) as linhas_na_visao,
       count(distinct conversa_id) as conversas_distintas
  from public.trabalho_conversa;
