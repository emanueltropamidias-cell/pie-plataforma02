-- ============================================================================
-- A VOTAÇÃO DA DOBRADINHA — onde a parceira teve voto em 2022
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── PARA QUE ISTO EXISTE ────────────────────────────────────────────────────
--
-- A campanha vai dobrar com uma candidata a deputada estadual. Para decidir
-- ONDE dobrar, é preciso ver os dois mapas: onde ela teve voto em 2022, onde a
-- Talita teve, e — o que realmente decide — onde uma é forte e a outra não é.
-- Cidade onde as duas já são fortes não ganha muito com dobradinha; cidade onde
-- só uma é forte é exatamente onde a outra entra de carona.
--
-- ── POR QUE TABELA, E NÃO ARQUIVO ───────────────────────────────────────────
--
-- Os votos da Talita moram em `src/lib/votos-talita.ts`, um arquivo fixo. Serve
-- para ela: são dados do TSE de 2022, não mudam nunca mais.
--
-- Os da parceira são diferentes em uma coisa só, e ela decide tudo: o Emanuel
-- vai DIGITAR, município a município, e vai corrigir enquanto digita. Arquivo
-- fixo só muda com deploy — cada número corrigido viraria um pedido para mim.
-- Em tabela, ele digita e o mapa muda na hora.
--
-- E não é uma candidata só: dobradinha se conversa com várias antes de fechar
-- com uma. Por isso a votação é de um CANDIDATO, e não uma coluna a mais em
-- algum lugar.
--
-- ── A GRAFIA DO MUNICÍPIO ───────────────────────────────────────────────────
--
-- Esta base já somou errado uma vez porque uma cidade existia com duas grafias
-- (commit e7494ea). A defesa já existe e é reaproveitada aqui inteira: o
-- trigger `municipio_na_grafia_oficial()` reescreve o nome para o da lista
-- oficial antes de gravar. É por isso que a coluna se chama `municipio` — a
-- função lê `new.municipio` e nada mais.
--
-- Com o nome já oficial na gravação, o `unique (candidato, municipio)` passa a
-- valer de verdade: "Poções" e "pocoes" não conseguem virar duas linhas.

-- ── QUEM É A PARCEIRA ───────────────────────────────────────────────────────

create table if not exists public.candidatos_dobradinha (
  id bigserial primary key,

  nome text not null,

  -- Estadual ou federal. A Talita é federal, então a dobradinha típica é com
  -- estadual — mas o campo existe porque o inverso também acontece.
  cargo text not null default 'estadual'
    check (cargo in ('estadual', 'federal')),

  -- Texto, não número: número de urna pode ter zero à esquerda, e zero à
  -- esquerda some em coluna numérica.
  numero text,
  partido text,

  -- De qual eleição é a votação guardada. Hoje só 2022 interessa; a coluna
  -- evita que em 2030 alguém precise adivinhar de que ano é aquele número.
  eleicao integer not null default 2022,

  -- Enquanto a conversa não fecha, mais de uma candidata pode estar no PIE.
  -- Desligar tira do mapa sem apagar o que já foi digitado.
  ativo boolean not null default true,

  observacoes text,

  criado_por uuid references public.profiles(id) on delete set null,
  criado_em timestamptz not null default now()
);

-- ── OS VOTOS, MUNICÍPIO A MUNICÍPIO ─────────────────────────────────────────

create table if not exists public.candidato_votos (
  id bigserial primary key,

  candidato_id bigint not null
    references public.candidatos_dobradinha(id) on delete cascade,

  -- O trigger abaixo reescreve para a grafia oficial antes de gravar.
  municipio text not null,

  votos integer not null default 0 check (votos >= 0),

  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references public.profiles(id) on delete set null,

  -- Uma linha por município. Digitar de novo CORRIGE, não duplica — que é o
  -- comportamento certo para quem está preenchendo à mão e volta atrás.
  unique (candidato_id, municipio)
);

create index if not exists candidato_votos_por_candidato
  on public.candidato_votos (candidato_id);

-- Município ausente é NORMAL: quem digita começa pelas cidades que importam, e
-- ausência quer dizer "ainda não digitei", nunca "teve zero voto". Essa
-- diferença é a mesma que o mapa de bairros já teve que aprender (commit
-- e0dcecc), e o mapa vai mostrar as duas coisas separadas.

-- ── A GRAFIA OFICIAL, PELO TRIGGER QUE JÁ EXISTE ────────────────────────────

drop trigger if exists candidato_votos_municipio_oficial on public.candidato_votos;
create trigger candidato_votos_municipio_oficial
  before insert or update on public.candidato_votos
  for each row execute function public.municipio_na_grafia_oficial();

-- ── E MUNICÍPIO QUE NÃO EXISTE NÃO ENTRA ────────────────────────────────────
--
-- O trigger de cima só CORRIGE a grafia; nome que ele não reconhece passa
-- direto. Em `liderancas` isso é proposital — lá o campo é o endereço de uma
-- pessoa, e povoado não é município mas também não pode ser jogado fora
-- (commit 2ed31d7).
--
-- Aqui é o contrário. O TSE apura voto POR MUNICÍPIO: não existe votação de
-- povoado. Um nome fora da lista só pode ser dedo torto — e dedo torto que
-- entra silencioso vira um município fantasma que o mapa nunca desenha e
-- ninguém nota que sumiu.
--
-- A ordem de disparo é por nome do trigger: `..._oficial` corre antes de
-- `..._valido`, então a validação já vê o nome corrigido e não reclama de
-- "pocoes".

create or replace function public.municipio_da_votacao_existe()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.municipios_ba m
     where m.chave = public.chave_municipio(new.municipio)
  ) then
    raise exception
      'Município "%" não está na lista oficial dos 417 da Bahia.', new.municipio
      using hint = 'Confira a grafia. Voto do TSE é sempre por município — povoado e distrito não têm apuração própria.';
  end if;
  return new;
end $$;

drop trigger if exists candidato_votos_municipio_valido on public.candidato_votos;
create trigger candidato_votos_municipio_valido
  before insert or update on public.candidato_votos
  for each row execute function public.municipio_da_votacao_existe();

-- ── QUEM MEXE ───────────────────────────────────────────────────────────────
--
-- Ler e escrever são a MESMA porta: `perfil_equipe()`, que é admin e usuário —
-- o gabinete. Ficam de fora atendente e liderança, que a função já nega.
--
-- Escrevi `perfil_supervisao()` na escrita primeiro, por imitar o arquivo dos
-- links, e estava errado das duas pontas. Aquela função INCLUI o supervisor, que
-- é do atendimento: ele teria permissão de gravar num mapa que `perfil_equipe()`
-- não deixa ele nem abrir. Escrever sem poder ler é incoerência que só aparece
-- no dia em que alguém tenta.
--
-- E não é uma porta a mais que quem lê: quem enxerga o mapa é exatamente quem
-- precisa corrigir um número torto nele. Trancar a correção numa conta de admin
-- faria a pessoa que ACHOU o erro ter que pedir para outra arrumar.

alter table public.candidatos_dobradinha enable row level security;
alter table public.candidato_votos enable row level security;

drop policy if exists "candidatos le" on public.candidatos_dobradinha;
create policy "candidatos le" on public.candidatos_dobradinha
  for select to authenticated
  using ((select public.perfil_equipe()));

drop policy if exists "candidatos mexe" on public.candidatos_dobradinha;
create policy "candidatos mexe" on public.candidatos_dobradinha
  for all to authenticated
  using ((select public.perfil_equipe()))
  with check ((select public.perfil_equipe()));

drop policy if exists "votos le" on public.candidato_votos;
create policy "votos le" on public.candidato_votos
  for select to authenticated
  using ((select public.perfil_equipe()));

drop policy if exists "votos mexe" on public.candidato_votos;
create policy "votos mexe" on public.candidato_votos
  for all to authenticated
  using ((select public.perfil_equipe()))
  with check ((select public.perfil_equipe()));

-- ── CONFERÊNCIA ─────────────────────────────────────────────────────────────
--
-- Rodando pelo scripts/rodar-sql.mjs, TODAS estas consultas aparecem. No editor
-- do Supabase só a última apareceria — foi por isso que o runner existe.

-- 1. As tabelas nasceram, e com quantas colunas.
select table_name as tabela, count(*)::int as colunas
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('candidatos_dobradinha', 'candidato_votos')
 group by table_name
 order by table_name;

-- 2. O trigger da grafia está pendurado.
select tgname as trigger, tgenabled as ligado
  from pg_trigger
 where tgrelid = 'public.candidato_votos'::regclass
   and not tgisinternal;

-- 3. As quatro políticas de RLS.
select tablename as tabela, policyname as politica, cmd as comando
  from pg_policies
 where schemaname = 'public'
   and tablename in ('candidatos_dobradinha', 'candidato_votos')
 order by tablename, policyname;

-- 4. O que já foi digitado. Zero é o esperado na primeira execução.
select c.nome,
       c.cargo,
       c.eleicao,
       count(v.id)::int as municipios_digitados,
       coalesce(sum(v.votos), 0)::int as votos_somados
  from public.candidatos_dobradinha c
  left join public.candidato_votos v on v.candidato_id = c.id
 group by c.id, c.nome, c.cargo, c.eleicao
 order by c.nome;
