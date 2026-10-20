-- ============================================================================
-- A SUPERVISÃO PARA DE ESCONDER CONVERSA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga dado nenhum.
--
-- ── O SINTOMA ───────────────────────────────────────────────────────────────
--
-- "Não quero que as conversas antigas sumam da supervisão."
--
-- Elas somem. Medido hoje:
--
--     janela "Hoje" ....... 2.317 conversas com mensagem, a tela mostra 500
--     janela "7 dias" ..... 7.219                          a tela mostra 500
--     janela "Tudo" ....... 9.769                          a tela mostra 500
--
-- E somem as ANTIGAS especificamente, porque a lista é ordenada por
-- `ultima_msg_at desc` e cortada em 500: quem falou há mais tempo cai fora
-- primeiro. Não é um bug de janela — é o teto da consulta virando a tela.
--
-- ── POR QUE ISSO É PIOR DO QUE PARECE ───────────────────────────────────────
--
-- A supervisão existe para achar o que ficou para trás. Cortar justamente as
-- mais antigas esconde exatamente o que ela foi feita para mostrar — e esconde
-- em silêncio, porque 500 linhas cheias parecem uma lista inteira.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- Duas coisas, e as duas são necessárias:
--
--   1. A lista ganha PÁGINA. Dá para continuar de onde parou, então nada fica
--      inalcançável.
--   2. Existe um TOTAL de verdade, contado no banco. Sem ele a tela não tem
--      como dizer "500 de 2.317", e sem essa frase quem olha continua achando
--      que viu tudo.
--
-- Carregar as 9.769 de uma vez não é a resposta: a tela tem Realtime ligado e
-- cada linha vira um objeto vivo no navegador. Página é o que funciona com a
-- base crescendo mil por dia.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A LISTA GANHA PÁGINA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O `drop` antes do `create` NÃO é descuido: acrescentar um parâmetro com valor
-- padrão criaria uma SEGUNDA função com o mesmo nome, e a chamada de três
-- argumentos passaria a ser ambígua — o Postgres recusa sem saber qual das duas
-- é. Isso já aconteceu nesta base, com `metricas`.
--
-- Vai tudo na mesma transação, então não existe instante em que a função não
-- exista para quem estiver com a tela aberta.
drop function if exists public.supervisao_lista(timestamptz, timestamptz, integer);

create or replace function public.supervisao_lista(
  p_de     timestamptz default null,
  p_ate    timestamptz default null,
  p_limite integer     default 500,
  p_pulo   integer     default 0
) returns setof public.conversas
language sql
stable
set search_path = public, pg_temp
as $function$
  select c.*
    from public.conversas c
   where (p_de is null
          -- "TEVE MENSAGEM NO PERÍODO", e não "a última mensagem foi no
          -- período". A diferença é o trabalho que deu certo: a menina responde
          -- ontem às 18h, a pessoa responde de volta hoje às 9h, e a conversa
          -- sumia da janela "Ontem" justamente porque funcionou.
          or exists (select 1 from public.mensagens m
                      where m.conversa_id = c.id
                        and m.momento >= p_de
                        and (p_ate is null or m.momento < p_ate)))
   order by c.ultima_msg_at desc nulls last, c.id desc
   limit  greatest(p_limite, 1)
  offset greatest(coalesce(p_pulo, 0), 0);
$function$;

comment on function public.supervisao_lista is
  'As conversas da supervisão, por página. Ordem estável (ultima_msg_at, id): sem o id no desempate, duas conversas do mesmo segundo podem trocar de lugar entre páginas e uma some enquanto a outra aparece duas vezes.';

revoke all on function public.supervisao_lista(timestamptz, timestamptz, integer, integer) from public, anon;
grant execute on function public.supervisao_lista(timestamptz, timestamptz, integer, integer) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O TOTAL DE VERDADE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Contado no banco, com o MESMO filtro da lista. Contar na tela em cima do que
-- foi carregado é como o número errado nasce: o teto da consulta vira a
-- métrica, e ninguém percebe porque o número é plausível.
create or replace function public.supervisao_total(
  p_de  timestamptz default null,
  p_ate timestamptz default null
) returns bigint
language sql
stable
set search_path = public, pg_temp
as $function$
  select count(*)
    from public.conversas c
   where (p_de is null
          or exists (select 1 from public.mensagens m
                      where m.conversa_id = c.id
                        and m.momento >= p_de
                        and (p_ate is null or m.momento < p_ate)));
$function$;

comment on function public.supervisao_total is
  'Quantas conversas a janela tem DE VERDADE. Existe para a tela poder dizer "500 de 2.317" — sem isso, 500 linhas cheias parecem a lista inteira.';

revoke all on function public.supervisao_total(timestamptz, timestamptz) from public, anon;
grant execute on function public.supervisao_total(timestamptz, timestamptz) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- A página 2 tem de trazer conversas DIFERENTES da página 1. Se a interseção
-- não for zero, a ordem não é estável e alguma conversa está sendo pulada.
with p1 as (select id from public.supervisao_lista(null, null, 500, 0)),
     p2 as (select id from public.supervisao_lista(null, null, 500, 500))
select (select count(*) from p1)                          as pagina_1,
       (select count(*) from p2)                          as pagina_2,
       (select count(*) from p1 join p2 using (id))       as repetidas_entre_elas,
       public.supervisao_total(null, null)                as total_de_verdade;
