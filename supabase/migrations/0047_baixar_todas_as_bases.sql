-- ============================================================================
-- BAIXAR TODAS AS OUTRAS BASES NUM ARQUIVO SÓ
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria função de leitura.
-- RODAR TAMBÉM NA INSTALAÇÃO DO MANASSÉS — ele pediu nas duas.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 29/09, Emanuel: "na base de manassés e na nossa base, tem que ter a opção de
-- baixar todas as bases completas."
--
-- Hoje cada gaveta baixa sozinha. Com cinco bases isso é cinco arquivos para
-- juntar na mão — e juntar na mão é onde a mesma pessoa entra duas vezes.
--
-- ── UMA PESSOA, UMA LINHA ───────────────────────────────────────────────────
--
-- Este é o ponto todo. Concatenar as bases devolveria 49.982 linhas com gente
-- repetida: medido em 28/09, a "Agenda dos aparelhos" tem 3.237 pessoas que
-- também estão no Mandato 2023, e a base "Apoiadores" inteira já está nas
-- conversas.
--
-- Então a exportação junta por TELEFONE CANÔNICO e traz uma coluna dizendo em
-- quais bases a pessoa está. Quem quiser a lista de uma base específica já tem
-- o botão dela; este arquivo existe para a pergunta oposta — "me dá todo mundo,
-- sem repetir".
--
-- É a mesma regra que a somatória da tela já usa desde a 0042: contar pessoa
-- distinta, nunca somar gaveta com gaveta.
--
-- ── NOME E CIDADE: O MELHOR DE CADA UM ──────────────────────────────────────
--
-- A mesma pessoa pode estar numa base com nome e sem cidade, e noutra com
-- cidade e sem nome. Juntar pegando "a primeira que aparecer" jogaria fora
-- metade do que se sabe dela.
--
-- Então cada campo é escolhido pelo melhor disponível: nome não nulo ganha de
-- nulo, e cidade RECONHECIDA da Bahia ganha de cidade a corrigir, que ganha de
-- vazio. É a mesma ordem de preferência que `base_externa_gravar` usa quando
-- duas linhas do mesmo arquivo batem.

create or replace function public.bases_externas_exportar_tudo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  select case when not public.perfil_equipe() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'telefone',  fone,
             'nome',      nome,
             'municipio', municipio,
             'bairro',    bairro,
             'local',     local,
             'bases',     bases
           ) order by (local = 'bahia') desc, municipio nulls last, nome nulls last)
      from (
        select public.fone_canonico(p.telefone) as fone,
               -- `min` sobre texto não-nulo: o Postgres ignora nulos em
               -- agregação, então isto é "o primeiro nome que existir" sem
               -- precisar de filtro.
               min(p.nome) filter (where p.nome is not null)                as nome,
               min(coalesce(p.municipio_oficial, p.municipio))
                 filter (where p.local = 'bahia')                            as mun_bahia,
               min(p.municipio) filter (where p.municipio is not null)       as mun_qualquer,
               min(p.bairro)    filter (where p.bairro is not null)          as bairro,
               -- Se a pessoa está na Bahia em QUALQUER base, ela é da Bahia:
               -- a base que não sabia a cidade não desmente a que sabia.
               case when bool_or(p.local = 'bahia') then 'bahia'
                    when bool_or(p.local = 'outro_estado') then 'outro_estado'
                    when bool_or(p.local = 'a_corrigir') then 'a_corrigir'
                    else 'vazio' end                                         as local,
               string_agg(distinct b.nome, ' + ' order by b.nome)            as bases
          from bases_externas_pessoas p
          join bases_externas b on b.id = p.base_id
         where p.telefone is not null
           and public.fone_canonico(p.telefone) <> ''
         group by 1
      ) z,
      lateral (select coalesce(z.mun_bahia, z.mun_qualquer) as municipio) m
  ), '[]'::jsonb) end
$function$;

comment on function public.bases_externas_exportar_tudo is
  'Todas as outras bases num arquivo só, UMA LINHA POR PESSOA. Junta por telefone canônico e traz a coluna `bases` dizendo de onde cada um veio. Concatenar as gavetas repetiria gente: a Agenda dos aparelhos tem 3.237 pessoas que também estão no Mandato 2023. Nome e cidade são o melhor disponível entre as bases, não o primeiro encontrado.';

revoke all on function public.bases_externas_exportar_tudo() from public, anon;
grant execute on function public.bases_externas_exportar_tudo() to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Sem login `perfil_equipe()` é falso e a função devolve nulo — a prova de que
-- ela não fala com quem não é da equipe.
select public.bases_externas_exportar_tudo() as sem_login_devolve_nulo;
