-- ============================================================================
-- O QUE CADA ATENDENTE FEZ NO DIA — contado pelo DIA DO TRABALHO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria função de leitura.
--
-- ── O PEDIDO, E O PROBLEMA QUE ELE DESCREVE ─────────────────────────────────
--
-- 21/09, Emanuel: "ontem chegou 3000 leads, as atendentes estão cadastrando
-- hoje, e a métrica puxa as métricas de hoje com base nos leads de hoje, mesmo
-- que ela esteja cadastrando leads de ontem."
--
-- É exato. Toda métrica da plataforma hoje pendura o número no dia em que o
-- LEAD CHEGOU. Medido em 19/09: das 604 marcações de "apoiador" feitas naquele
-- dia, 330 foram em gente que chegou em dias anteriores — Paulo Ribeiro,
-- marcado às 14:10, tinha chegado em 27/08, e foi contar em agosto.
--
-- Mais da METADE do trabalho do dia ia para trás no calendário. A coluna "Hoje"
-- ficava parada enquanto a equipe trabalhava, e não havia como responder
-- "quanto a gente produziu hoje?".
--
-- ── A DIFERENÇA ENTRE AS DUAS PERGUNTAS ─────────────────────────────────────
--
--   "o tráfego de terça trouxe quantos apoiadores?"  → conta pela CHEGADA
--   "quanto a equipe produziu hoje?"                 → conta pelo TRABALHO
--
-- As duas são legítimas e NENHUMA substitui a outra. As métricas existentes
-- respondem a primeira e continuam intactas: esta função é nova e não toca em
-- nada. A tela vai mostrar as duas, lado a lado, com o rótulo dizendo qual é
-- qual — porque o defeito nunca foi o número, foi ninguém saber o que ele conta.
--
-- ── LEAD NÃO É DISPARO (regra 04-dominio-pie) ───────────────────────────────
--
-- "Respondeu" conta só conversa em que a PESSOA escreveu primeiro. Disparo é a
-- campanha falando primeiro para uma lista: mandar disparo não é atendimento, e
-- somar os dois infla o trabalho de quem só apertou enviar numa lista.
--
-- Os dois aparecem, em colunas separadas.

create or replace function public.producao_do_dia(
  p_de  date default null,
  p_ate date default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  with lim as (
    select coalesce(p_de,  (now() at time zone 'America/Bahia')::date) as de,
           coalesce(p_ate, coalesce(p_de, (now() at time zone 'America/Bahia')::date)) as ate
  ),
  -- Tudo abaixo filtra pelo instante em que a AÇÃO aconteceu, convertido para
  -- o fuso da Bahia. É a única diferença em relação ao resto da plataforma, e
  -- é o ponto do arquivo.
  respostas as (
    select m.enviada_por as quem,
           count(*)                                                      as mensagens,
           count(distinct m.conversa_id) filter (where c.tipo is distinct from 'disparo') as pessoas,
           count(distinct m.conversa_id) filter (where c.tipo = 'disparo')                as disparos
      from public.mensagens m
      join public.conversas c on c.id = m.conversa_id
      cross join lim
     where m.direcao = 'outbound'
       and m.enviada_por is not null
       and (m.momento at time zone 'America/Bahia')::date between lim.de and lim.ate
     group by 1
  ),
  cadastros as (
    select l.cadastrado_por as quem, count(*) as cadastrou
      from public.liderancas l cross join lim
     where l.cadastrado_por is not null
       and (l.created_at at time zone 'America/Bahia')::date between lim.de and lim.ate
     group by 1
  ),
  marcacoes as (
    select ct.marcada_por as quem,
           count(distinct ct.conversa_id)                               as classificou,
           count(*) filter (where t.valor = 'apoiador')                 as apoiadores,
           count(*) filter (where t.valor = 'multiplicador')            as multiplicadores
      from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
      cross join lim
     where ct.marcada_por is not null
       and t.eixo in ('status', 'perfil')
       and (ct.marcada_em at time zone 'America/Bahia')::date between lim.de and lim.ate
     group by 1
  ),
  quem as (
    select quem from respostas
    union select quem from cadastros
    union select quem from marcacoes
  )
  select jsonb_build_object(
    'de',  (select de from lim),
    'ate', (select ate from lim),
    'total', jsonb_build_object(
      'pessoas_respondidas', coalesce((select sum(pessoas)         from respostas), 0),
      'mensagens',           coalesce((select sum(mensagens)       from respostas), 0),
      'disparos',            coalesce((select sum(disparos)        from respostas), 0),
      'cadastrou',           coalesce((select sum(cadastrou)       from cadastros), 0),
      'classificou',         coalesce((select sum(classificou)     from marcacoes), 0),
      'apoiadores',          coalesce((select sum(apoiadores)      from marcacoes), 0),
      'multiplicadores',     coalesce((select sum(multiplicadores) from marcacoes), 0)
    ),
    'equipe', coalesce((
      select jsonb_agg(linha order by (linha->>'pessoas_respondidas')::int desc)
        from (
          select jsonb_build_object(
                   'id',                  q.quem,
                   'nome',                coalesce(p.nome, '(conta removida)'),
                   'pessoas_respondidas', coalesce(r.pessoas, 0),
                   'mensagens',           coalesce(r.mensagens, 0),
                   'disparos',            coalesce(r.disparos, 0),
                   'cadastrou',           coalesce(cd.cadastrou, 0),
                   'classificou',         coalesce(mc.classificou, 0),
                   'apoiadores',          coalesce(mc.apoiadores, 0),
                   'multiplicadores',     coalesce(mc.multiplicadores, 0)
                 ) as linha
            from quem q
            left join public.profiles p on p.id = q.quem
            left join respostas  r  on r.quem  = q.quem
            left join cadastros  cd on cd.quem = q.quem
            left join marcacoes  mc on mc.quem = q.quem
        ) z
    ), '[]'::jsonb)
  );
$function$;

comment on function public.producao_do_dia is
  'O que cada atendente FEZ no período, contado pelo dia da ação — não pelo dia em que o lead chegou. Responde "quanto a equipe produziu hoje", que nenhuma métrica respondia: marcar hoje alguém que chegou em agosto conta em agosto em todas as outras. Lead e disparo em colunas separadas (regra 04-dominio-pie).';

revoke all on function public.producao_do_dia(date, date) from public, anon;
grant execute on function public.producao_do_dia(date, date) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
select public.producao_do_dia() as hoje;
