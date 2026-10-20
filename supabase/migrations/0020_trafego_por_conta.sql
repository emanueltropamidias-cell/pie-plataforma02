-- ============================================================================
-- TRÁFEGO POR CONTA DE ANÚNCIO — as cinco, e não só a CA 01
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga dado.
--
-- ── O QUE ESTAVA ERRADO ─────────────────────────────────────────────────────
--
-- A campanha roda em CINCO contas de anúncio (CA 01 a CA 05 | 2026). O PIE lia
-- UMA: `act_${META_AD_ACCOUNT_ID}`, um valor só no ambiente. Em 15/09, de
-- madrugada, a CA 02 já tinha gastado R$ 122 contra R$ 68 da CA 01 — a conta que
-- mais gastava no dia era uma que o PIE nunca mostrou.
--
-- E nenhuma tabela de tráfego sabia que existe mais de uma conta. Pior: as
-- métricas diárias eram casadas pelo NOME da campanha. Com cinco contas, uma
-- "Engajamento" na CA 01 e outra na CA 02 viram uma linha só, e o custo por lead
-- das duas se mistura sem erro nenhum.
--
-- ── O QUE ISTO FAZ ──────────────────────────────────────────────────────────
--
--   1. `conta_id` e `conta_nome` nas quatro tabelas de tráfego;
--   2. `campaign_id` nas métricas diárias, que passam a casar pelo ID;
--   3. `trafego_contas`: uma linha por conta — status, saldo, alcance único e a
--      hora do último sync DE CADA UMA, para a tela dizer qual conta travou;
--   4. `trafego_gravar()`: o ÚNICO lugar que escreve tráfego.
--
-- ── POR QUE UM GRAVADOR SÓ, NO BANCO ────────────────────────────────────────
--
-- Quem grava são dois: o cron da Vercel (de 5 em 5 minutos) e o botão da tela.
-- Se cada um tivesse a sua lógica de apagar-e-regravar, elas desencontrariam —
-- é a regra da casa. Aqui os dois chamam a mesma função, e ela roda numa
-- transação: se a gravação da CA 03 falhar no meio, a CA 03 fica como estava, e
-- as outras quatro não são tocadas.
--
-- E o apagar é SEMPRE por conta. O sync antigo fazia `delete ... where fonte =
-- 'meta'` — com cinco contas, sincronizar uma apagaria as outras quatro.

-- ── 1. A conta em cada linha ────────────────────────────────────────────────

alter table public.metricas_trafego  add column if not exists conta_id    text;
alter table public.metricas_trafego  add column if not exists conta_nome  text;
alter table public.metricas_trafego  add column if not exists campaign_id text;
alter table public.campanhas_trafego add column if not exists conta_id    text;
alter table public.campanhas_trafego add column if not exists conta_nome  text;
alter table public.conjuntos_trafego add column if not exists conta_id    text;
alter table public.conjuntos_trafego add column if not exists conta_nome  text;
alter table public.criativos_trafego add column if not exists conta_id    text;
alter table public.criativos_trafego add column if not exists conta_nome  text;

-- O que já está no banco veio TODO da CA 01: foi a única conta que o PIE leu na
-- vida (conferido em `trafego_sync`, que guardava "CA 01 | 2026"). Sem isto, as
-- linhas antigas ficariam sem conta, o apagar-por-conta nunca as alcançaria, e o
-- primeiro sync completo duplicaria três anos de CA 01.
update public.metricas_trafego  set conta_id = '971232521868866', conta_nome = 'CA 01 | 2026' where fonte = 'meta' and conta_id is null;
update public.campanhas_trafego set conta_id = '971232521868866', conta_nome = 'CA 01 | 2026' where fonte = 'meta' and conta_id is null;
update public.conjuntos_trafego set conta_id = '971232521868866', conta_nome = 'CA 01 | 2026' where fonte = 'meta' and conta_id is null;
update public.criativos_trafego set conta_id = '971232521868866', conta_nome = 'CA 01 | 2026' where fonte = 'meta' and conta_id is null;

-- O apagar do gravador é por (conta, período). Sem índice, cada sync de 5
-- minutos varreria a tabela inteira — e é justamente o de 5 minutos que roda 288
-- vezes por dia.
create index if not exists metricas_trafego_conta_data
  on public.metricas_trafego (conta_id, data);

-- ── 2. Uma linha por conta ──────────────────────────────────────────────────

create table if not exists public.trafego_contas (
  conta_id      text primary key,
  conta_nome    text,
  -- 1 = ativa. 2 = desativada, 3 = saldo pendente, 9 = em período de carência.
  -- Conta que não é 1 não veicula, e é a primeira coisa a olhar quando o número
  -- de uma conta despenca.
  status        integer,
  saldo         numeric,
  moeda         text,
  -- Agregado do período máximo, com ALCANCE ÚNICO como o Gerenciador mostra.
  -- Alcance não se soma entre contas: quem viu anúncio de duas contas conta
  -- duas vezes. A tela tem de dizer isso quando mostrar o total.
  alcance       integer,
  frequencia    numeric,
  impressoes    integer,
  cliques       integer,
  gasto         numeric,
  since         date,
  until         date,
  pixel_nome    text,
  pixel_ultimo  timestamptz,
  -- A hora do último sync QUE DEU CERTO desta conta. Separada por conta porque
  -- a pausa de 06/09 a 14/09 passou uma semana despercebida com um número só.
  ultima_sync   timestamptz,
  -- O último erro, e quando. Limpo no sync seguinte que der certo.
  erro          text,
  erro_em       timestamptz
);

alter table public.trafego_contas enable row level security;

drop policy if exists "trafego_contas ler" on public.trafego_contas;
create policy "trafego_contas ler" on public.trafego_contas
  for select to authenticated
  using ((select public.perfil_ativo()));

-- ── 3. O gravador ───────────────────────────────────────────────────────────
--
-- `p` é um documento só:
--
--   conta      { id, nome, status, saldo, moeda }                 obrigatório
--   since, until                                                  o período das métricas
--   metricas   [...] linhas diárias                                null = não mexe
--   campanhas, conjuntos, criativos   [...] agregados              null = não mexe
--   agregado   { alcance, frequencia, impressoes, cliques, gasto } null = não mexe
--   pixel      { nome, ultimo }                                   null = não mexe
--
-- NULL e LISTA VAZIA não são a mesma coisa, e isso é o ponto: null quer dizer
-- "não consultei ou a Meta falhou — deixe o que está". Lista vazia quer dizer
-- "consultei, e não há nada" — e nesse caso também NÃO apaga, pela regra que o
-- sync antigo já tinha: falha silenciosa da Meta (token sem permissão devolve
-- lista vazia sem erro) nunca pode zerar o que já foi gravado.

create or replace function public.trafego_gravar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conta   text := p #>> '{conta,id}';
  v_nome    text := p #>> '{conta,nome}';
  v_since   date := (p ->> 'since')::date;
  v_until   date := (p ->> 'until')::date;
  v_quem    uuid := auth.uid();
  n_met int := 0; n_camp int := 0; n_conj int := 0; n_cri int := 0;
begin
  -- Quem pode: o cron (service_role), a conexão direta dos scripts (postgres) e
  -- a equipe pelo botão. `session_user` e não `current_user`: dentro de
  -- `security definer` o current_user vira o dono da função.
  if not (
    coalesce(auth.role(), '') = 'service_role'
    or session_user = 'postgres'
    or public.perfil_equipe()
  ) then
    raise exception 'Sem permissão para gravar tráfego.';
  end if;

  if v_conta is null then
    raise exception 'trafego_gravar: falta conta.id';
  end if;

  -- Métricas diárias do período
  if jsonb_typeof(p -> 'metricas') = 'array' and jsonb_array_length(p -> 'metricas') > 0 then
    delete from metricas_trafego
     where fonte = 'meta' and conta_id = v_conta
       and data between v_since and v_until;

    insert into metricas_trafego
      (data, campaign_id, campanha, alcance, impressoes, cliques, gasto, frequencia,
       resultados, tipo_resultado, objetivo, status, orcamento,
       fonte, criado_por, conta_id, conta_nome)
    select r.data, r.campaign_id, r.campanha, r.alcance, r.impressoes, r.cliques, r.gasto, r.frequencia,
           r.resultados, r.tipo_resultado, r.objetivo, r.status, r.orcamento,
           'meta', v_quem, v_conta, v_nome
      from jsonb_populate_recordset(null::metricas_trafego, p -> 'metricas') r;
    get diagnostics n_met = row_count;
  end if;

  -- Campanhas agregadas
  if jsonb_typeof(p -> 'campanhas') = 'array' and jsonb_array_length(p -> 'campanhas') > 0 then
    delete from campanhas_trafego where fonte = 'meta' and conta_id = v_conta;
    insert into campanhas_trafego
      (campaign_id, campanha, objetivo, status, orcamento, gasto, alcance, frequencia,
       impressoes, cliques, resultados, tipo_resultado, fonte, criado_por, conta_id, conta_nome)
    select r.campaign_id, r.campanha, r.objetivo, r.status, r.orcamento, r.gasto, r.alcance, r.frequencia,
           r.impressoes, r.cliques, r.resultados, r.tipo_resultado, 'meta', v_quem, v_conta, v_nome
      from jsonb_populate_recordset(null::campanhas_trafego, p -> 'campanhas') r;
    get diagnostics n_camp = row_count;
  end if;

  -- Conjuntos agregados
  if jsonb_typeof(p -> 'conjuntos') = 'array' and jsonb_array_length(p -> 'conjuntos') > 0 then
    delete from conjuntos_trafego where fonte = 'meta' and conta_id = v_conta;
    insert into conjuntos_trafego
      (adset_id, nome, campanha, status, otimizacao, orcamento, gasto, alcance,
       impressoes, cliques, resultados, tipo_resultado, fonte, criado_por, conta_id, conta_nome)
    select r.adset_id, r.nome, r.campanha, r.status, r.otimizacao, r.orcamento, r.gasto, r.alcance,
           r.impressoes, r.cliques, r.resultados, r.tipo_resultado, 'meta', v_quem, v_conta, v_nome
      from jsonb_populate_recordset(null::conjuntos_trafego, p -> 'conjuntos') r;
    get diagnostics n_conj = row_count;
  end if;

  -- Criativos agregados. A arte que já está no banco vale mais que null: se a
  -- busca da imagem falhar num sync, o criativo não pode perder a que já tinha.
  if jsonb_typeof(p -> 'criativos') = 'array' and jsonb_array_length(p -> 'criativos') > 0 then
    create temp table if not exists _arte_anterior (ad_id text primary key, url text) on commit drop;
    truncate _arte_anterior;
    insert into _arte_anterior
      select distinct on (ad_id) ad_id, thumbnail_url
        from criativos_trafego
       where fonte = 'meta' and conta_id = v_conta and thumbnail_url is not null;

    delete from criativos_trafego where fonte = 'meta' and conta_id = v_conta;
    insert into criativos_trafego
      (ad_id, ad_name, campanha, thumbnail_url, status, objetivo, gasto, impressoes,
       cliques, resultados, tipo_resultado, fonte, criado_por, conta_id, conta_nome)
    select r.ad_id, r.ad_name, r.campanha, coalesce(r.thumbnail_url, a.url), r.status, r.objetivo,
           r.gasto, r.impressoes, r.cliques, r.resultados, r.tipo_resultado,
           'meta', v_quem, v_conta, v_nome
      from jsonb_populate_recordset(null::criativos_trafego, p -> 'criativos') r
      left join _arte_anterior a on a.ad_id = r.ad_id;
    get diagnostics n_cri = row_count;
  end if;

  -- A conta. Status e saldo sempre; agregado e pixel só quando vieram.
  insert into trafego_contas (conta_id, conta_nome, status, saldo, moeda, ultima_sync, erro, erro_em)
  values (v_conta, v_nome, (p #>> '{conta,status}')::int, (p #>> '{conta,saldo}')::numeric,
          p #>> '{conta,moeda}', now(), null, null)
  on conflict (conta_id) do update
     set conta_nome = excluded.conta_nome,
         status     = coalesce(excluded.status, trafego_contas.status),
         saldo      = coalesce(excluded.saldo, trafego_contas.saldo),
         moeda      = coalesce(excluded.moeda, trafego_contas.moeda),
         ultima_sync = now(), erro = null, erro_em = null;

  if jsonb_typeof(p -> 'agregado') = 'object' then
    update trafego_contas
       set alcance    = (p #>> '{agregado,alcance}')::int,
           frequencia = (p #>> '{agregado,frequencia}')::numeric,
           impressoes = (p #>> '{agregado,impressoes}')::int,
           cliques    = (p #>> '{agregado,cliques}')::int,
           gasto      = (p #>> '{agregado,gasto}')::numeric,
           since = v_since, until = v_until
     where conta_id = v_conta;
  end if;

  if jsonb_typeof(p -> 'pixel') = 'object' then
    update trafego_contas
       set pixel_nome = p #>> '{pixel,nome}',
           pixel_ultimo = (p #>> '{pixel,ultimo}')::timestamptz
     where conta_id = v_conta;
  end if;

  -- O selo global que a tela antiga lê. Continua valendo até a tela nova ler
  -- `trafego_contas`, e passa a significar "o último sync de qualquer conta".
  update trafego_sync set ultima_sync = now() where id = 1;

  return jsonb_build_object('conta', v_conta, 'metricas', n_met, 'campanhas', n_camp,
                            'conjuntos', n_conj, 'criativos', n_cri);
end $$;

-- O erro de uma conta, sem apagar nada dela.
create or replace function public.trafego_registrar_erro(p_conta text, p_nome text, p_erro text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (coalesce(auth.role(), '') = 'service_role' or session_user = 'postgres' or public.perfil_equipe()) then
    raise exception 'Sem permissão.';
  end if;
  insert into trafego_contas (conta_id, conta_nome, erro, erro_em)
  values (p_conta, p_nome, left(p_erro, 500), now())
  on conflict (conta_id) do update
     set erro = excluded.erro, erro_em = excluded.erro_em,
         conta_nome = coalesce(excluded.conta_nome, trafego_contas.conta_nome);
end $$;

revoke all on function public.trafego_gravar(jsonb) from public, anon;
grant execute on function public.trafego_gravar(jsonb) to authenticated, service_role;
revoke all on function public.trafego_registrar_erro(text, text, text) from public, anon;
grant execute on function public.trafego_registrar_erro(text, text, text) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────

select 'métricas sem conta' as o_que, count(*)::int as linhas
  from public.metricas_trafego where fonte = 'meta' and conta_id is null
union all
select 'campanhas sem conta', count(*)::int from public.campanhas_trafego where fonte = 'meta' and conta_id is null
union all
select 'criativos sem conta', count(*)::int from public.criativos_trafego where fonte = 'meta' and conta_id is null
union all
select 'linhas em trafego_contas', count(*)::int from public.trafego_contas;
