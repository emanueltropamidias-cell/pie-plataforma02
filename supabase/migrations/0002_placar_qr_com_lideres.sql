-- ============================================================================
-- O PLACAR DO QR PASSA A CONTAR TAMBÉM POR LIDERANÇA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE MEXER NELE ──────────────────────────────────────────────────────
--
-- O `placar_qr()` existia, estava certo, e A TELA NÃO USAVA. Ela buscava as
-- leituras cruas e refazia a conta em TypeScript — o mesmo fato escrito em dois
-- lugares, que sempre desencontra. E desencontrou:
--
-- A tela calculava "hoje" com o fuso DO SERVIDOR. A Vercel roda em UTC, e às
-- 21h da Bahia o UTC já virou o dia. Resultado medido às 23h22:
--
--     hoje de verdade (00h da Bahia)      50 leituras
--     o que a tela chamava de hoje        10 leituras
--
-- Quarenta leituras somem do cartão todo dia depois das 21h. Não dá erro, não
-- pisca nada: o número só fica menor.
--
-- Faltava ao placar uma coisa para a tela poder abandonar a conta própria: o
-- número por LIDERANÇA, que é o que responde "quem espalhou".
--
-- ── E O TETO QUE VINHA JUNTO ────────────────────────────────────────────────
--
-- A tela trazia TODAS as linhas de `link_leituras` para a memória para contar.
-- Hoje são 102 e cabe; no dia em que forem dez mil, o PostgREST corta na página
-- e a conta passa a mentir sem avisar. Contagem é trabalho de banco.

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
               'ultima',    c.ultima,
               -- Quem espalhou. Sem isto a dobradinha inteira vira um número só
               -- e ninguém sabe onde a campanha deve pôr esforço.
               'lideres',   coalesce(c.lideres, '{}'::jsonb)
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
                       group by y.lider_id) t)                 as lideres
        from public.link_leituras x
       where x.link_id = l.id
    ) c on true;
$$;

comment on function public.placar_qr is
  'Por material: aberturas, PESSOAS (impressões distintas), robôs de prévia, o de hoje NO FUSO DA BAHIA e a conta por liderança. Aberturas não é gente.';

-- ── conferência ─────────────────────────────────────────────────────────────
select j ->> 'nome'  as material,
       j ->> 'aberturas' as aberturas,
       j ->> 'pessoas'   as pessoas,
       j ->> 'robos'     as robos,
       j ->> 'hoje'      as hoje_bahia
  from jsonb_array_elements(public.placar_qr()) j;
