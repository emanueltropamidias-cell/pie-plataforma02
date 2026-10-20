-- ============================================================================
-- BAIXAR A BASE INTEIRA, OU SÓ OS DA BAHIA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só troca uma função de leitura.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 29/09, Emanuel, corrigindo a importação de agenda que eu tinha acabado de
-- entregar: "esses contatos de outros estados você não vai separar eles da
-- base, você vai deixar eles junto com a base, mas vai deixar a descrição —
-- 4 mil da Bahia, mil de fora. Aí você deixa duas opções: baixar base
-- completa, baixar base só Bahia."
--
-- Ele está certo, e o motivo aparece quando se pensa em vinte agendas: quarenta
-- gavetas, metade delas com trinta pessoas. A agenda de alguém é UMA coisa;
-- quebrá-la em duas inventa uma divisão que não existe no celular de ninguém.
--
-- A separação vira escolha na hora de BAIXAR, que é onde ela importa de fato.
--
-- ── POR QUE POR DDD, E NÃO PELO `local` QUE JÁ EXISTE ───────────────────────
--
-- Os tipos de exportação que já existiam (`completos`, `outro_estado`) olham o
-- MUNICÍPIO. Isso funciona para base de planilha, que traz cidade.
--
-- Agenda de celular não traz cidade nenhuma — o vCard guarda nome e telefone.
-- Todo mundo cai em `local = 'vazio'`, e `completos` devolveria zero numa base
-- de 5 mil pessoas. Foi exatamente o que aconteceu no cartão da "Agenda Pedro"
-- em 28/09: "0 completos na Bahia · 704 sem município", e ele perguntou duas
-- vezes se estava quebrado.
--
-- O DDD é o que essa base tem. Não é prova de residência — a pessoa muda de
-- estado e leva o número — e por isso ele vive em tipo PRÓPRIO, separado de
-- `completos`. Um é cidade declarada; o outro é o prefixo do telefone.

create or replace function public.base_externa_exportar(p_base uuid, p_tipo text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when not public.perfil_equipe() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'telefone', telefone, 'nome', nome, 'municipio', coalesce(municipio_oficial, municipio),
             'municipio_a_corrigir', local = 'a_corrigir', 'bairro', bairro, 'extras', extras,
             'tipo', case
               when telefone is null then 'sem_telefone'
               when nome is null then 'so_numero'
               when local = 'bahia' then 'completos'
               when local = 'outro_estado' then 'outro_estado'
               else 'sem_municipio' end
           ) order by linha)
      from bases_externas_pessoas
     where base_id = p_base
       and case coalesce(p_tipo, '')
             when ''              then telefone is not null
             when 'completos'     then telefone is not null and nome is not null and local = 'bahia'
             when 'sem_municipio' then telefone is not null and nome is not null and local in ('vazio', 'a_corrigir')
             when 'so_numero'     then telefone is not null and nome is null
             when 'outro_estado'  then telefone is not null and nome is not null and local = 'outro_estado'
             when 'sem_telefone'  then telefone is null
             -- ── OS DOIS NOVOS, POR DDD ─────────────────────────────────────
             -- `telefone` aqui está sempre sem o 55 (é o que base_externa_gravar
             -- aceita: 10 ou 11 dígitos), então os dois primeiros dígitos SÃO o
             -- DDD. Nenhum recorte esperto é necessário, e nenhum deve ser
             -- usado: no dia em que um telefone entrar com o 55 na frente, o
             -- certo é a gravação recusar, não esta conta adivinhar.
             when 'ddd_bahia'     then telefone is not null
                                        and left(telefone, 2) in ('71','73','74','75','77')
             when 'ddd_fora'      then telefone is not null
                                        and left(telefone, 2) not in ('71','73','74','75','77')
             else false end
  ), '[]'::jsonb) end
$$;

comment on function public.base_externa_exportar is
  'Exporta uma base externa inteira ou por tipo. `completos` e `outro_estado` olham o MUNICÍPIO declarado; `ddd_bahia` e `ddd_fora` olham o prefixo do telefone. São fatos diferentes e ficam em tipos diferentes de propósito: agenda de celular não traz cidade nenhuma, e sem o DDD ela só saberia exportar tudo ou nada.';

revoke all on function public.base_externa_exportar(uuid, text) from public, anon;
grant execute on function public.base_externa_exportar(uuid, text) to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Nas bases de agenda, `completos` é zero e `ddd_bahia` não: é a diferença que
-- justifica os tipos novos.
select b.nome,
       (public.base_externa_contar(b.id) ->> 'pessoas')::int   as pessoas,
       (public.base_externa_contar(b.id) ->> 'completos')::int as completos_por_cidade,
       (public.base_externa_contar(b.id) ->> 'ddd_bahia')::int as por_ddd_da_bahia
  from bases_externas b order by b.criada_em;
