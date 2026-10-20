-- ============================================================================
-- O QUE FOI IMPORTADO DO TSE — PARA A TELA NÃO OFERECER O QUE NÃO EXISTE
-- ============================================================================
--
-- O painel tinha os anos 2022/2024/2026 e os 27 estados escritos à mão. Só a
-- Bahia de 2022 e 2024 estava no banco: o botão de 2026 abria um painel vazio,
-- e o mapa do Brasil pintava 26 estados de "sem votação" — quando o certo era
-- "não importado". Para quem lê, as duas coisas são opostas.
--
-- E a "presença eleitoral" dividia por 417, o número de cidades da Bahia,
-- escrito no código. Aqui sai do banco: cidades com voto registrado naquele
-- ano e estado, para qualquer candidato.
-- ────────────────────────────────────────────────────────────────────────────

create or replace function public.eleicao_cobertura()
returns table (ano integer, uf text, candidaturas bigint, municipios bigint)
language sql
stable
set search_path = public, pg_temp
as $$
  with c as (
    select ano, uf, count(*) as candidaturas
      from public.eleicao_candidatos
     group by 1, 2
  ),
  m as (
    select ano, uf, count(distinct codigo_tse) as municipios
      from public.eleicao_votos_municipio
     group by 1, 2
  )
  select c.ano, c.uf, c.candidaturas, coalesce(m.municipios, 0)
    from c
    left join m using (ano, uf)
   order by 1, 2;
$$;

grant execute on function public.eleicao_cobertura() to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
select * from public.eleicao_cobertura();
