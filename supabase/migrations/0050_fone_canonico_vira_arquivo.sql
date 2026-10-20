-- ============================================================================
-- fone_canonico: A REGRA ÚNICA DE TELEFONE, QUE NUNCA TINHA VIRADO ARQUIVO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria função.
--
-- ── POR QUE ESTA MIGRAÇÃO EXISTE EM 29/09, TARDE DEMAIS ─────────────────────
--
-- `fone_canonico` é a função mais usada da plataforma: toda comparação de
-- pessoa passa por ela, porque `liderancas` e `conversas` guardam telefone em
-- quatro formatos e comparar cru já errou por 7.171 pessoas uma vez.
--
-- Ela foi criada direto no banco da Talita, e NUNCA virou arquivo. Descoberto
-- hoje, ao tentar levar a exportação de bases para a instalação do Manassés:
-- a migração falhou com "function public.fone_canonico(text) does not exist".
--
-- É o defeito que a regra 01 do projeto descreve com todas as letras:
-- consertar no banco e não no arquivo deixa o defeito armado para voltar. Aqui
-- ele voltou pelo caminho mais previsível — uma segunda instalação.
--
-- A definição abaixo é a que está VIVA no banco da Talita, lida com
-- pg_get_functiondef. Não foi reescrita de memória.
--
-- ── O QUE ELA FAZ ───────────────────────────────────────────────────────────
--
-- Tira pontuação, tira o 55 do país, e acrescenta o nono dígito quando o
-- primeiro dígito do número local é 6, 7, 8 ou 9 — que é conversão
-- determinística da Anatel, não chute. De 2 a 5 é fixo e fica como está.
--
-- É IMMUTABLE, e isso não é enfeite: é o que permite indexá-la e usá-la em
-- coluna gerada (ver 0048 e 0049). Se a regra do nono dígito mudar, o índice e
-- a coluna precisam ser recriados.

CREATE OR REPLACE FUNCTION public.fone_canonico(bruto text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  with d as (select regexp_replace(coalesce(bruto,''), '\D', '', 'g') as n),
  sem55 as (
    select case when length(n) in (12,13) and left(n,2) = '55' then substring(n from 3) else n end as n
      from d
  )
  select case
           when length(n) = 11 and substring(n,3,1) = '9' then n
           -- 10 dígitos com 6,7,8,9 no início do número local: celular antigo,
           -- ganha o 9 que a Anatel acrescentou. 2 a 5 é fixo e fica como está.
           when length(n) = 10 and substring(n,3,1) in ('6','7','8','9')
             then substring(n,1,2) || '9' || substring(n,3)
           else n
         end
    from sem55;
$function$
;

revoke all on function public.fone_canonico(text) from public, anon;
grant execute on function public.fone_canonico(text) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Os quatro formatos que a base guarda, todos tendo de cair no mesmo canônico.
select public.fone_canonico('5571988887777') as com_55,
       public.fone_canonico('71988887777')   as sem_55,
       public.fone_canonico('(71) 98888-7777') as com_pontuacao,
       public.fone_canonico('7188887777')    as oito_digitos_ganha_o_9,
       public.fone_canonico('7133334444')    as fixo_fica_como_esta;
