-- ============================================================================
-- QUEM CONSEGUE BAIXAR A BASE HOJE — tudo em UMA consulta
-- ============================================================================
--
-- O editor do Supabase mostra só o resultado da ÚLTIMA consulta de um arquivo.
-- Por isso aqui é uma consulta só, com todas as respostas empilhadas numa
-- tabela de três colunas. Cole, rode, e mande o print inteiro.
--
-- Não altera nada: só lê.
--
-- COMO LER O RESULTADO
--
--   1 · CONTA ATIVA   uma linha por conta que hoje entra na plataforma.
--                     "EQUIPE" = vê a base inteira, hoje e depois da trava.
--                     "PORTAL: fulana" = vê a base inteira HOJE e passa a ver
--                     só a sub-rede dela depois. É a linha que interessa.
--   2 · PORTAL        quantas lideranças já têm login. Zero = risco só futuro.
--   3 · BASE          o tamanho do que está exposto.
--   4 · POLÍTICA      as travas de liderancas. RLS soma políticas: uma larga
--                     esquecida anula todas as estreitas.
--   5 · VIEW          view sem security_invoker roda com o privilégio de quem
--                     a criou e entrega o que a RLS proíbe.
--   6 · TABELA        qualquer uma sem RLS é porta aberta.

with contas as (
  select
    p.id,
    coalesce(p.email, '(sem e-mail)') as email,
    coalesce(p.role, 'usuario')       as papel,
    coalesce(p.status, '(sem status)') as situacao,
    (select l.nome from public.liderancas l where l.auth_uid = p.id limit 1) as lideranca
  from public.profiles p
)

select * from (

  select 1 as ordem,
         '1 · CONTA ATIVA' as secao,
         email || '  (' || papel || ')' as item,
         case
           when lideranca is not null and papel = 'admin'
             then 'ADMIN + portal (' || lideranca || ') — continua vendo tudo'
           when lideranca is not null
             then '>>> PORTAL: ' || lideranca || ' — PERDE o acesso total'
           else 'EQUIPE — vê tudo, antes e depois'
         end as valor
  from contas
  where situacao = 'ativo'

  union all
  select 2, '1 · CONTA ATIVA', '(contas por situação)',
         situacao || ': ' || count(*)::text
  from contas group by situacao

  union all
  select 3, '2 · PORTAL', 'lideranças com login vinculado',
         count(*)::text
  from public.liderancas where auth_uid is not null

  union all
  select 4, '3 · BASE', 'pessoas em liderancas',
         count(*)::text || '  (com telefone: '
         || count(*) filter (where telefone is not null)::text || ')'
  from public.liderancas

  union all
  select 5, '4 · POLÍTICA', policyname || '  [' || cmd || ']',
         coalesce(qual, '(sem condição de leitura)')
  from pg_policies
  where schemaname = 'public' and tablename = 'liderancas'

  union all
  select 6, '5 · VIEW', c.relname,
         case when 'security_invoker=on' = any(c.reloptions)
              then 'ok'
              else '>>> IGNORA A RLS' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'

  union all
  select 7, '6 · TABELA', c.relname,
         case when c.relrowsecurity then 'RLS ligada' else '>>> SEM RLS' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

  union all
  select 8, '6 · TABELA', '(tabelas sem RLS)',
         count(*)::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity

) tudo
order by ordem, item;
