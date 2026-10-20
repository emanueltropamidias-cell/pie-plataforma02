-- ============================================================================
-- A PRODUÇÃO DA EQUIPE PASSA A SEGUIR A JANELA ESCOLHIDA NO TOPO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria função de leitura.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 25/09, Emanuel: "Aqui poderia ser tudo junto, sabe? Quando eu marcar lá em
-- cima a janela de atribuição hoje, já puxava todas essas métricas."
--
-- Hoje o bloco "Produção da equipe" é sempre HOJE — `producao_do_dia()` é
-- chamada sem argumento. Clicar em "Ontem" ou "7 dias" no topo muda os quatro
-- cartões e deixa a produção parada, mostrando o dia de hoje com o filtro
-- dizendo outra coisa. Duas janelas diferentes na mesma tela, sem aviso.
--
-- ── POR QUE SETE JANELAS DE UMA VEZ, E NÃO UMA CHAMADA POR CLIQUE ───────────
--
-- Trocar de período nesta tela NÃO vai ao servidor: os sete recortes já vêm na
-- primeira carga (ver `metricas_janelas_completo`) e o clique vira troca de
-- índice num array. Foi o que tirou a tela de onze idas de rede por
-- carregamento.
--
-- Fazer a produção ir ao servidor a cada clique desfaria isso. Então ela segue
-- a mesma regra: tudo numa carga.
--
-- Medido antes de escrever, janela por janela com `producao_do_dia`:
--
--   hoje 222ms · ontem 187ms · 7d 384ms · 15d 519ms · 30d 598ms · 90d 739ms
--
-- Sete chamadas seriam ~3,2 s — três quartos do teto de 8 s da sessão
-- `authenticated`, e numa tela que já carrega outras seis consultas. Aqui é
-- UMA varredura de cada tabela, com as janelas aplicadas como filtro.
--
-- ── COMO A VARREDURA ÚNICA FUNCIONA ─────────────────────────────────────────
--
-- As janelas se sobrepõem de propósito: 7, 15, 30 e 90 dias são aninhadas e
-- terminam hoje; "ontem" é um dia fechado no meio delas. Então um mesmo evento
-- pertence a VÁRIAS janelas.
--
-- Em vez de varrer uma vez por janela, cada evento é cruzado com a tabela de
-- janelas (sete linhas) e agrupado por (janela, pessoa). Lê-se a tabela uma
-- vez; a multiplicação acontece em memória, sobre linhas já filtradas.
--
-- ── O QUE NÃO MUDA ──────────────────────────────────────────────────────────
--
-- As definições são as mesmas de `producao_do_dia` (0040), e de propósito:
--
--   · conta pelo dia da AÇÃO, não pelo dia em que o lead chegou
--   · lead e disparo em colunas separadas (regra 04-dominio-pie)
--   · `respondeu` é conversa distinta com mensagem nossa, não mensagem
--
-- `producao_do_dia` continua existindo e não é tocada: ela responde "um
-- intervalo qualquer" e é o que o "Escolher dia" usa.

create or replace function public.producao_janelas()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with lim as (
    select (now() at time zone 'America/Bahia')::date as hoje
  ),
  -- As mesmas sete do filtro do topo, na mesma ordem e com os mesmos ids.
  -- `tudo` usa um recuo absurdo de propósito: a base começa em 26/08, e
  -- inventar uma data de início aqui seria mais uma constante para
  -- desencontrar.
  jan(id, rotulo, de, ate) as (
    values ('0','Hoje',0,0),
           ('ontem','Ontem',1,1),
           ('7','7 dias',6,0),
           ('15','15 dias',14,0),
           ('30','30 dias',29,0),
           ('90','90 dias',89,0),
           ('tudo','Tudo',100000,0)
  ),
  -- ── OS EVENTOS, REDUZIDOS ANTES DE CRUZAR ────────────────────────────────
  --
  -- A primeira versão cruzava as mensagens cruas com as sete janelas: 52 mil
  -- linhas viravam 364 mil, e o `count(distinct conversa_id)` sobre isso
  -- custava 2,4 s — mais que todas as outras consultas da tela somadas.
  --
  -- A correção é separar o que é ADITIVO do que precisa de DISTINTO:
  --
  --   mensagens, apoiadores, multiplicadores  →  `count(*)`, e soma de somas
  --                                              dá o mesmo resultado
  --   pessoas respondidas, classificou        →  `count(distinct conversa_id)`,
  --                                              e aí somar somas ERRA: quem
  --                                              respondeu a mesma pessoa em
  --                                              dois dias contaria duas vezes
  --
  -- O aditivo é agrupado por (pessoa, dia) ANTES de cruzar — vira um punhado
  -- de linhas. O distinto cruza, mas já sem repetição de mensagem: (pessoa,
  -- conversa, dia) distintos, que é uma fração das mensagens.
  msg_dia as (
    select m.enviada_por as quem,
           (m.momento at time zone 'America/Bahia')::date as dia,
           count(*) as mensagens
      from public.mensagens m
     where m.direcao = 'outbound' and m.enviada_por is not null
     group by 1, 2
  ),
  -- ── O TRUQUE QUE TIRA O count(distinct) DA CONTA ──────────────────────────
  --
  -- Contar conversa distinta por janela custava 1.180 ms: 31 mil pares
  -- (pessoa, conversa, dia) cruzados com sete janelas, e um `count(distinct)`
  -- sobre cada grupo.
  --
  -- Mas cinco das sete janelas são ANINHADAS e terminam hoje (7, 15, 30, 90,
  -- tudo). Para elas vale uma equivalência exata:
  --
  --   a conversa entra na janela dos últimos N dias
  --     ⟺ o ÚLTIMO dia em que foi trabalhada é >= hoje - N
  --
  -- Então basta reduzir cada (pessoa, conversa) ao seu último dia UMA vez, e
  -- depois comparar — `count(*)` sobre booleano, sem distinto e sem repetir
  -- linha por janela.
  --
  -- "Ontem" é dia fechado e não segue essa regra: conversa trabalhada ontem E
  -- hoje tem último dia = hoje, e ainda assim foi trabalhada ontem. Ela sai do
  -- mesmo agrupamento, num `bool_or` — de graça, na mesma passada.
  --
  -- "Hoje" é o caso N=0 da regra aninhada, e cai junto.
  msg_conversa as (
    select m.enviada_por as quem,
           m.conversa_id,
           (c.tipo = 'disparo') as e_disparo,
           max((m.momento at time zone 'America/Bahia')::date) as ultimo,
           bool_or((m.momento at time zone 'America/Bahia')::date
                   = (select hoje - 1 from lim)) as foi_ontem
      from public.mensagens m
      join public.conversas c on c.id = m.conversa_id
     where m.direcao = 'outbound' and m.enviada_por is not null
     group by 1, 2, 3
  ),
  cad as (
    select l.cadastrado_por as quem,
           (l.created_at at time zone 'America/Bahia')::date as dia,
           count(*) as cadastrou
      from public.liderancas l
     where l.cadastrado_por is not null
     group by 1, 2
  ),
  tag_dia as (
    select ct.marcada_por as quem,
           (ct.marcada_em at time zone 'America/Bahia')::date as dia,
           count(*) filter (where t.valor = 'apoiador')      as apoiadores,
           count(*) filter (where t.valor = 'multiplicador') as multiplicadores
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
     where ct.marcada_por is not null and t.eixo in ('status','perfil')
     group by 1, 2
  ),
  tag_conversa as (
    select ct.marcada_por as quem,
           ct.conversa_id,
           max((ct.marcada_em at time zone 'America/Bahia')::date) as ultimo,
           bool_or((ct.marcada_em at time zone 'America/Bahia')::date
                   = (select hoje - 1 from lim)) as foi_ontem
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
     where ct.marcada_por is not null and t.eixo in ('status','perfil')
     group by 1, 2
  ),
  -- ── CRUZAMENTO COM AS JANELAS ─────────────────────────────────────────────
  -- `dentro` é a regra acima escrita uma vez: dia fechado para "ontem",
  -- comparação com o último dia para todo o resto.
  respostas as (
    select j.id as janela, x.quem,
           count(*) filter (where not x.e_disparo) as pessoas,
           count(*) filter (where x.e_disparo)     as disparos
      from msg_conversa x, lim, jan j
     where case when j.id = 'ontem' then x.foi_ontem
                else x.ultimo >= (lim.hoje - j.de) end
     group by 1, 2
  ),
  mensagens_n as (
    select j.id as janela, x.quem, sum(x.mensagens) as mensagens
      from (select m.enviada_por as quem,
                   (m.momento at time zone 'America/Bahia')::date as dia,
                   count(*) as mensagens
              from public.mensagens m
             where m.direcao = 'outbound' and m.enviada_por is not null
             group by 1, 2) x, lim, jan j
     where x.dia between (lim.hoje - j.de) and (lim.hoje - j.ate)
     group by 1, 2
  ),
  cadastros as (
    select j.id as janela, c.quem, sum(c.cadastrou) as cadastrou
      from cad c, lim, jan j
     where c.dia between (lim.hoje - j.de) and (lim.hoje - j.ate)
     group by 1, 2
  ),
  marcacoes as (
    select j.id as janela, x.quem,
           sum(x.apoiadores)      as apoiadores,
           sum(x.multiplicadores) as multiplicadores
      from tag_dia x, lim, jan j
     where x.dia between (lim.hoje - j.de) and (lim.hoje - j.ate)
     group by 1, 2
  ),
  classificou as (
    select j.id as janela, x.quem, count(*) as classificou
      from tag_conversa x, lim, jan j
     where case when j.id = 'ontem' then x.foi_ontem
                else x.ultimo >= (lim.hoje - j.de) end
     group by 1, 2
  ),
  quem as (
    select janela, quem from respostas
    union select janela, quem from cadastros
    union select janela, quem from marcacoes
  ),
  linhas as (
    select q.janela,
           jsonb_build_object(
             'id',                  q.quem,
             'nome',                coalesce(p.nome, '(conta removida)'),
             'pessoas_respondidas', coalesce(r.pessoas, 0),
             'mensagens',           coalesce(mn.mensagens, 0),
             'disparos',            coalesce(r.disparos, 0),
             'cadastrou',           coalesce(cd.cadastrou, 0),
             'classificou',         coalesce(cl.classificou, 0),
             'apoiadores',          coalesce(mc.apoiadores, 0),
             'multiplicadores',     coalesce(mc.multiplicadores, 0)
           ) as linha,
           coalesce(r.pessoas, 0)         as ordem,
           coalesce(r.pessoas, 0)         as p_pessoas,
           coalesce(mn.mensagens, 0)      as p_mensagens,
           coalesce(r.disparos, 0)        as p_disparos,
           coalesce(cd.cadastrou, 0)      as p_cadastrou,
           coalesce(cl.classificou, 0)    as p_classificou,
           coalesce(mc.apoiadores, 0)     as p_apoiadores,
           coalesce(mc.multiplicadores,0) as p_multipl
      from quem q
      left join public.profiles p on p.id = q.quem
      left join respostas  r  on r.janela  = q.janela and r.quem  = q.quem
      left join cadastros  cd on cd.janela = q.janela and cd.quem = q.quem
      left join marcacoes  mc on mc.janela = q.janela and mc.quem = q.quem
      left join mensagens_n mn on mn.janela = q.janela and mn.quem = q.quem
      left join classificou cl on cl.janela = q.janela and cl.quem = q.quem
  )
  select coalesce(jsonb_object_agg(x.id, x.corpo), '{}'::jsonb)
    from (
      select j.id,
             jsonb_build_object(
               'id',     j.id,
               'rotulo', j.rotulo,
               'de',     (select (lim.hoje - j.de)::text from lim),
               'ate',    (select (lim.hoje - j.ate)::text from lim),
               'total', jsonb_build_object(
                 'pessoas_respondidas', coalesce(sum(l.p_pessoas), 0),
                 'mensagens',           coalesce(sum(l.p_mensagens), 0),
                 'disparos',            coalesce(sum(l.p_disparos), 0),
                 'cadastrou',           coalesce(sum(l.p_cadastrou), 0),
                 'classificou',         coalesce(sum(l.p_classificou), 0),
                 'apoiadores',          coalesce(sum(l.p_apoiadores), 0),
                 'multiplicadores',     coalesce(sum(l.p_multipl), 0)
               ),
               'equipe', coalesce(
                 jsonb_agg(l.linha order by l.ordem desc)
                   filter (where l.linha is not null),
                 '[]'::jsonb)
             ) as corpo
        from jan j
        left join linhas l on l.janela = j.id
       group by j.id, j.rotulo, j.de, j.ate
    ) x;
$function$;

comment on function public.producao_janelas is
  'As sete janelas do filtro de Métricas, cada uma com o trabalho da equipe contado pelo DIA DA AÇÃO. Uma varredura de cada tabela em vez de sete chamadas a producao_do_dia (que somariam ~3,2s contra o teto de 8s). Permite ao bloco "Produção da equipe" seguir o período escolhido no topo sem ir ao servidor a cada clique.';

revoke all on function public.producao_janelas() from public, anon;
grant execute on function public.producao_janelas() to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Os números de "Hoje" têm de bater com producao_do_dia() — se não baterem, uma
-- das duas está errada e é melhor descobrir aqui do que na tela.
select
  (public.producao_janelas() -> '0'  -> 'total') as janela_hoje,
  (public.producao_do_dia()          -> 'total') as producao_do_dia_hoje,
  ((public.producao_janelas() -> '0' -> 'total') = (public.producao_do_dia() -> 'total'))
    as batem;
