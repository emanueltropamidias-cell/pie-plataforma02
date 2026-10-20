-- ============================================================================
-- O QR PASSA A CONTAR PESSOAS, E NÃO ABERTURAS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O PROBLEMA COM "57 LEITURAS" ────────────────────────────────────────────
--
-- A tabela guardava só a hora. Então "57" é o número de vezes que o endereço
-- foi ABERTO — e isso não é o mesmo que 57 pessoas:
--
--   o robô de prévia do WhatsApp abre o link quando alguém o compartilha
--   a pessoa toca duas vezes porque achou que não pegou
--   a mesma pessoa escaneia de novo no dia seguinte
--
-- Há dez casos de duas aberturas no MESMO MINUTO nos dados de hoje. Num número
-- pequeno como 57, isso é a diferença entre um material que funcionou e um que
-- pareceu funcionar — e é esse número que vai para a reunião com o parceiro.
--
-- ── A IMPRESSÃO, E POR QUE ELA NÃO GUARDA IP ────────────────────────────────
--
-- `impressao` é um HASH de endereço de rede + navegador. Serve para dizer "esta
-- abertura veio do mesmo lugar que aquela", e não para saber de quem é.
--
-- O IP cru NÃO é gravado de propósito: para contar gente repetida basta saber
-- que duas aberturas batem, e guardar o endereço de quem escaneia um santinho
-- é dado que a campanha não precisa ter — e que, tendo, passa a precisar
-- proteger.
--
-- Ainda é aproximação: quem escaneia no wifi de casa e depois no 4G aparece
-- duas vezes; duas pessoas na mesma rede aparecem como uma. Para material
-- impresso, erra menos que contar abertura.

alter table public.link_leituras
  add column if not exists impressao text,
  -- Robô não é gente. O WhatsApp, o Facebook e o Telegram abrem o link para
  -- montar a prévia quando alguém compartilha — três aberturas antes de
  -- qualquer humano ver.
  add column if not exists robo boolean not null default false;

comment on column public.link_leituras.impressao is
  'Hash de rede + navegador, para separar pessoa repetida de pessoa nova. NÃO guarda IP: só serve para comparar duas aberturas entre si.';
comment on column public.link_leituras.robo is
  'Verdadeiro quando a abertura foi de um robô de prévia de link. Não conta como pessoa.';

create index if not exists link_leituras_por_impressao
  on public.link_leituras (link_id, impressao)
  where impressao is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- O PLACAR DO QR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Devolve os dois números, e não um só: "aberturas" é o que já existia e serve
-- para comparar com o histórico; "pessoas" é o que responde a pergunta.
--
-- Leitura antiga não tem impressão e por isso não dá para agrupar. Ela conta
-- como uma pessoa cada — é o mais honesto possível sem inventar: a alternativa
-- seria descartá-la, e aí o material perderia o passado que já tem.
create or replace function public.placar_qr()
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
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
               'ultima',    c.ultima
             )
             order by c.pessoas desc, l.nome
           ),
           '[]'::jsonb
         )
    from public.links l
    join lateral (
      select count(*) filter (where not x.robo)                as aberturas,
             count(*) filter (where x.robo)                    as robos,
             -- Cada impressão distinta é uma pessoa; o que não tem impressão
             -- (leitura antiga) conta um a um.
             count(distinct x.impressao) filter (where not x.robo and x.impressao is not null)
               + count(*) filter (where not x.robo and x.impressao is null)
                                                               as pessoas,
             -- Hoje também por PESSOA. Uma pessoa que escaneia três vezes no
             -- mesmo dia é uma pessoa, e o cartão dizia três.
             count(distinct coalesce(x.impressao, x.id::text)) filter (
               where not x.robo
                 and x.em >= date_trunc('day', now() at time zone 'America/Bahia')
                       at time zone 'America/Bahia')           as hoje,
             min(x.em) as primeira,
             max(x.em) as ultima
        from public.link_leituras x
       where x.link_id = l.id
    ) c on true;
$$;

comment on function public.placar_qr is
  'Por material: aberturas, PESSOAS (impressões distintas) e quantos robôs de prévia. Aberturas não é gente.';

-- ── conferência ─────────────────────────────────────────────────────────────
select j ->> 'nome' as material,
       j ->> 'aberturas' as aberturas,
       j ->> 'pessoas'   as pessoas,
       j ->> 'robos'     as robos
  from jsonb_array_elements(public.placar_qr()) j;
