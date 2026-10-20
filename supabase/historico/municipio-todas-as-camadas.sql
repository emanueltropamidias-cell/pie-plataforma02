-- ============================================================================
-- MUNICÍPIO: UMA GRAFIA, EM TODAS AS CAMADAS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ESTE ARQUIVO EXISTE, SE JÁ TEVE UM ──────────────────────────────
--
-- O primeiro arrumou `liderancas` e `conversas`. Eu conferi `liderancas`, vi
-- Salvador com 97 e dei por encerrado. Um print mostrou "ALAGOINHAS" no filtro
-- de Métricas, que lê `conversas`: eu tinha ESCRITO aquele update e nunca
-- CONFERIDO — e nem tinha procurado as outras tabelas.
--
-- Município mora em cinco lugares:
--
--   liderancas.municipio           a pessoa na base
--   conversas.municipio            a conversa
--   conversas.municipio_sugerido   o que o lead respondeu e ninguém confirmou
--   demandas.municipio             o pedido
--   atendimentos.municipio         o espelho antigo, que o Painel ainda lê
--
-- ── POR QUE ELE PULA O QUE NÃO EXISTE ───────────────────────────────────────
--
-- A primeira versão citava as cinco tabelas direto. Se uma delas não estivesse
-- neste banco, o Postgres derrubava o script INTEIRO — e o editor do Supabase
-- roda tudo numa transação, então nem as quatro que existem seriam arrumadas.
--
-- Um script de limpeza que falha por completo porque uma tabela opcional falta
-- é pior que um que arruma o que dá e diz o que pulou. Agora cada tabela é
-- verificada antes, e o que não existe vira aviso no lugar de erro.
--
-- ── A REGRA ─────────────────────────────────────────────────────────────────
--
-- A grafia certa vem de `municipios_ba`, os 417 oficiais. Texto que não bate
-- com nenhum fica como está: povoado, cidade de outro estado e erro de
-- digitação precisam entrar, para a tela de conferência decidir caso a caso.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A LISTA OFICIAL PRECISA ESTAR LÁ
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare v_qtd int;
begin
  if to_regclass('public.municipios_ba') is null then
    raise exception
      'A tabela municipios_ba não existe. Rode supabase/municipios.sql antes deste.';
  end if;

  execute 'select count(*) from public.municipios_ba' into v_qtd;
  if v_qtd < 400 then
    raise exception
      'municipios_ba tem apenas % linhas (esperado 417). Rode supabase/municipios.sql antes.', v_qtd;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AS DUAS FORMAS DO GATILHO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Duas e não uma porque plpgsql resolve o campo em tempo de execução: uma
-- função que citasse `new.municipio_sugerido` quebraria em toda tabela que não
-- tem essa coluna.
create or replace function public.municipio_na_grafia_oficial()
returns trigger
language plpgsql
as $$
declare
  v_nome text;
begin
  if new.municipio is null then
    return new;
  end if;

  new.municipio := btrim(new.municipio);

  select nome into v_nome
    from public.municipios_ba
   where chave = public.chave_municipio(new.municipio);

  if v_nome is not null then
    new.municipio := v_nome;
  end if;

  return new;
end $$;

-- A conversa tem DUAS colunas de município. A sugerida é a resposta crua de
-- quem escreveu — "salvador", "SALVADOR ", "Salvador-BA" — e é ela que a
-- atendente vê no formulário. Chegar já na grafia certa evita que ela confirme
-- uma variante nova.
create or replace function public.conversa_municipio_na_grafia_oficial()
returns trigger
language plpgsql
as $$
declare
  v_nome text;
begin
  if new.municipio is not null then
    new.municipio := btrim(new.municipio);
    select nome into v_nome from public.municipios_ba
     where chave = public.chave_municipio(new.municipio);
    if v_nome is not null then new.municipio := v_nome; end if;
  end if;

  if new.municipio_sugerido is not null then
    new.municipio_sugerido := btrim(new.municipio_sugerido);
    select nome into v_nome from public.municipios_ba
     where chave = public.chave_municipio(new.municipio_sugerido);
    if v_nome is not null then new.municipio_sugerido := v_nome; end if;
  end if;

  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. GATILHO E LIMPEZA, TABELA POR TABELA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `to_regclass` devolve nulo em vez de erro quando a tabela não existe, e a
-- coluna é conferida no catálogo. Assim o script atravessa qualquer banco:
-- arruma o que encontra, avisa o que não encontrou.
do $$
declare
  v_tab   text;
  v_func  text;
  v_cols  text;
  v_feito int;
begin
  foreach v_tab in array array[
    'liderancas', 'conversas', 'demandas', 'atendimentos'
  ] loop

    if to_regclass('public.' || v_tab) is null then
      raise notice 'PULADO: a tabela %s não existe neste banco.', v_tab;
      continue;
    end if;

    if not exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_tab
         and column_name = 'municipio'
    ) then
      raise notice 'PULADO: %s não tem coluna municipio.', v_tab;
      continue;
    end if;

    -- A conversa tem a coluna sugerida e por isso ganha a outra função. Sem
    -- citar as DUAS colunas no `update of`, mexer só na sugerida não dispara
    -- nada — que é exatamente o que o fluxo de boas-vindas faz.
    if exists (
      select 1 from information_schema.columns
       where table_schema = 'public' and table_name = v_tab
         and column_name = 'municipio_sugerido'
    ) then
      v_func := 'public.conversa_municipio_na_grafia_oficial()';
      v_cols := 'municipio, municipio_sugerido';
    else
      v_func := 'public.municipio_na_grafia_oficial()';
      v_cols := 'municipio';
    end if;

    execute format(
      'drop trigger if exists %I on public.%I', v_tab || '_municipio_uma_grafia', v_tab);
    execute format(
      'create trigger %I before insert or update of %s on public.%I
         for each row execute function %s',
      v_tab || '_municipio_uma_grafia', v_cols, v_tab, v_func);

    execute format(
      'update public.%I x set municipio = m.nome
         from public.municipios_ba m
        where public.chave_municipio(x.municipio) = m.chave
          and x.municipio is distinct from m.nome', v_tab);
    get diagnostics v_feito = row_count;
    raise notice 'ARRUMADO: %s linhas em %s (municipio).', v_feito, v_tab;

    if v_cols like '%sugerido%' then
      execute format(
        'update public.%I x set municipio_sugerido = m.nome
           from public.municipios_ba m
          where public.chave_municipio(x.municipio_sugerido) = m.chave
            and x.municipio_sugerido is distinct from m.nome', v_tab);
      get diagnostics v_feito = row_count;
      raise notice 'ARRUMADO: %s linhas em %s (municipio_sugerido).', v_feito, v_tab;
    end if;

  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CONFERÊNCIA — UMA LINHA, TUDO ZERO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Conferir só onde eu lembrei de arrumar foi como este arquivo passou a
-- existir. Aqui as colunas e os gatilhos aparecem juntos.
--
-- `to_regclass` de novo: a conferência não pode ser o que derruba o script
-- depois de a limpeza ter dado certo.
select
  (select count(*) from public.liderancas x join public.municipios_ba m
     on m.chave = public.chave_municipio(x.municipio)
   where x.municipio is distinct from m.nome)            as pessoas_tortas,
  (select count(*) from public.conversas x join public.municipios_ba m
     on m.chave = public.chave_municipio(x.municipio)
   where x.municipio is distinct from m.nome)            as conversas_tortas,
  (select count(*) from public.conversas x join public.municipios_ba m
     on m.chave = public.chave_municipio(x.municipio_sugerido)
   where x.municipio_sugerido is distinct from m.nome)   as sugeridos_tortos,
  (select count(*) from pg_trigger
    where tgname like '%\_municipio\_uma\_grafia')        as gatilhos;
