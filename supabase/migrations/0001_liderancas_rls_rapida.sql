-- ============================================================================
-- A RLS DE LIDERANÇAS DEIXA DE RODAR POR LINHA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- A política de leitura era:
--
--     CASE WHEN perfil_equipe() THEN true
--          ELSE id IN (SELECT minha_subarvore()) END
--
-- Chamada de função escrita assim, crua, o Postgres avalia UMA VEZ POR LINHA.
-- São 6.711 lideranças: `perfil_equipe()` rodava 6.711 vezes por consulta, e
-- para quem não é da equipe `minha_subarvore()` — que percorre a árvore de
-- indicações inteira — rodava outras 6.711.
--
-- Envolvida em `(select ...)`, a mesma chamada vira InitPlan e roda UMA vez. O
-- resultado é idêntico; o que muda é quantas vezes se pergunta.
--
-- ── O QUE FOI MEDIDO ────────────────────────────────────────────────────────
--
--   contar as lideranças, como admin        235ms -> 42ms
--   como atendente                          246ms -> 57ms
--
-- E o plano dizia `Rows Removed by Filter: 6711` para devolver ZERO linha: a
-- consulta lia a tabela toda para descartar tudo.
--
-- No `pg_stat_statements` a pior consulta desta tabela estava com média de
-- 5,3 SEGUNDOS. Era a tela travando.
--
-- ── POR QUE ISTO ESCAPOU ────────────────────────────────────────────────────
--
-- Já tínhamos corrigido exatamente isto em `conversas` e `mensagens`, quando a
-- caixa de atendimento ficou lenta. A correção parou onde o sintoma apareceu e
-- não foi levada para `liderancas` — que é a tabela maior.
--
-- Ainda restam 48 políticas com chamada crua em outras tabelas. Não entram aqui
-- porque são tabelas pequenas (2, 18, 146 linhas) onde o custo é irrelevante
-- HOJE — mas é a mesma classe de defeito, e cresce com a tabela.
--
-- ── A MUDANÇA NÃO ABRE NEM FECHA ACESSO ─────────────────────────────────────
--
-- `CASE WHEN a THEN true ELSE b END` e `a OR b` dão o mesmo resultado. Foi
-- conferido antes de aplicar, com seis contas de papéis diferentes: cada uma
-- enxerga exatamente as mesmas linhas de antes.

alter policy "liderancas le" on public.liderancas
  using (
    (select public.perfil_equipe())
    or id in (select public.minha_subarvore())
  );

alter policy "liderancas escreve" on public.liderancas
  with check (
    (select public.perfil_equipe())
    or parent_id in (select public.minha_subarvore())
  );

alter policy "liderancas atualiza" on public.liderancas
  using ((select public.perfil_equipe()))
  with check ((select public.perfil_equipe()));

alter policy "liderancas apaga" on public.liderancas
  using ((select public.perfil_equipe()));

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- As quatro têm de aparecer como envolvidas. Chamada crua que sobrasse aqui
-- seria o defeito de volta, sem nada na tela denunciando.
select policyname,
       case when coalesce(qual, with_check) ~* '\(\s*SELECT (public\.)?perfil'
            then 'envolvida' else 'CRUA — confira' end as estado
  from pg_policies
 where schemaname = 'public' and tablename = 'liderancas'
 order by policyname;
