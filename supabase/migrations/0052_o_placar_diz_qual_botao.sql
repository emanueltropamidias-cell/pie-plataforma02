-- ============================================================================
-- O PLACAR PASSA A DIZER POR QUAL BOTÃO A PESSOA ENTROU
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca uma função de leitura.
--
-- ── POR QUE ─────────────────────────────────────────────────────────────────
--
-- A 0051 fez o botão do grupo ser contado, e `placar_qr` já devolve o total.
-- Mas a página /1022 tem DOIS caminhos para o mesmo grupo:
--
--   `botao` — o bloco amarelo no meio da página
--   `barra` — a barra fixa que acende e pulsa depois do voto na urna
--
-- Somados, eles respondem "quanta gente entrou" e não respondem a pergunta que
-- muda alguma coisa: a barra pulsante GANHA o lugar que ocupa? Ela cobre o pé
-- da tela o tempo todo depois do voto. Se quase ninguém toca nela, ela está
-- atrapalhando a leitura em troca de nada — e isso só se descobre separando.
--
-- ── ESTA DEFINIÇÃO SAIU DO BANCO VIVO ───────────────────────────────────────
--
-- Lida com `pg_get_functiondef`, com UM campo acrescentado. `placar_qr` é o
-- que desenha a tela de Links inteira, inclusive os QR das dobradinhas que
-- estão circulando impressos; reescrevê-la de cabeça seria arriscar o número
-- do material do parceiro para acrescentar uma linha.
--
-- ── `origens` NÃO SE MISTURA COM `lideres` ──────────────────────────────────
--
-- Nos QR de dobradinha, `referencia` guarda o código da liderança que espalhou
-- — o MESMO campo que a /1022 usa para o nome do botão. O que separa os dois é
-- `lider_id`: quem veio de liderança o tem preenchido.
--
-- Por isso `origens` filtra `lider_id is null`. Sem esse filtro, o cartão de
-- uma dobradinha passaria a listar cada código de liderança como se fosse um
-- botão de site, ao lado da lista de lideranças que ele já mostra — o mesmo
-- fato, contado duas vezes, em dois formatos, no mesmo cartão.

CREATE OR REPLACE FUNCTION public.placar_qr()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'link_id',   l.id,
               'slug',      l.slug,
               'nome',      l.nome,
               'aberturas', c.aberturas,
               'pessoas',   c.pessoas,
               'robos',     c.robos,
               'hoje',      c.hoje,
               'primeira',  c.primeira,
               'ultima',    c.ultima,
               -- Quem espalhou. Sem isto a dobradinha inteira vira um número só
               -- e ninguém sabe onde a campanha deve pôr esforço.
               'lideres',   coalesce(c.lideres, '{}'::jsonb),
               -- Por onde entrou, quando não veio de liderança. Hoje só a
               -- /1022 preenche: 'botao' e 'barra'.
               'origens',   coalesce(c.origens, '{}'::jsonb)
             )
             order by c.pessoas desc, l.nome
           ),
           '[]'::jsonb
         )
    from public.links l
    join lateral (
      select count(*) filter (where not x.robo)                as aberturas,
             count(*) filter (where x.robo)                    as robos,
             count(distinct x.impressao) filter (where not x.robo and x.impressao is not null)
               + count(*) filter (where not x.robo and x.impressao is null)
                                                               as pessoas,
             -- HOJE no fuso da BAHIA, e não no do servidor. É onde a tela
             -- errava: em UTC o dia vira às 21h daqui, e as leituras da noite
             -- caíam para fora da conta.
             count(distinct coalesce(x.impressao, x.id::text)) filter (
               where not x.robo
                 and x.em >= date_trunc('day', now() at time zone 'America/Bahia')
                       at time zone 'America/Bahia')           as hoje,
             min(x.em) as primeira,
             max(x.em) as ultima,
             (select jsonb_object_agg(t.lider_id::text, t.n)
                from (select y.lider_id, count(distinct coalesce(y.impressao, y.id::text)) n
                        from public.link_leituras y
                       where y.link_id = l.id and y.lider_id is not null and not y.robo
                       group by y.lider_id) t)                 as lideres,
             -- PESSOAS, e não toques, pelo mesmo motivo de `pessoas` acima: a
             -- barra fica na tela depois do voto, e voltar do WhatsApp com ela
             -- pulsando na cara convida ao segundo toque.
             (select jsonb_object_agg(t.referencia, t.n)
                from (select y.referencia, count(distinct coalesce(y.impressao, y.id::text)) n
                        from public.link_leituras y
                       where y.link_id = l.id and y.lider_id is null
                         and y.referencia is not null and not y.robo
                       group by y.referencia) t)               as origens
        from public.link_leituras x
       where x.link_id = l.id
    ) c on true;
$function$;

comment on function public.placar_qr is
  'O placar de cada link: pessoas distintas, aberturas, robôs e "hoje" no fuso da Bahia. `lideres` quebra por quem espalhou o QR (por lider_id); `origens` quebra por onde a pessoa tocou quando NÃO veio de liderança (os botões da /1022). Os dois leem campos diferentes de propósito — `referencia` guarda o código da liderança nos QR e o nome do botão no site.';

-- ── conferência ─────────────────────────────────────────────────────────────
-- O grupo tem de trazer `origens`; as dobradinhas têm de trazer `origens`
-- VAZIO e os `lideres` intactos. Se uma dobradinha listar origens, o filtro do
-- lider_id falhou e o cartão dela vai contar a mesma coisa duas vezes.
select r->>'slug' as link,
       r->>'pessoas' as pessoas,
       r->'origens' as origens,
       r->'lideres' as lideres
  from jsonb_array_elements(public.placar_qr()) r;
