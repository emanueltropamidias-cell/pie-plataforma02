-- ============================================================================
-- TRANCAR A ÁREA INTERNA — a porta ao lado da que acabamos de fechar
-- ============================================================================
--
-- Rode DEPOIS de `trancar-base.sql`, que é quem cria `perfil_equipe()`.
--
-- O PROBLEMA. Trancar `liderancas` fechou a lista de pessoas. Não fechou o
-- resto: as demais tabelas ainda usam `perfil_ativo()`, que quer dizer só
-- "conta aprovada" — e as 43 contas de portal são aprovadas.
--
-- Na prática, hoje uma liderança que digite /atendimento na barra de endereço
-- entra, porque o layout da área interna confere status e nunca papel. E lê:
--
--   atendimentos       toda conversa de WhatsApp, com nome, telefone e o que a
--                      pessoa contou da própria vida. É o dado mais sensível
--                      que a campanha tem.
--   demandas           os pedidos de saúde, emprego e jurídico, com nome.
--   metricas_trafego   quanto a campanha gasta, em quê e com que resultado.
--   registros_disparo  para quem já se disparou.
--
-- Nada disso é da liderança. O portal dela mostra a rede dela, e só.
--
-- A CORREÇÃO. As tabelas de trabalho passam de `perfil_ativo()` para
-- `perfil_equipe()`. É uma palavra por tabela, e a diferença entre "tem login"
-- e "é da casa".
--
-- `municipios_ba` fica de fora de propósito: é a lista dos 417 municípios da
-- Bahia, dado público do IBGE. Trancar não protege nada e quebraria o mapa.

do $$
declare
  t text;
  tabelas text[] := array[
    'atendimentos', 'demandas', 'registros_disparo', 'metas_campanha',
    'metricas_trafego', 'campanhas_trafego', 'conjuntos_trafego',
    'criativos_trafego', 'trafego_sync',
    -- as do CRM de atendimento, quando existirem
    'mensagens', 'atendentes', 'tags', 'atendimento_tags', 'atribuicoes',
    'fluxos', 'fluxo_passos'
  ];
begin
  foreach t in array tabelas loop
    -- to_regclass devolve nulo em vez de erro quando a tabela não existe, então
    -- este arquivo roda inteiro mesmo antes dos SQL do CRM terem sido aplicados.
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', t);

    -- A antiga sai ANTES. RLS soma políticas: deixar a larga viva ao lado da
    -- estreita não tranca nada — a permissiva vence.
    execute format('drop policy if exists %I on public.%I', t || ' equipe ativa', t);
    execute format('drop policy if exists %I on public.%I', t || ' equipe', t);

    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.perfil_equipe())
        with check (public.perfil_equipe())
    $f$, t || ' equipe', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- A PROVA — última consulta, que é a única que o editor mostra
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Toda linha tem de dizer "so equipe". Qualquer "PERFIL ATIVO" que sobre é uma
-- tabela que as 43 contas de portal continuam lendo.

select
  tablename  as tabela,
  policyname as politica,
  case
    when qual like '%perfil_equipe%' then 'so equipe'
    when qual like '%perfil_ativo%'  then '>>> PERFIL ATIVO — portal ainda le'
    else coalesce(left(qual, 40), '(sem condicao)')
  end as quem_le
from pg_policies
where schemaname = 'public'
  and tablename in (
    'atendimentos', 'demandas', 'registros_disparo', 'metas_campanha',
    'metricas_trafego', 'campanhas_trafego', 'conjuntos_trafego',
    'criativos_trafego', 'trafego_sync', 'liderancas',
    'mensagens', 'atendentes', 'tags', 'atendimento_tags', 'atribuicoes',
    'fluxos', 'fluxo_passos'
  )
order by quem_le desc, tabela, politica;

-- ─────────────────────────────────────────────────────────────────────────────
-- Voltar atrás
-- ─────────────────────────────────────────────────────────────────────────────
-- Troque `perfil_equipe` por `perfil_ativo` no bloco acima e rode de novo.
