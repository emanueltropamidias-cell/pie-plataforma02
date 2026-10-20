-- ============================================================================
-- OS KITS POLÍTICOS
-- ============================================================================
--
-- Rode DEPOIS de audios.sql. Pode rodar de novo sem medo.
--
-- ── POR QUE KIT, E NÃO "MANDAR OS ARQUIVOS" ─────────────────────────────────
--
-- O eleitor que está com Lula e com Neto e vai votar na Talita não recebe o
-- mesmo material de quem veio pedir consulta médica. São conversas diferentes,
-- e o material certo é o que faz a pessoa lembrar da campanha na hora de votar.
--
-- Sem kit, isso vira a menina caçando na galeria do celular dela: manda o
-- santinho errado, esquece o áudio, manda o de Neto para quem é de outro
-- palanque. Com kit, ela escolhe UMA COISA — "Talita e Neto" — e sai a
-- sequência inteira, na ordem, sempre igual.
--
-- E o kit é da CAMPANHA, não da menina. Quem monta é a coordenação; todas as
-- sete usam o mesmo. Material político saindo em nome da candidata não pode
-- depender de quem está no plantão.
--
-- ── A BIBLIOTECA DEIXA DE SER SÓ DE ÁUDIO ───────────────────────────────────
--
-- `audios` vira `materiais`: áudio, imagem, vídeo e texto no mesmo lugar,
-- porque o gesto é o mesmo — material pronto, enviado com um toque. Manter duas
-- tabelas separadas faria dois cadastros, duas telas e duas listas para a
-- menina procurar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A BIBLIOTECA GENERALIZADA
-- ─────────────────────────────────────────────────────────────────────────────
alter table if exists public.audios rename to materiais;

alter table public.materiais
  add column if not exists tipo text not null default 'audio'
    check (tipo in ('audio', 'imagem', 'video', 'documento', 'texto'));

-- Material de texto não tem arquivo — é a frase pronta, com {{nome}}.
alter table public.materiais
  add column if not exists texto text;

alter table public.materiais alter column arquivo drop not null;

-- Ou tem arquivo, ou tem texto. Linha com os dois vazios é material que não
-- envia nada — e o erro só apareceria na frente do eleitor.
alter table public.materiais
  drop constraint if exists materiais_tem_conteudo;
alter table public.materiais
  add constraint materiais_tem_conteudo check (
    (tipo = 'texto' and texto is not null and length(trim(texto)) > 0)
    or (tipo <> 'texto' and arquivo is not null)
  );

-- Os índices e políticas seguem o nome novo da tabela; recriar é mais barato
-- que caçar o que o `rename` levou junto.
drop index if exists audios_ordem;
create index if not exists materiais_ordem on public.materiais (ordem, titulo)
  where ativo;

alter table public.materiais enable row level security;

drop policy if exists "audios lista" on public.materiais;
drop policy if exists "audios cuida" on public.materiais;
drop policy if exists "materiais lista" on public.materiais;
drop policy if exists "materiais cuida" on public.materiais;

create policy "materiais lista" on public.materiais
  for select to authenticated
  using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()));

create policy "materiais cuida" on public.materiais
  for all to authenticated
  using ((select public.perfil_supervisao()))
  with check ((select public.perfil_supervisao()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. OS KITS
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kits (
  id         bigserial primary key,

  -- O que a menina lê na hora de escolher, correndo. "Talita e Neto" diz mais
  -- que "kit_02".
  nome       text not null,

  -- Para QUEM é. É o que evita mandar o de Neto para quem é de outro palanque —
  -- que é o erro que transforma material de campanha em problema.
  quando     text,

  cor        text not null default '#0525f7',
  ordem      int not null default 100,
  ativo      boolean not null default true,

  vezes      int not null default 0,
  ultimo_uso timestamptz,

  criado_por uuid references public.profiles(id) on delete set null,
  criado_em  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O QUE VAI DENTRO, E EM QUE ORDEM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A ordem importa de verdade: santinho, áudio, e só então a frase com o número.
-- Invertido, a pessoa lê o número antes de saber quem está falando.
create table if not exists public.kit_itens (
  id          bigserial primary key,
  kit_id      bigint not null references public.kits(id) on delete cascade,
  material_id bigint not null references public.materiais(id) on delete cascade,
  ordem       int not null default 100,
  unique (kit_id, material_id)
);

create index if not exists kit_itens_kit on public.kit_itens (kit_id, ordem);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. QUEM MEXE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Todas LEEM e MANDAM — o kit existe para ser usado por quem atende.
-- Só a coordenação MONTA: material político em nome da candidata não pode
-- depender de quem está no plantão.
do $$
declare t text;
begin
  foreach t in array array['kits', 'kit_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s le" on public.%I', t, t);
    execute format(
      'create policy "%s le" on public.%I for select to authenticated
         using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()))', t, t);
    execute format('drop policy if exists "%s cuida" on public.%I', t, t);
    execute format(
      'create policy "%s cuida" on public.%I for all to authenticated
         using ((select public.perfil_supervisao()))
         with check ((select public.perfil_supervisao()))', t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CONTAR O USO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Qual kit trabalha e qual só ocupa lugar. Sem isso, a coordenação refaz os
-- errados e mantém os que ninguém usa.
create or replace function public.kit_usado(p_kit bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.kits
     set vezes = vezes + 1, ultimo_uso = now()
   where id = p_kit;
  -- Cada material do kit conta também: um santinho pode estar em três kits, e
  -- é a soma que diz se ele vale a pena.
  update public.materiais m
     set vezes = m.vezes + 1, ultimo_uso = now()
    from public.kit_itens i
   where i.kit_id = p_kit and i.material_id = m.id;
end $$;

revoke all on function public.kit_usado(bigint) from public, anon;
grant execute on function public.kit_usado(bigint) to authenticated, service_role;

-- `audio_usado` continua valendo para o material solto, mas agora aponta para a
-- tabela renomeada.
create or replace function public.audio_usado(p_audio bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.materiais
     set vezes = vezes + 1, ultimo_uso = now()
   where id = p_audio;
end $$;

grant execute on function public.audio_usado(bigint) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O QUE A MENINA VÊ NA CONVERSA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Uma consulta só: o kit e quantos itens tem. Ela escolhe pelo nome e pelo
-- "para quem é" — não precisa abrir para saber o que vai dentro.
drop view if exists public.kits_prontos;

create view public.kits_prontos
with (security_invoker = on) as
  select k.id, k.nome, k.quando, k.cor, k.ordem, k.ativo, k.vezes,
         count(i.id)                                          as itens,
         count(i.id) filter (where m.tipo = 'audio')           as audios,
         count(i.id) filter (where m.tipo = 'imagem')          as imagens,
         -- Um kit sem item nenhum é um botão que não faz nada. A tela usa isto
         -- para escondê-lo em vez de deixar a menina descobrir no clique.
         count(i.id) > 0                                       as pronto
    from public.kits k
    left join public.kit_itens i on i.kit_id = k.id
    left join public.materiais m on m.id = i.material_id and m.ativo
   group by k.id;

revoke all on public.kits_prontos from anon;
grant select on public.kits_prontos to authenticated;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  (select count(*) from public.materiais)  as materiais,
  (select count(*) from public.kits)       as kits,
  (select count(*) from public.kit_itens)  as itens;
