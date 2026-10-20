-- ============================================================================
-- "BAIXAR TODAS" PASSA A INCLUIR A BASE DA CAMPANHA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria uma função de leitura.
--
-- ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
--
-- 02/10, Emanuel: "quando eu estou baixando a base, de 81 mil está vindo
-- somente 63k".
--
-- Ele está certo, e o defeito é de NOME, não de conta.
--
-- `bases_externas_exportar_tudo` lê só `bases_externas_pessoas` — as gavetas
-- de planilha e agenda. São 63.401 pessoas, e o número está certo para o que a
-- função faz. Mas o botão diz "Baixar todas", e a plataforma inteira mostra
-- 81.751 pessoas distintas. Quem baixa espera o 81.
--
-- As 18 mil que faltavam são a BASE DA CAMPANHA: quem conversou com os 19
-- chips e quem está na rede. Ela nunca entrou nesse arquivo — e é justamente a
-- parte que importa mais, porque é gente que falou com a Talita.
--
-- O comentário da própria rota já prometia o que ela não entregava: "este
-- arquivo responde a pergunta oposta: me dá todo mundo, sem repetir".
--
-- ── POR QUE UMA FUNÇÃO NOVA, E NÃO TROCAR A ANTIGA ──────────────────────────
--
-- Porque a antiga está CERTA para o nome dela, e a tela de bases externas pode
-- continuar querendo só as gavetas. Trocar o significado de uma função que já
-- roda é o tipo de mudança que ninguém percebe até um número mudar sozinho
-- numa reunião.
--
-- ── O TELEFONE É O MESMO DE TODA A PLATAFORMA ───────────────────────────────
--
-- `fone_canonico` nos três lados. É ele que decide se dois cadastros são a
-- mesma pessoa, e é por ele que a coluna gerada `bases_externas_pessoas.fone`
-- já está guardada. Comparar cru aqui faria a mesma pessoa sair duas vezes:
-- `conversas` guarda com o 55 na frente e `liderancas` guarda de todo jeito —
-- com espaço, com +55, com hífen.
--
-- ── A CIDADE DA CAMPANHA ENTRA SÓ SE FOR DE VERDADE ─────────────────────────
--
-- Município conferido contra os 417 da Bahia, como no resto da plataforma.
-- Deduzir cidade pelo DDD seria inventar: o 75 vai de Feira de Santana a Paulo
-- Afonso, 400 km.

-- ── O TETO DE 8 SEGUNDOS PRECISA SER LEVANTADO AQUI ─────────────────────────
--
-- O papel `authenticated` roda com `statement_timeout=8s`, e esta consulta leva
-- 10,2s: medida, não estimada. Sem o `set` abaixo o botão falharia SEMPRE, com
-- um erro de timeout que parece problema de rede.
--
-- O custo está em calcular `fone_canonico` em ~60 mil linhas de `conversas` e
-- `liderancas` na hora. `bases_externas_pessoas` não paga isso porque já tem a
-- coluna gerada `fone` guardada (0049).
--
-- O conserto de verdade é dar a mesma coluna gerada às outras duas — e está
-- adiado de propósito: `alter table add generated column` reescreve a tabela
-- inteira com trava exclusiva, e `conversas` é por onde passa TODA mensagem que
-- entra. Isso se faz depois de 04/10, não a dois dias da eleição.
create or replace function public.base_tudo_exportar()
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '55s'
as $function$
  select case when not public.perfil_equipe() then null else coalesce((
    select jsonb_agg(jsonb_build_object(
             'telefone',  fone,
             'nome',      nome,
             'municipio', coalesce(mun_bahia, mun_qualquer),
             'bairro',    bairro,
             'local',     local,
             'bases',     bases
           ) order by (local = 'bahia') desc, coalesce(mun_bahia, mun_qualquer) nulls last, nome nulls last)
      from (
        select t.fone,
               min(t.nome) filter (where t.nome is not null)              as nome,
               min(t.municipio) filter (where t.local = 'bahia')          as mun_bahia,
               min(t.municipio) filter (where t.municipio is not null)    as mun_qualquer,
               min(t.bairro) filter (where t.bairro is not null)          as bairro,
               -- Está na Bahia em QUALQUER origem => é da Bahia. A gaveta que
               -- não sabia a cidade não desmente a que sabia.
               case when bool_or(t.local = 'bahia') then 'bahia'
                    when bool_or(t.local = 'outro_estado') then 'outro_estado'
                    when bool_or(t.local = 'a_corrigir') then 'a_corrigir'
                    else 'vazio' end                                      as local,
               string_agg(distinct t.base, ' + ' order by t.base)         as bases
          from (
            -- 1. as gavetas externas, exatamente como a função antiga as lê
            select p.fone,
                   p.nome,
                   coalesce(p.municipio_oficial, p.municipio) as municipio,
                   p.bairro,
                   p.local,
                   b.nome as base
              from bases_externas_pessoas p
              join bases_externas b on b.id = p.base_id
             where p.fone <> ''

            union all

            -- 2. a REDE: quem tem ficha
            select public.fone_canonico(l.telefone),
                   nullif(btrim(l.nome), ''),
                   mb.nome,
                   nullif(btrim(l.bairro), ''),
                   case when mb.nome is not null then 'bahia' else 'vazio' end,
                   'Base da campanha'
              from liderancas l
              left join municipios_ba mb on mb.chave = public.chave_municipio(l.municipio)
             where l.telefone is not null

            union all

            -- 3. QUEM CONVERSOU, mesmo sem ficha. É a parte que mais faltava:
            --    gente que escreveu para a campanha e nunca foi cadastrada.
            select public.fone_canonico(c.telefone),
                   coalesce(nullif(btrim(c.nome), ''), nullif(btrim(c.nome_sugerido), '')),
                   mb.nome,
                   nullif(btrim(c.bairro), ''),
                   case when mb.nome is not null then 'bahia' else 'vazio' end,
                   'Base da campanha'
              from conversas c
              left join municipios_ba mb
                     on mb.chave = public.chave_municipio(coalesce(c.municipio, c.municipio_sugerido))
             where c.telefone is not null
          ) t
         -- LID e lixo ficam de fora: 10 ou 11 dígitos é telefone brasileiro, o
         -- resto é o identificador opaco do WhatsApp, que não disca.
         where length(t.fone) in (10, 11)
         group by t.fone
      ) z
  ), '[]'::jsonb) end
$function$;

comment on function public.base_tudo_exportar is
  'TODA a base numa planilha: as bases externas MAIS a base da campanha (a rede e quem conversou), uma linha por pessoa, comparada por fone_canonico. Diferente de bases_externas_exportar_tudo, que lê só as gavetas externas — era por isso que o botão "Baixar todas" devolvia 63 mil onde a plataforma mostra 81 mil.';

revoke all on function public.base_tudo_exportar() from public, anon;
grant execute on function public.base_tudo_exportar() to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Sem sessão as duas devolvem nulo (a trava do perfil), então aqui a conta é
-- feita por fora: a função nova tem de dar o mesmo que a união dos três lados.
select
  (select count(*) from (
     select fone f from bases_externas_pessoas where fone is not null
     union select public.fone_canonico(telefone) from liderancas where telefone is not null
     union select public.fone_canonico(telefone) from conversas  where telefone is not null) u
    where length(f) in (10,11))                                   as deveria_dar,
  (select count(*) from bases_externas_pessoas where fone is not null
     and length(fone) in (10,11))                                 as so_as_gavetas;
