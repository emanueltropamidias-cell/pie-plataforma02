-- ============================================================================
-- CRM DE ATENDIMENTO — o nosso, do zero
-- ============================================================================
--
-- UM ARQUIVO SÓ, na ordem certa. Cole inteiro no SQL Editor e rode. Termina com
-- uma tabela de conferência, porque o editor do Supabase mostra apenas o
-- resultado da última consulta e não exibe `raise notice` nenhum.
--
-- Seguro repetir: tudo é `create if not exists`, `create or replace` e
-- `drop policy if exists`. Na dúvida, rode de novo.
--
-- ── POR QUE UMA TABELA NOVA, E NÃO `atendimentos` ───────────────────────────
--
-- `atendimentos` é o ESPELHO do GabiFlow. Carrega o id que ele atribuía, o
-- vocabulário de status dele (waiting, active, closed, template_pending), a
-- coluna `assigned_to` em texto solto, e telefone repetido — porque lá a mesma
-- pessoa podia ter várias conversas.
--
-- Construir por cima disso arrastaria a forma dele para dentro do sistema novo
-- para sempre: índice parcial para contornar o telefone duplicado, sequência
-- começando em 1 bilhão para não colidir com os ids dele, uma coluna dizendo de
-- qual sistema cada linha veio. Trabalho de convivência, não de construção.
--
-- Então `atendimentos` fica onde está, congelado: é o ARQUIVO das ~400
-- conversas importadas, e continua alimentando o painel de métricas com o
-- histórico. O que nasce daqui para frente nasce em `conversas`, com a forma
-- que o PIE precisa e nenhuma que ele não precisa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. QUEM É DA EQUIPE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Repetida aqui de propósito, idêntica à de `trancar-base.sql`, para este
-- arquivo rodar sozinho em qualquer ordem. `create or replace` com o mesmo
-- corpo é inofensivo se a função já existir.

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
      and coalesce(p.role, 'usuario') <> 'lideranca'
      and (
        p.role = 'admin'
        or not exists (select 1 from public.liderancas l where l.auth_uid = p.id)
      )
  );
$$;

revoke all on function public.perfil_equipe() from public;
grant execute on function public.perfil_equipe() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A EQUIPE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Estende `profiles` em vez de criar outra lista de gente: duas listas sempre
-- divergem no dia em que alguém sai da campanha.
--
-- `capacidade` é o teto de conversas ABERTAS ao mesmo tempo, não por dia. É o
-- que impede a distribuição de empilhar quarenta conversas em quem já está
-- afogada — e o motivo de rodízio simples não servir: rodízio dá a vez, não
-- olha a carga.
--
-- `disponivel` é o interruptor da própria atendente. Sem ele, quem foi almoçar
-- continua recebendo lead novo, e a pessoa espera uma hora por alguém que não
-- está lá. Isso vira "não atendido", que é a métrica que a campanha mais quer
-- derrubar.

create table if not exists public.atendentes (
  id            uuid primary key references public.profiles(id) on delete cascade,
  nome          text not null,
  disponivel    boolean not null default false,
  capacidade    int not null default 20 check (capacidade > 0),
  -- Vazio = generalista, atende qualquer demanda. Preenchido = especialista, e
  -- a distribuição só manda o que está na lista.
  demandas      text[] not null default '{}',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists atendentes_disponivel on public.atendentes (disponivel)
  where disponivel;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. AS CONVERSAS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- UMA LINHA POR TELEFONE. No WhatsApp não existe "chamado": existe um fio
-- contínuo com cada pessoa. Se cada retorno abrisse linha nova, a mesma pessoa
-- apareceria várias vezes no painel e o total de leads inflaria — que é
-- exatamente o erro que os dois eixos existem para evitar.
--
-- Aqui o telefone é único de verdade, sem índice parcial: não há histórico
-- torto para conviver.

create table if not exists public.conversas (
  id            bigserial primary key,
  telefone      text not null unique,        -- DDI+DDD+número, só dígitos
  nome          text,
  foto_url      text,

  -- Qual número da campanha recebeu. A operação pode ter mais de um (atendimento
  -- e disparo), e sem isto as duas voltam a se misturar.
  instancia     text,

  -- ── EIXO ZERO: quem começou ──────────────────────────────────────────────
  -- lead    = a PESSOA escreveu primeiro. Cabe SLA: ela esperou.
  -- disparo = a CAMPANHA escreveu primeiro. SLA não existe: ninguém esperava.
  -- Sem esta separação, quem ignorou um disparo entra na mesma conta de quem
  -- veio do tráfego e esfriou.
  tipo          text not null default 'lead' check (tipo in ('lead', 'disparo')),

  -- ── EIXO 1: uma categoria por pessoa. A soma fecha 100%. ─────────────────
  status_lead   text,
  -- ── EIXO 2: independente do eixo 1. Zero, uma ou várias. ─────────────────
  demandas      text[] not null default '{}',

  municipio     text,
  bairro        text,
  origem        text,                         -- criativo ou campanha de origem

  -- ── SLA: o par que separa "não respondeu" de "não atendido" ─────────────
  -- Sem os dois, os casos viram o mesmo número e o pior deles some.
  primeira_msg_at   timestamptz,              -- quando a pessoa escreveu
  primeira_resp_at  timestamptz,              -- quando ALGUÉM respondeu (null = nunca)
  ultima_direcao    text,                     -- inbound = a bola está com a gente

  -- ── quem atende ──────────────────────────────────────────────────────────
  atendente_id  uuid references public.profiles(id) on delete set null,
  atribuido_em  timestamptz,
  encerrada_em  timestamptz,                  -- fora da carga de quem atende

  fluxo_estagio text,                         -- onde está no roteiro

  -- ── prévia da lista, para não ler `mensagens` a cada linha da fila ──────
  ultima_msg      text,
  ultima_msg_at   timestamptz,
  total_mensagens int not null default 0,

  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists conversas_status      on public.conversas (status_lead);
create index if not exists conversas_municipio   on public.conversas (municipio);
create index if not exists conversas_atendente   on public.conversas (atendente_id);
create index if not exists conversas_recentes    on public.conversas (ultima_msg_at desc);
-- A carga de cada atendente: a consulta mais chamada do CRM, roda a cada mensagem.
create index if not exists conversas_carga       on public.conversas (atendente_id)
  where encerrada_em is null;
-- A fila que importa: quem escreveu e não foi respondido.
create index if not exists conversas_sem_resposta on public.conversas (primeira_msg_at)
  where primeira_resp_at is null and tipo = 'lead';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AS MENSAGENS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sem GabiFlow, ninguém mais guarda o conteúdo. Se o PIE não gravar cada
-- mensagem, a conversa existe só no aparelho de quem atende — e some quando a
-- pessoa troca de celular ou sai da campanha.
--
-- `wa_id` é ÚNICO de propósito: é o que torna o webhook seguro de repetir. O
-- WhatsApp reenvia quando não recebe 200 rápido, e reenvia mais de uma vez. Sem
-- a restrição, uma lentidão do banco viraria mensagem duplicada na tela e
-- contagem inflada no painel. Com ela, a idempotência fica no banco — não
-- depende de o código lembrar de conferir.
--
-- `bruto` guarda o payload inteiro. Ocupa espaço e vale cada byte: quando
-- aparecer um tipo que o parser não previu (enquete, figurinha), o dado está lá
-- para reprocessar sem pedir para a pessoa mandar de novo.

create table if not exists public.mensagens (
  id           bigserial primary key,
  conversa_id  bigint not null references public.conversas(id) on delete cascade,
  wa_id        text unique,
  telefone     text not null,

  direcao      text not null check (direcao in ('inbound', 'outbound')),
  tipo         text not null default 'texto',
  texto        text,

  -- Mídia por URL. Baixar tudo custaria banco e banda por um áudio que talvez
  -- ninguém reouça.
  midia_url    text,
  midia_mime   text,
  duracao_seg  int,

  -- Quem da equipe mandou. Null em mensagem recebida e em envio automático do
  -- roteiro — a distinção é o que permite medir trabalho humano separado do que
  -- a máquina fez sozinha.
  enviada_por  uuid references public.profiles(id) on delete set null,

  status       text,
  momento      timestamptz not null,
  bruto        jsonb,
  criado_em    timestamptz not null default now()
);

create index if not exists mensagens_conversa on public.mensagens (conversa_id, momento);
create index if not exists mensagens_autor on public.mensagens (enviada_por, momento desc)
  where enviada_por is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. AS ETIQUETAS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Diferentes das demandas do eixo 2, que a classificação deriva da conversa.
-- Estas são o que a atendente marca à mão: "prometi retornar segunda", "pediu
-- para não receber mais", "é parente de vereador". Não sai de palavra-chave, e
-- some junto com a atendente que sabia, se não for escrito.
--
-- Catálogo em tabela e não no código, porque quem cria etiqueta é a coordenação
-- e não pode depender de deploy.

create table if not exists public.tags (
  id        bigserial primary key,
  nome      text not null unique,
  cor       text not null default '#5b6779',
  -- Sem descrição, duas atendentes usam a mesma etiqueta para coisas diferentes
  -- e o número que sai dela não significa nada.
  descricao text,
  ativa     boolean not null default true,
  ordem     int not null default 0,
  criado_em timestamptz not null default now()
);

-- Guarda QUEM etiquetou. Etiqueta sem autor não se audita: quando o número sai
-- estranho, ninguém sabe a quem perguntar.
create table if not exists public.conversa_tags (
  conversa_id bigint not null references public.conversas(id) on delete cascade,
  tag_id      bigint not null references public.tags(id) on delete cascade,
  marcada_por uuid references public.profiles(id) on delete set null,
  marcada_em  timestamptz not null default now(),
  primary key (conversa_id, tag_id)
);

create index if not exists conversa_tags_tag on public.conversa_tags (tag_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. A ATRIBUIÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Responde três perguntas que aparecem sempre: por que esta conversa caiu
-- comigo, quantas vezes esta pessoa foi repassada antes de ser resolvida, e a
-- distribuição está mesmo equilibrando ou só parece.

create table if not exists public.atribuicoes (
  id             bigserial primary key,
  conversa_id    bigint not null references public.conversas(id) on delete cascade,
  -- O telefone viaja junto: é a única chave que sobrevive à troca de
  -- plataforma. O id da conversa é nosso; o número é da pessoa.
  telefone       text not null,
  de_atendente   uuid references public.profiles(id) on delete set null,
  para_atendente uuid references public.profiles(id) on delete set null,
  motivo         text not null,   -- automatica · manual · devolucao · reveza
  regra          text,            -- continuidade · especialista · menor-carga
  feita_por      uuid references public.profiles(id) on delete set null,
  criado_em      timestamptz not null default now()
);

create index if not exists atribuicoes_conversa on public.atribuicoes (conversa_id, criado_em desc);
create index if not exists atribuicoes_telefone on public.atribuicoes (telefone, criado_em desc);
create index if not exists atribuicoes_para on public.atribuicoes (para_atendente, criado_em desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O ROTEIRO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Em tabela, não no código: o texto muda toda semana em campanha — o áudio
-- novo, a frase que converteu melhor, a pergunta que estava afastando gente. Se
-- cada ajuste exigir deploy, o roteiro congela na primeira versão e a equipe
-- volta a improvisar no privado.

create table if not exists public.fluxos (
  id         bigserial primary key,
  nome       text not null,
  descricao  text,
  ativo      boolean not null default false,
  criado_por uuid references public.profiles(id) on delete set null,
  criado_em  timestamptz not null default now()
);

-- Um fluxo ativo por vez, garantido pelo banco. Índice parcial único em vez de
-- gatilho: não há caminho de escrita que escape.
create unique index if not exists fluxos_um_ativo on public.fluxos ((ativo)) where ativo;

create table if not exists public.fluxo_passos (
  id         bigserial primary key,
  fluxo_id   bigint not null references public.fluxos(id) on delete cascade,
  ordem      int not null,
  estagio    text not null,   -- casa com FUNIL em src/lib/atendimento.ts
  titulo     text not null,
  mensagem   text,            -- aceita {{nome}}, {{municipio}}, {{bairro}}
  -- O que precisa acontecer para o passo contar como cumprido. Texto para gente
  -- ler, não expressão para a máquina avaliar: quem confere é a atendente.
  criterio   text,
  automatico boolean not null default false,
  unique (fluxo_id, ordem)
);

create index if not exists fluxo_passos_fluxo on public.fluxo_passos (fluxo_id, ordem);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. RLS — tudo só para a equipe
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Conversa de WhatsApp é o dado mais sensível da campanha: nome, telefone e o
-- que a pessoa contou da própria vida. `perfil_equipe()` e não `perfil_ativo()`,
-- porque as 43 contas de portal também são contas aprovadas.

do $$
declare
  t text;
  tabelas text[] := array[
    'conversas', 'mensagens', 'atendentes', 'tags', 'conversa_tags',
    'atribuicoes', 'fluxos', 'fluxo_passos'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security', t);
    -- A larga sai antes: RLS SOMA políticas, e uma permissiva esquecida ao lado
    -- de uma estreita não tranca nada.
    execute format('drop policy if exists %I on public.%I', t || ' equipe', t);
    execute format($f$
      create policy %I on public.%I
        for all to authenticated
        using (public.perfil_equipe())
        with check (public.perfil_equipe())
    $f$, t || ' equipe', t);
  end loop;
end $$;

-- A atendente muda o próprio interruptor de disponível sem ser admin.
drop policy if exists "atendentes proprio" on public.atendentes;
create policy "atendentes proprio" on public.atendentes
  for update to authenticated
  using (id = auth.uid() or public.perfil_equipe())
  with check (id = auth.uid() or public.perfil_equipe());

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. A CARGA DE CADA ATENDENTE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Em view para a conta existir num lugar só — a mesma aparece no painel da
-- coordenação, e duas versões dela divergiriam no primeiro ajuste.
--
-- ATENÇÃO AO `security_invoker`. View em Postgres roda com os privilégios de
-- QUEM A CRIOU, não de quem consulta: sem esta opção a RLS acima não valeria
-- aqui, e como a view mora no schema `public`, o Supabase a publica como rota
-- REST alcançável sem sessão nenhuma.

create or replace view public.carga_atendentes
with (security_invoker = on) as
  select
    a.id,
    a.nome,
    a.disponivel,
    a.capacidade,
    a.demandas,
    count(c.id) filter (where c.encerrada_em is null)                                as abertas,
    count(c.id) filter (where c.encerrada_em is null and c.ultima_direcao = 'inbound') as esperando,
    greatest(a.capacidade - count(c.id) filter (where c.encerrada_em is null), 0)    as vagas
  from public.atendentes a
  left join public.conversas c on c.atendente_id = a.id
  group by a.id, a.nome, a.disponivel, a.capacidade, a.demandas;

revoke all on public.carga_atendentes from anon;
grant select on public.carga_atendentes to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. FIND-OR-CREATE, NO BANCO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Toda mensagem pergunta "esta pessoa já tem conversa?". Três frases seguidas
-- chegam quase juntas: dois `select` responderiam "não existe" ao mesmo tempo e
-- dois `insert` criariam duas conversas para a mesma pessoa. Resolver no código
-- exigiria trava distribuída; no banco é `on conflict`. A corrida perde para a
-- chave única.

create or replace function public.conversa_do_telefone(
  p_telefone  text,
  p_nome      text default null,
  p_instancia text default null,
  p_foto      text default null
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into public.conversas (telefone, nome, instancia, foto_url)
  values (p_telefone, p_nome, p_instancia, p_foto)
  on conflict (telefone) do update set
    -- O nome só é preenchido, nunca sobrescrito: quem cadastrou na mão sabia
    -- mais do que o apelido que a pessoa pôs no WhatsApp.
    nome          = coalesce(conversas.nome, excluded.nome),
    foto_url      = coalesce(excluded.foto_url, conversas.foto_url),
    atualizado_em = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- SÓ O SERVICE_ROLE. A função é `security definer`, então escreve por cima da
-- RLS: liberar para `authenticated` daria isso a qualquer conta logada,
-- inclusive a que acabou de se cadastrar e está pendente. Quem precisa dela é o
-- webhook, que chama com a chave de serviço. Nenhuma tela usa.
revoke all on function public.conversa_do_telefone(text, text, text, text) from public;
revoke all on function public.conversa_do_telefone(text, text, text, text) from authenticated;
grant execute on function public.conversa_do_telefone(text, text, text, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. A PROVA — última consulta, a única que o editor mostra
-- ─────────────────────────────────────────────────────────────────────────────

select * from (
  select 1 as ordem, 'TABELA' as bloco, t as item,
         case when to_regclass('public.' || t) is null
              then '>>> NAO CRIADA' else 'ok' end as estado
  from unnest(array['conversas','mensagens','atendentes','tags','conversa_tags',
                    'atribuicoes','fluxos','fluxo_passos']) as t

  union all
  select 2, 'TRAVA', tablename || ' · ' || policyname,
         case when qual like '%perfil_equipe%' then 'so equipe'
              else '>>> ' || coalesce(left(qual, 30), 'sem condicao') end
  from pg_policies
  where schemaname = 'public'
    and tablename in ('conversas','mensagens','atendentes','tags','conversa_tags',
                      'atribuicoes','fluxos','fluxo_passos')

  union all
  select 3, 'VIEW', 'carga_atendentes',
         case when 'security_invoker=on' = any(c.reloptions)
              then 'ok (respeita a RLS)' else '>>> IGNORA A RLS' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'carga_atendentes'

  union all
  select 4, 'ARQUIVO', 'atendimentos (historico do GabiFlow)',
         count(*)::text || ' conversas, intactas'
  from public.atendimentos
) prova
order by ordem, item;
