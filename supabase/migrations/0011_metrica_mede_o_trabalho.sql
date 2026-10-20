-- ============================================================================
-- A MÉTRICA POR ATENDENTE PASSA A MEDIR O TRABALHO, NÃO A CHEGADA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga conversa nem mensagem.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- "A Boneca falou hoje com mais de 100 pessoas e a métrica mostra 6."
--
-- Medido, com a Maiana, que é o caso mais gritante:
--
--     leads "Hoje" na tela ........... 6
--     conversas abertas com ela ...... 1.153
--
-- E do outro lado, a Patricia Barbosa aparecendo com 224 leads e 76 apoiadores
-- no mesmo dia. Ela não é 37 vezes melhor: ela está recebendo os que chegam
-- hoje, e a Maiana está segurando os que chegaram antes.
--
-- ── A CAUSA ─────────────────────────────────────────────────────────────────
--
-- A janela filtrava por QUANDO O LEAD CHEGOU e cruzava isso com "ela trabalhou
-- nesta conversa" — uma condição sem data nenhuma:
--
--     where coalesce(c.primeira_msg_at, c.criado_em) >= <início da janela>
--       and exists (select 1 from trabalho_conversa t where ...)
--
-- Então "Hoje" respondia "de tudo que chegou hoje, quanto ela encostou" — que
-- não é o trabalho dela, é a sorte da fila nova ter caído no colo dela. Quem
-- passa o dia respondendo o atraso some da conta.
--
-- Numa campanha que decide escala e cobra desempenho por este número, isso
-- apaga justamente quem está cobrindo o buraco.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- `trabalho_conversa` ganha QUANDO. Ela já sabia QUEM trabalhou em QUAL
-- conversa; agora sabe o dia. As três origens já tinham a data guardada — só
-- não estavam sendo lidas.
--
-- Com filtro de atendente, a janela passa a usar essa data. SEM filtro, nada
-- muda: a pergunta continua sendo "quantos leads chegaram", que é a certa para
-- a visão da campanha inteira.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A VIEW DO TRABALHO GANHA DATA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `security_invoker` porque ela lê três tabelas com RLS: sem isso, a view
-- devolveria para qualquer um o que só a supervisão pode ver.
-- ── UMA LINHA POR (CONVERSA, PESSOA), COMO SEMPRE FOI ──────────────────────
--
-- A tentação era trocar o `union` por `union all` e deixar uma linha por toque.
-- NÃO DÁ: `conversas_creditadas` faz JOIN com esta view, e com uma linha por
-- toque uma conversa respondida cinquenta vezes viraria cinquenta conversas
-- naquele relatório — sem erro nenhum, só um número inflado.
--
-- Então o formato não muda: uma linha por pessoa por conversa. O que entra é a
-- data do ÚLTIMO toque dela ali. É o que descreve o dia de trabalho: quem mexeu
-- na conversa ontem e de novo hoje trabalhou hoje.
--
-- `security_invoker` mantido como estava: a view lê três tabelas com RLS, e sem
-- isso ela devolveria para qualquer um o que só a supervisão pode ver.
create or replace view public.trabalho_conversa
with (security_invoker = true) as
  select conversa_id, quem, max(quando) as quando
    from (
      -- Cadastrou a pessoa.
      select c.id as conversa_id, c.cadastrado_por as quem, c.cadastrado_em as quando
        from public.conversas c
       where c.cadastrado_por is not null
      union all
      -- Respondeu — pelo PIE ou pelo celular, que o gatilho credita igual.
      select m.conversa_id, m.enviada_por, m.momento
        from public.mensagens m
       where m.direcao = 'outbound' and m.enviada_por is not null
      union all
      -- Classificou.
      select ct.conversa_id, ct.marcada_por, ct.marcada_em
        from public.conversa_tags ct
       where ct.marcada_por is not null
    ) toques
   group by conversa_id, quem;

comment on view public.trabalho_conversa is
  'Quem trabalhou em qual conversa, e quando foi o último toque. Cadastro, resposta ou etiqueta. Uma linha por pessoa por conversa — conversas_creditadas faz join com ela, e duplicar aqui infla aquele relatório.';

grant select on public.trabalho_conversa to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AS DUAS FUNÇÕES DE MÉTRICA
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.metricas_atendimento(p_dias integer DEFAULT 30, p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text, p_de date DEFAULT NULL::date, p_ate date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with recorte as (
    select c.tipo, c.status_lead, c.demandas
      from public.conversas c,
      -- ── QUANDO ISTO ACONTECEU, DEPENDE DE QUEM PERGUNTA ─────────────────
      --
      -- SEM filtro de atendente, a pergunta é "quantos leads CHEGARAM no
      -- período" — e a data é a da chegada.
      --
      -- COM filtro, a pergunta é outra: "quanto FULANA trabalhou no período".
      -- Usar a data de chegada aí responde "quantos dos que chegaram hoje ela
      -- encostou", que não é o trabalho dela — é a sorte de a fila nova ter
      -- caído no colo dela.
      --
      -- Foi isto que fez a Maiana aparecer com 6 leads "Hoje" tendo 1.153
      -- conversas abertas: ela passou o dia respondendo a fila de ontem, e a
      -- fila de ontem não chegou hoje. E fez a Patricia Barbosa aparecer com
      -- 224, porque os novos caíram com ela. Nenhuma das duas é 37x a outra.
      lateral (
        select case
                 when p_atendente is null
                   then coalesce(c.primeira_msg_at, c.criado_em)
                 -- O ÚLTIMO toque dela. Uma conversa que ela mexeu ontem e de
                 -- novo hoje conta como hoje — o trabalho mais recente é o que
                 -- descreve o dia. Como as janelas maiores são cumulativas,
                 -- isso só muda quem aparece em "Ontem".
                 else (select max(t.quando)
                         from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente)
               end as em
      ) q
     where (public.metricas_desde(p_dias, p_de) is null
            or q.em >= public.metricas_desde(p_dias, p_de))
       and (public.metricas_ateh(p_ate) is null
            or q.em < public.metricas_ateh(p_ate))
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
CREATE OR REPLACE FUNCTION public.metricas_janelas_completo(p_atendente uuid DEFAULT NULL::uuid, p_municipio text DEFAULT NULL::text, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with hoje as (
    select date_trunc('day', now() at time zone 'America/Bahia')
             at time zone 'America/Bahia' as d
  ),
  -- A régua das janelas. `fim` nulo = até agora; só "Ontem" tem fim, porque é
  -- dia FECHADO — sem o fim ele viraria "os últimos dois dias".
  janelas(ordem, id, rotulo, ini, fim) as (
    select 1, '0',     'Hoje',    (select d from hoje),                      null::timestamptz
    union all select 2, 'ontem', 'Ontem',   (select d from hoje) - interval '1 day', (select d from hoje)
    union all select 3, '7',     '7 dias',  now() - interval  '7 day',       null
    union all select 4, '15',    '15 dias', now() - interval '15 day',       null
    union all select 5, '30',    '30 dias', now() - interval '30 day',       null
    union all select 6, '90',    '90 dias', now() - interval '90 day',       null
    union all select 7, 'tudo',  'Tudo',    '-infinity'::timestamptz,        null
  ),
  base as (
    select c.id, c.tipo, c.status_lead, c.demandas,
           -- Mesma regra de `metricas_atendimento`: sem filtro de atendente a
           -- data é a da CHEGADA do lead; com filtro, é a do TRABALHO dela.
           -- Ver o comentário longo lá — o porquê é o mesmo e mora num lugar só.
           case
             when p_atendente is null
               then coalesce(c.primeira_msg_at, c.criado_em)
             else (select max(t.quando)
                     from public.trabalho_conversa t
                    where t.conversa_id = c.id and t.quem = p_atendente)
           end as em
      from public.conversas c
     where (p_atendente is null
            or exists (select 1 from public.trabalho_conversa t
                        where t.conversa_id = c.id and t.quem = p_atendente))
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  ),
  -- O trabalho de classificar tem janela PRÓPRIA: `marcada_em`, quando o
  -- trabalho foi feito, e não quando a pessoa chegou. É outra pergunta, e por
  -- isso vem separado — somá-lo aos eixos faria a barra passar de 100%.
  marcacoes as (
    select ct.conversa_id, ct.marcada_em
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
      join public.conversas c on c.id = ct.conversa_id
     where t.eixo = 'status'
       and (p_atendente is null
            or coalesce(ct.marcada_por, c.atendente_id) = p_atendente)
       and (p_municipio is null or c.municipio = p_municipio)
       and (p_origem    is null or c.origem    = p_origem)
  )
  select coalesce(jsonb_agg(x order by x_ordem), '[]'::jsonb)
    from (
      select j.ordem as x_ordem,
             jsonb_build_object(
               'id',     j.id,
               'rotulo', j.rotulo,
               'leads',    (select count(*) from base b
                             where b.tipo = 'lead' and b.em >= j.ini
                               and (j.fim is null or b.em < j.fim)),
               'disparos', (select count(*) from base b
                             where b.tipo = 'disparo' and b.em >= j.ini
                               and (j.fim is null or b.em < j.fim)),
               'status',   coalesce((
                             select jsonb_object_agg(s.status_lead, s.n)
                               from (select b.status_lead, count(*) as n
                                       from base b
                                      where b.em >= j.ini
                                        and (j.fim is null or b.em < j.fim)
                                        and b.status_lead is not null
                                      group by 1) s
                           ), '{}'::jsonb),
               'demandas', coalesce((
                             select jsonb_object_agg(d.dem, d.n)
                               from (select dd as dem, count(*) as n
                                       from base b, lateral unnest(b.demandas) as dd
                                      where b.em >= j.ini
                                        and (j.fim is null or b.em < j.fim)
                                      group by 1) d
                           ), '{}'::jsonb),
               'classificadas', (select count(distinct m.conversa_id)
                                   from marcacoes m
                                  where m.marcada_em >= j.ini
                                    and (j.fim is null or m.marcada_em < j.fim))
             ) as x
        from janelas j
    ) y;
$function$
;
-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ALTINEIA E BONECA SÃO A MESMA PESSOA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Duas contas, uma pessoa, e o crédito dividido entre elas:
--
--     boneca ............ 1.423 atribuídas, 1.116 respondidas, 712 etiquetas, 898 cadastros
--     altineiasantos78 ...     1 atribuída,      0 respondidas,   0 etiquetas, 124 cadastros
--
-- O crédito é de quem trabalhou, então os 124 cadastros ficavam numa conta e o
-- resto na outra. Nenhuma das duas linhas mostrava o trabalho inteiro dela.
--
-- Decisão do Emanuel (11/09): fica a conta `boneca`.
--
-- NÃO APAGA A CONTA. A de acesso continua existindo, desativada — apagar
-- levaria junto o histórico de quem fez o quê, e histórico de trabalho numa
-- campanha é o que responde reclamação de desempenho depois.
do $$
declare
  v_fica  uuid;
  v_some  uuid;
  v_migradas int;
begin
  select id into v_fica from public.profiles where nome = 'boneca';
  select id into v_some from public.profiles where nome = 'altineiasantos78';

  if v_fica is null or v_some is null then
    raise notice 'Uma das duas contas não existe mais — nada a juntar.';
    return;
  end if;

  -- O trabalho passa para a conta que fica.
  update public.conversas set cadastrado_por = v_fica where cadastrado_por = v_some;
  get diagnostics v_migradas = row_count;
  raise notice 'cadastros migrados: %', v_migradas;

  update public.conversas    set atendente_id = v_fica where atendente_id = v_some;
  update public.mensagens    set enviada_por  = v_fica where enviada_por  = v_some;

  -- `on conflict do nothing` na etiqueta: se as duas contas marcaram a MESMA
  -- etiqueta na MESMA conversa, virar as duas para a mesma pessoa criaria
  -- duplicata na chave. Aí a segunda simplesmente não migra.
  update public.conversa_tags ct set marcada_por = v_fica
   where ct.marcada_por = v_some
     and not exists (select 1 from public.conversa_tags c2
                      where c2.conversa_id = ct.conversa_id
                        and c2.tag_id = ct.tag_id
                        and c2.marcada_por = v_fica);

  -- Some da distribuição e do filtro da métrica.
  delete from public.atendentes where id = v_some;
  -- `role` continua preenchido: a coluna é not null, e o que desliga o acesso
  -- é o status — `perfil_ativo()` exige 'ativo'.
  update public.profiles set status = 'inativo' where id = v_some;

  raise notice 'altineiasantos78 desativada. O acesso dela não entra mais.';
end $$;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- A Maiana tem de sair do 6. Se continuar 6, a data não está sendo usada.
with m as (select id from public.atendentes where nome = 'Maiana'),
     b as (select id from public.atendentes where nome = 'boneca')
select 'Maiana' as quem, x->>'rotulo' as janela, x->>'leads' as leads,
       x->'status'->>'apoiador' as apoiador
  from jsonb_array_elements(public.metricas_janelas_completo((select id from m))) x
 where x->>'rotulo' in ('Hoje','Ontem')
union all
select 'boneca', x->>'rotulo', x->>'leads', x->'status'->>'apoiador'
  from jsonb_array_elements(public.metricas_janelas_completo((select id from b))) x
 where x->>'rotulo' in ('Hoje','Ontem');

-- A conta duplicada tem de sair do filtro (nenhuma linha aqui).
select nome from public.atendentes where nome = 'altineiasantos78';
