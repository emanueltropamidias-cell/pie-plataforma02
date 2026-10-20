-- ============================================================================
-- O TELEFONE CANÔNICO PASSA A SER COLUNA, E NÃO CONTA REFEITA A CADA CONSULTA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
-- RODAR TAMBÉM NA INSTALAÇÃO DO MANASSÉS.
--
-- ── O ÍNDICE NÃO BASTOU, E O MOTIVO É O TIPO DE CONSULTA ────────────────────
--
-- A 0048 indexou `fone_canonico(telefone)`. Índice de expressão serve para
-- BUSCAR — "ache quem tem este telefone" — e ali funciona.
--
-- Mas a exportação de todas as bases AGRUPA a tabela inteira por esse valor.
-- Agrupar não consulta índice: percorre tudo e calcula. Medido:
--
--   sem índice ...... 13.193 ms
--   com índice ...... 11.213 ms
--
-- Dois segundos de melhora num teto de 8. A função continua rodando 58 mil
-- vezes, com três expressões regulares cada.
--
-- ── COLUNA GERADA: A CONTA ACONTECE UMA VEZ, NA GRAVAÇÃO ────────────────────
--
-- `generated always as (...) stored` deixa o Postgres calcular no INSERT e
-- guardar. A consulta passa a ler um texto pronto.
--
-- Só é permitido porque `fone_canonico` é IMMUTABLE. Se a regra do nono dígito
-- mudar um dia, esta coluna precisa ser recriada — e é por isso que este aviso
-- está aqui e não num commit que ninguém relê.
--
-- ── SÓ NESTA TABELA, POR ENQUANTO ───────────────────────────────────────────
--
-- `conversas` e `liderancas` sofrem do mesmo custo, e a mesma correção serve.
-- Mas acrescentar coluna gerada REESCREVE a tabela e pega trava exclusiva —
-- em `conversas`, que recebe mensagem a cada segundo, isso é a caixa parada no
-- meio do expediente.
--
-- Faltam cinco dias para a eleição. `bases_externas_pessoas` não é escrita no
-- dia a dia e pode ser mexida agora; as outras duas ficam para depois do dia 4,
-- ou para uma madrugada. Está registrado como dívida, não como esquecimento.

alter table public.bases_externas_pessoas
  add column if not exists fone text
  generated always as (public.fone_canonico(telefone)) stored;

-- O índice agora é sobre a coluna, não sobre a expressão: mais barato de
-- manter e usável também em agrupamento.
drop index if exists public.bases_externas_pessoas_fone_canonico;
create index if not exists bases_externas_pessoas_fone
  on public.bases_externas_pessoas (fone)
  where fone <> '';

analyze public.bases_externas_pessoas;

-- ── a exportação passa a ler a coluna ───────────────────────────────────────
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
             'municipio', coalesce(mun_bahia, mun_qualquer),
             'bairro',    bairro,
             'local',     local,
             'bases',     bases
           ) order by (local = 'bahia') desc, coalesce(mun_bahia, mun_qualquer) nulls last, nome nulls last)
      from (
        select p.fone,
               min(p.nome) filter (where p.nome is not null)                as nome,
               min(coalesce(p.municipio_oficial, p.municipio))
                 filter (where p.local = 'bahia')                            as mun_bahia,
               min(p.municipio) filter (where p.municipio is not null)       as mun_qualquer,
               min(p.bairro)    filter (where p.bairro is not null)          as bairro,
               -- Se a pessoa está na Bahia em QUALQUER base, ela é da Bahia: a
               -- gaveta que não sabia a cidade não desmente a que sabia.
               case when bool_or(p.local = 'bahia') then 'bahia'
                    when bool_or(p.local = 'outro_estado') then 'outro_estado'
                    when bool_or(p.local = 'a_corrigir') then 'a_corrigir'
                    else 'vazio' end                                         as local,
               string_agg(distinct b.nome, ' + ' order by b.nome)            as bases
          from bases_externas_pessoas p
          join bases_externas b on b.id = p.base_id
         where p.fone <> ''
         group by p.fone
      ) z
  ), '[]'::jsonb) end
$function$;

revoke all on function public.bases_externas_exportar_tudo() from public, anon;
grant execute on function public.bases_externas_exportar_tudo() to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
select count(*) as linhas,
       count(*) filter (where fone <> '') as com_fone_canonico,
       count(distinct fone) filter (where fone <> '') as pessoas_distintas
  from public.bases_externas_pessoas;
