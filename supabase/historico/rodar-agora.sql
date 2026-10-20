-- ============================================================================
-- RODAR AGORA — os dois arquivos, na ordem certa
-- ============================================================================
--
-- Cole INTEIRO no SQL Editor do Supabase e rode uma vez só.
--
-- É a junção de `ingestao.sql` e `papel-atendente.sql`. A ordem importa: o
-- segundo mexe em políticas de tabelas e colunas que o primeiro cria.
--
-- Seguro repetir: tudo é `create or replace`, `add column if not exists` e
-- `drop policy if exists`. Na dúvida, rode de novo.
--
-- A conferência vem no fim, em forma de tabela — o editor do Supabase mostra
-- apenas o resultado da ÚLTIMA consulta e não exibe `raise notice` nenhum.

-- ============================================================================
-- INGESTÃO — uma mensagem, uma ida ao banco
-- ============================================================================
--
-- Rode depois de `crm.sql`.
--
-- ── O NÚMERO QUE MOTIVA ESTE ARQUIVO ────────────────────────────────────────
--
-- Mil leads por dia, cerca de quinze mensagens por conversa, e a Evolution
-- avisa nas duas direções: ~30 mil chamadas de webhook por dia. Tráfego pago
-- não chega em média — chega em rajada, quando o anúncio sobe.
--
-- O webhook fazia de 6 a 10 idas ao banco POR MENSAGEM: achava a conversa,
-- gravava, relia, consultava a carga, consultava a última atribuição,
-- atualizava, registrava, e o cadastro fazia mais duas ou três. São ~240 mil
-- consultas diárias só para ingerir, e cada uma com a latência da rede entre a
-- Vercel e o banco. Na rajada, enfileira.
--
-- Aqui vira UMA chamada, atômica.
--
-- ── E UM BUG QUE SÓ APARECE EM VOLUME ───────────────────────────────────────
--
-- A Evolution reenvia quando não recebe 200 rápido. O `wa_id` único impedia a
-- mensagem de duplicar — mas o código seguia em frente e atualizava o contador
-- e os carimbos de SLA OUTRA VEZ. Em baixo volume ninguém nota; a 30 mil
-- chamadas/dia, o total de mensagens infla e a primeira resposta pode ser
-- recarimbada.
--
-- Agora o insert da mensagem devolve nada quando é repetição, e a função para
-- ali. Repetir a chamada passa a ser inofensivo de verdade.

-- As colunas do cadastro semiautomático vêm ANTES da função que as escreve.
-- O plpgsql só resolve nome de coluna na primeira execução, então a ordem
-- errada passaria na criação e falharia em produção, na primeira mensagem.
alter table public.conversas add column if not exists nome_sugerido text;
alter table public.conversas add column if not exists municipio_sugerido text;
alter table public.conversas add column if not exists bairro_sugerido text;
alter table public.conversas add column if not exists indicado_por text;
alter table public.conversas add column if not exists lideranca_id uuid references public.liderancas(id) on delete set null;
alter table public.conversas add column if not exists cadastrado_em timestamptz;
alter table public.conversas add column if not exists cadastrado_por uuid references public.profiles(id) on delete set null;

create or replace function public.receber_mensagem(
  p_telefone   text,
  p_nome       text,
  p_instancia  text,
  p_wa_id      text,
  p_direcao    text,
  p_tipo       text,
  p_texto      text,
  p_resumo     text,
  p_midia_url  text,
  p_midia_mime text,
  p_duracao    int,
  p_status     text,
  p_momento    timestamptz,
  p_bruto      jsonb,
  -- Lidos do texto pelo próprio webhook, sem consulta nenhuma. Viajam junto
  -- para o cadastro semiautomático não custar outra ida ao banco.
  p_municipio_sug text default null,
  p_bairro_sug    text default null,
  p_indicou       text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversa   bigint;
  v_msg        bigint;
  v_conv       public.conversas%rowtype;
  v_atribuir   boolean := false;
begin
  -- 1. A conversa. `on conflict` resolve a corrida onde ela acontece: três
  --    frases seguidas chegam quase juntas, e dois selects responderiam "não
  --    existe" ao mesmo tempo.
  insert into public.conversas (telefone, nome, instancia)
  values (p_telefone, p_nome, p_instancia)
  on conflict (telefone) do update set
    -- O nome só é preenchido, nunca sobrescrito: quem cadastrou na mão sabia
    -- mais do que o apelido que a pessoa pôs no WhatsApp.
    nome          = coalesce(conversas.nome, excluded.nome),
    atualizado_em = now()
  returning id into v_conversa;

  -- 2. A mensagem. Se já existe, PARA AQUI — é reenvio da Evolution, e seguir
  --    em frente contaria a mesma mensagem duas vezes.
  insert into public.mensagens (
    conversa_id, wa_id, telefone, direcao, tipo, texto,
    midia_url, midia_mime, duracao_seg, status, momento, bruto
  )
  values (
    v_conversa, p_wa_id, p_telefone, p_direcao, p_tipo, p_texto,
    p_midia_url, p_midia_mime, p_duracao, p_status, p_momento, p_bruto
  )
  on conflict (wa_id) do nothing
  returning id into v_msg;

  if v_msg is null then
    return jsonb_build_object('conversa_id', v_conversa, 'repetida', true, 'atribuir', false);
  end if;

  select * into v_conv from public.conversas where id = v_conversa;

  -- 3. A conversa em dia, num update só.
  --
  --    O contador soma no BANCO (`total_mensagens + 1`) em vez de ser lido e
  --    reescrito pelo código: duas mensagens no mesmo instante perderiam
  --    contagem, e com rajada de anúncio isso deixa de ser hipótese.
  update public.conversas set
    ultima_msg      = p_resumo,
    ultima_msg_at   = p_momento,
    ultima_direcao  = p_direcao,
    atualizado_em   = p_momento,
    total_mensagens = total_mensagens + 1,

    -- Os carimbos de SLA nunca são reescritos: são a demora que eles existem
    -- para denunciar.
    primeira_msg_at = case
      when p_direcao = 'inbound' and primeira_msg_at is null then p_momento
      else primeira_msg_at end,
    primeira_resp_at = case
      when p_direcao = 'outbound' and primeira_resp_at is null then p_momento
      else primeira_resp_at end,

    -- EIXO ZERO. Se a PRIMEIRA mensagem da conversa é nossa, isto é disparo e
    -- não lead — e disparo não tem SLA, porque ninguém esperava resposta.
    tipo = case
      when p_direcao = 'outbound' and primeira_msg_at is null and primeira_resp_at is null
      then 'disparo' else tipo end,

    -- Mensagem nova reabre conversa encerrada: a pessoa voltou, e continuar
    -- encerrada a esconderia da fila.
    -- ENCERRADA FICA ENCERRADA.
    --
    -- Aqui era `when p_direcao = 'inbound' then null` — mensagem recebida
    -- REABRIA a conversa e a jogava de volta na fila.
    --
    -- Regra do Emanuel (28/08): encerrar é uma decisão da atendente, e a
    -- mensagem seguinte do eleitor não a desfaz. O que ele manda depois chega
    -- na aba Encerradas, que passa a ser ordenada pela última mensagem — some
    -- da fila de trabalho, não da vista.
    --
    -- Sem isto, encerrar não encerrava nada: quem respondesse "obrigado" depois
    -- do atendimento pronto voltava para o topo como se fosse lead novo, e a
    -- fila nunca esvaziava.
    encerrada_em = encerrada_em,

    -- SUGESTÕES. Só preenchem o que está vazio, e nunca depois de a atendente
    -- ter confirmado: o que ela conferiu vale mais do que o que um regex leu na
    -- mensagem seguinte.
    nome_sugerido      = case when cadastrado_em is null
                          then coalesce(nome_sugerido, nullif(p_nome, '')) else nome_sugerido end,
    municipio_sugerido = case when cadastrado_em is null
                          then coalesce(municipio_sugerido, p_municipio_sug) else municipio_sugerido end,
    bairro_sugerido    = case when cadastrado_em is null
                          then coalesce(bairro_sugerido, p_bairro_sug) else bairro_sugerido end,
    indicado_por       = coalesce(indicado_por, p_indicou)
  where id = v_conversa;

  -- 4. Precisa distribuir? Só lead novo sem dono. É UMA vez por lead, não por
  --    mensagem — em regime, a escolha do atendente nem roda.
  v_atribuir := p_direcao = 'inbound' and v_conv.atendente_id is null;

  return jsonb_build_object(
    'conversa_id', v_conversa,
    'repetida',    false,
    'atribuir',    v_atribuir,
    'demandas',    coalesce(to_jsonb(v_conv.demandas), '[]'::jsonb),
    'nome',        v_conv.nome,
    'municipio',   v_conv.municipio
  );
end;
$$;

do $$
declare a text;
begin
  -- A assinatura e longa; buscar pelo nome evita erro de digitacao na lista de tipos.
  for a in select oid::regprocedure::text from pg_proc
           where proname = 'receber_mensagem' and pronamespace = 'public'::regnamespace loop
    execute format('revoke all on function %s from public, authenticated', a);
    execute format('grant execute on function %s to service_role', a);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ATRIBUIR, também numa chamada
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Roda uma vez por lead. Grava o dono e o histórico juntos — separados, uma
-- falha no meio deixaria o painel mostrando carga que não existe.

create or replace function public.atribuir_conversa(
  p_conversa  bigint,
  p_atendente uuid,
  p_regra     text,
  p_motivo    text default 'automatica'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel text;
  v_antes uuid;
begin
  select telefone, atendente_id into v_tel, v_antes
  from public.conversas where id = p_conversa;
  if v_tel is null then return false; end if;

  update public.conversas
     set atendente_id = p_atendente, atribuido_em = now()
   where id = p_conversa;

  insert into public.atribuicoes (conversa_id, telefone, de_atendente, para_atendente, motivo, regra)
  values (p_conversa, v_tel, v_antes, p_atendente, p_motivo, p_regra);

  return true;
end;
$$;

revoke all on function public.atribuir_conversa(bigint, uuid, text, text) from public;
grant execute on function public.atribuir_conversa(bigint, uuid, text, text) to service_role, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- A BUSCA DE DUPLICADO QUE ERA VARREDURA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O código procurava a pessoa com `ilike '%99233%'` sobre `liderancas`. Isso
-- NÃO usa índice: é leitura sequencial da tabela inteira, a cada consulta.
--
-- Hoje são 29 mil linhas. A mil leads por dia, a base dobra em um mês — é a
-- peça que piora sozinha com o tempo.
--
-- A coluna guarda só os dígitos, e o índice é sobre ela. A busca deixa de ser
-- "contém" e passa a ser igualdade, que o índice resolve.

alter table public.liderancas add column if not exists telefone_digitos text;

create or replace function public.so_digitos(v text)
returns text language sql immutable as $$
  select regexp_replace(coalesce(v, ''), '\D', '', 'g');
$$;

-- Preenche o que já existe. Roda uma vez, pode demorar alguns segundos.
update public.liderancas
   set telefone_digitos = right(public.so_digitos(telefone), 11)
 where telefone is not null and telefone_digitos is null;

-- Mantém em dia daqui para frente, sem o código precisar lembrar.
create or replace function public.liderancas_normaliza_telefone()
returns trigger language plpgsql as $$
begin
  new.telefone_digitos := nullif(right(public.so_digitos(new.telefone), 11), '');
  return new;
end;
$$;

drop trigger if exists liderancas_normaliza_telefone on public.liderancas;
create trigger liderancas_normaliza_telefone
  before insert or update of telefone on public.liderancas
  for each row execute function public.liderancas_normaliza_telefone();

create index if not exists liderancas_telefone_digitos
  on public.liderancas (telefone_digitos)
  where telefone_digitos is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- O CADASTRO VIRA SUGESTÃO, NÃO ESCRITA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Antes o webhook escrevia direto em `liderancas` ao ler "Vim pela indicação
-- de". Com mil leads por dia isso enche a base de linha meia-boca: nome que era
-- apelido do WhatsApp, município adivinhado de uma frase solta, duplicado que
-- passou pela busca.
--
-- Agora ele só PROPÕE. A atendente vê os três campos na ficha — telefone já
-- preenchido, nome e município para conferir — e é o clique dela que escreve.
--
-- Ganho de arquitetura de brinde: a busca por duplicado sai do caminho quente.
-- Ela roda no clique, uma vez por lead, em vez de a cada mensagem.

-- A fila de quem ainda precisa de confirmação. Índice parcial porque é uma
-- pergunta de exceção: "quem ainda não virou cadastro?"
create index if not exists conversas_a_cadastrar
  on public.conversas (ultima_msg_at desc)
  where cadastrado_em is null;

/**
 * O clique da atendente. Confere duplicado, grava e amarra a conversa à pessoa.
 *
 * Numa transação só: sem isso, uma falha entre gravar a pessoa e marcar a
 * conversa deixaria a mesma gente entrando duas vezes no próximo clique.
 */
create or replace function public.confirmar_cadastro(
  p_conversa   bigint,
  p_nome       text,
  p_municipio  text,
  p_bairro     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tel     text;
  v_dig     text;
  v_pai     uuid;
  v_id      uuid;
  v_ja      uuid;
begin
  select telefone, lideranca_id into v_tel, v_pai from public.conversas where id = p_conversa;
  if v_tel is null then
    return jsonb_build_object('ok', false, 'erro', 'conversa não encontrada');
  end if;

  v_dig := right(public.so_digitos(v_tel), 11);

  -- Agora é igualdade sobre coluna indexada, não `ilike '%...%'` varrendo a
  -- tabela inteira.
  select id into v_ja from public.liderancas where telefone_digitos = v_dig limit 1;

  if v_ja is not null then
    update public.liderancas set
      nome      = coalesce(nullif(trim(p_nome), ''), nome),
      municipio = coalesce(municipio, nullif(trim(p_municipio), '')),
      bairro    = coalesce(bairro, nullif(trim(p_bairro), ''))
    where id = v_ja;
    v_id := v_ja;
  else
    insert into public.liderancas (nome, telefone, municipio, bairro, parent_id, tipo, created_via)
    values (nullif(trim(p_nome), ''), v_tel, nullif(trim(p_municipio), ''),
            nullif(trim(p_bairro), ''), v_pai, 'lead', 'whatsapp')
    returning id into v_id;
  end if;

  update public.conversas set
    nome           = coalesce(nullif(trim(p_nome), ''), nome),
    municipio      = nullif(trim(p_municipio), ''),
    bairro         = nullif(trim(p_bairro), ''),
    lideranca_id   = v_id,
    cadastrado_em  = now(),
    cadastrado_por = auth.uid()
  where id = p_conversa;

  return jsonb_build_object('ok', true, 'lideranca_id', v_id, 'ja_existia', v_ja is not null);
end;
$$;

revoke all on function public.confirmar_cadastro(bigint, text, text, text) from public;
grant execute on function public.confirmar_cadastro(bigint, text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÍNDICES DA FILA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A fila deixa de ser filtrada no navegador. Em três meses a mil leads/dia são
-- ~90 mil conversas; carregar 200 e filtrar na memória do navegador para de
-- funcionar muito antes disso.

-- "as minhas, abertas, mais recentes primeiro"
create index if not exists conversas_minhas
  on public.conversas (atendente_id, ultima_msg_at desc)
  where encerrada_em is null;

-- "as sem dono, quem espera há mais tempo primeiro" — a consulta mais cara e a
-- que mais importa, então ganha índice parcial próprio.
create index if not exists conversas_orfas
  on public.conversas (primeira_msg_at)
  where atendente_id is null and encerrada_em is null;

-- busca por nome e telefone na fila
create index if not exists conversas_telefone on public.conversas (telefone);



-- ═════════════════════════════════════════════════════════════════════════════
-- SEGUNDA PARTE: os papéis do atendimento
-- ═════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- OS PAPÉIS DO ATENDIMENTO — supervisor e atendente
-- ============================================================================
--
-- Rode DEPOIS de `crm.sql` e `trancar-base.sql`.
--
-- Hoje existem dois papéis de verdade: `admin` (as 7 contas da equipe, que veem
-- tudo) e `lideranca` (as 43 do portal, que veem a própria rede). Não há nada
-- entre os dois — e é justamente onde a atendente precisa ficar.
--
-- Ela precisa de MENOS que a equipe: nada de Lideranças, Rede, Tráfego,
-- Estratégia. A base de 29 mil pessoas não é ferramenta de atendimento; é o
-- ativo que a campanha inteira protege, e vazamento por ali não se desfaz.
--
-- E de MAIS que a liderança: as conversas, as mensagens, as etiquetas e o
-- roteiro — o material do turno dela.
--
-- ── TRÊS FUNÇÕES, TRÊS CÍRCULOS ─────────────────────────────────────────────
--
--   perfil_equipe()       admin e usuário interno. Vê a plataforma toda.
--   perfil_supervisao()   equipe MAIS supervisor. Manda no atendimento: monta o
--                         fluxo, cria etiqueta, define quem está de plantão.
--   perfil_atendimento()  supervisão MAIS atendente. Abre a caixa de entrada.
--   (liderança)           nenhuma delas. Só a própria sub-rede.
--
-- Os círculos são concêntricos: quem é da equipe supervisiona, quem
-- supervisiona atende. O contrário nunca — a atendente não monta o fluxo, e o
-- supervisor não abre a base de 29 mil.
--
-- POR QUE O SUPERVISOR NÃO VÊ A BASE. Ele manda no atendimento, não na
-- campanha. Quem coordena plantão precisa da fila, do roteiro e do painel —
-- não da lista de pessoas nem do gasto de tráfego. Menos gente com acesso à
-- base é menos superfície, e o cargo não perde nada com isso.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. `perfil_equipe` passa a excluir o atendente
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sem esta linha o papel novo não protegeria nada: `atendente` não é
-- 'lideranca' e não tem vínculo com a rede, então passaria pela regra antiga
-- como se fosse da casa — e leria as 29 mil.

create or replace function public.perfil_equipe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') not in ('lideranca', 'atendente', 'supervisor')
      and (
        p.role = 'admin'
        or not exists (select 1 from public.liderancas l where l.auth_uid = p.id)
      )
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Quem pode atender
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.perfil_supervisao()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') not in ('lideranca', 'atendente')
  );
$$;

create or replace function public.perfil_atendimento()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'ativo'
      and coalesce(p.role, 'usuario') <> 'lideranca'
  );
$$;

revoke all on function public.perfil_equipe() from public;
revoke all on function public.perfil_supervisao() from public;
revoke all on function public.perfil_atendimento() from public;
grant execute on function public.perfil_equipe() to authenticated;
grant execute on function public.perfil_supervisao() to authenticated;
grant execute on function public.perfil_atendimento() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. As tabelas do atendimento abrem para o papel novo
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só estas. `liderancas`, `demandas`, `metricas_trafego` e as demais continuam
-- em `perfil_equipe()` — a atendente não as alcança nem digitando o endereço.

do $$
declare
  t text;
  tabelas text[] := array[
    'conversas', 'mensagens', 'conversa_tags', 'atribuicoes'
  ];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists %I on public.%I', t || ' equipe', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.perfil_atendimento())
        with check (public.perfil_atendimento())
    $f$, t || ' equipe', t);
  end loop;
end $$;

-- Catálogo de etiquetas, roteiro e lista de atendentes: a atendente LÊ, o
-- SUPERVISOR escreve. Ela precisa ver as etiquetas para aplicar e o roteiro
-- para seguir — mas montar o fluxo e definir o plantão é decisão de quem
-- coordena, e é exatamente essa a fronteira do papel novo.
do $$
declare
  t text;
  tabelas text[] := array['tags', 'fluxos', 'fluxo_passos', 'atendentes'];
begin
  foreach t in array tabelas loop
    execute format('drop policy if exists %I on public.%I', t || ' equipe', t);
    execute format('drop policy if exists %I on public.%I', t || ' le', t);
    execute format($f$
      create policy %I on public.%I
        for select to authenticated
        using (public.perfil_atendimento())
    $f$, t || ' le', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.perfil_supervisao())
        with check (public.perfil_supervisao())
    $f$, t || ' equipe', t);
  end loop;
end $$;

-- A atendente liga e desliga o próprio plantão sem ser da equipe. É o
-- interruptor que impede lead novo de cair em quem foi almoçar.
drop policy if exists "atendentes proprio" on public.atendentes;
create policy "atendentes proprio" on public.atendentes
  for update to authenticated
  using (id = auth.uid() or public.perfil_supervisao())
  with check (id = auth.uid() or public.perfil_supervisao());


-- ═════════════════════════════════════════════════════════════════════════════
-- A PROVA — o que precisa ter dado certo
-- ═════════════════════════════════════════════════════════════════════════════

select * from (
  select 1 as ordem, 'FUNCAO' as bloco, p.proname::text as item, 'criada' as estado
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('receber_mensagem','atribuir_conversa','confirmar_cadastro',
                      'so_digitos','perfil_equipe','perfil_supervisao','perfil_atendimento')

  union all
  select 2, 'INDICE', indexname::text,
         case when indexdef like '%WHERE%' then 'parcial' else 'ok' end
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('conversas_minhas','conversas_orfas','conversas_telefone',
                      'conversas_a_cadastrar','liderancas_telefone_digitos')

  union all
  select 3, 'TELEFONE NORMALIZADO', 'liderancas com digitos',
         count(*) filter (where telefone_digitos is not null)::text || ' de ' || count(*)::text
  from public.liderancas

  union all
  select 4, 'ATENDENTE ALCANCA', tablename::text, policyname::text
  from pg_policies
  where schemaname = 'public' and qual like '%perfil_atendimento%'

  union all
  select 5, 'SO SUPERVISOR ESCREVE', tablename::text, policyname::text
  from pg_policies
  where schemaname = 'public' and qual like '%perfil_supervisao%'

  union all
  select 6, 'PAPEIS ATIVOS', coalesce(role, '(sem papel)')::text, count(*)::text
  from public.profiles where status = 'ativo' group by role
) prova
order by ordem, item;
