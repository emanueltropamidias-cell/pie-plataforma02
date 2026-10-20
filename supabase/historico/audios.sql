-- ============================================================================
-- OS ÁUDIOS DA TALITA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO É A COISA MAIS VALIOSA DA CAIXA ────────────────────────────
--
-- Um áudio na voz da candidata não é uma mensagem melhor — é outra categoria de
-- mensagem. Quem recebe texto de campanha sabe que foi uma equipe que mandou.
-- Quem recebe a voz sente que falou com ela.
--
-- O custo disso é que ela grava uma vez e a equipe reusa mil vezes. Sem uma
-- biblioteca, o áudio circula no grupo do WhatsApp da equipe, cada menina
-- reencaminha da galeria dela, metade manda o errado, e ninguém sabe qual está
-- funcionando.
--
-- ── O DETALHE TÉCNICO QUE DECIDE TUDO ───────────────────────────────────────
--
-- O áudio tem de chegar como MENSAGEM DE VOZ — aquela bolinha com a onda, que
-- toca com um toque. Se chegar como arquivo anexado, a pessoa precisa baixar,
-- abrir noutro aplicativo, e a maioria não abre. Perde-se justamente o que
-- fazia valer a pena.
--
-- Para chegar assim, o arquivo precisa ser OGG/Opus. E há um atalho: ÁUDIO
-- GRAVADO NO PRÓPRIO WHATSAPP JÁ É OGG/OPUS. A Talita grava no WhatsApp dela,
-- encaminha para o coordenador, ele exporta o arquivo e sobe aqui. Sem
-- conversor, sem servidor de mídia, sem perda de qualidade.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A BIBLIOTECA
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.audios (
  id          bigserial primary key,

  -- O que a atendente lê na hora de escolher, correndo. "Agradecimento pelo
  -- apoio" diz mais que "audio_03_final_v2.ogg".
  titulo      text not null,

  -- Quando usar. É o que evita mandar o de saúde para quem perguntou de
  -- emprego, que é o erro que faz o áudio virar spam.
  quando      text,

  arquivo     text not null,          -- caminho no balde
  mime        text,
  duracao_seg int,
  bytes       int,

  ordem       int not null default 100,
  ativo       boolean not null default true,

  -- QUANTAS VEZES FOI ENVIADO. Sem isto, a biblioteca cresce e ninguém sabe
  -- qual áudio trabalha e qual só ocupa lugar — e a Talita regrava os errados.
  vezes       int not null default 0,
  ultimo_uso  timestamptz,

  criado_por  uuid references public.profiles(id) on delete set null,
  criado_em   timestamptz not null default now()
);

create index if not exists audios_ordem on public.audios (ordem, titulo)
  where ativo;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ONDE OS ARQUIVOS MORAM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Balde separado do `conversas`, e PRIVADO.
--
-- Separado porque a vida deles é outra: o áudio da conversa é de uma pessoa e
-- pode ser apagado a pedido dela; o áudio da Talita é material de campanha e
-- fica. Misturar os dois faria "apagar os dados do eleitor X" virar uma caçada.
--
-- Privado porque endereço vaza — em print, em log, no histórico do navegador de
-- um computador compartilhado. Áudio de campanha circulando fora de contexto é
-- material para adversário.
insert into storage.buckets (id, name, public, file_size_limit)
values ('audios', 'audios', false, 26214400)     -- 25 MB, o teto do WhatsApp
on conflict (id) do update set
  public = false,
  file_size_limit = 26214400;

drop policy if exists "audios le" on storage.objects;
drop policy if exists "audios escreve" on storage.objects;

-- Toda a equipe OUVE: a atendente precisa conferir antes de mandar.
create policy "audios le" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'audios'
    and ((select public.perfil_atendimento()) or (select public.perfil_supervisao()))
  );

-- Só a coordenação SOBE. Áudio em nome da candidata não é upload de quem
-- atende.
create policy "audios escreve" on storage.objects
  for all to authenticated
  using (bucket_id = 'audios' and (select public.perfil_supervisao()))
  with check (bucket_id = 'audios' and (select public.perfil_supervisao()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. QUEM MEXE NA LISTA
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.audios enable row level security;

drop policy if exists "audios lista" on public.audios;
create policy "audios lista" on public.audios
  for select to authenticated
  using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()));

drop policy if exists "audios cuida" on public.audios;
create policy "audios cuida" on public.audios
  for all to authenticated
  using ((select public.perfil_supervisao()))
  with check ((select public.perfil_supervisao()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CONTAR O USO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A atendente não tem permissão de escrita na tabela — e não deveria ter. Mas
-- precisa somar o contador ao enviar. Uma função `security definer` que só sabe
-- fazer isso resolve sem abrir a tabela inteira.
create or replace function public.audio_usado(p_audio bigint)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.audios
     set vezes = vezes + 1,
         ultimo_uso = now()
   where id = p_audio;
end $$;

revoke all on function public.audio_usado(bigint) from public, anon;
grant execute on function public.audio_usado(bigint) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  (select count(*) from public.audios)                          as audios,
  (select count(*) from storage.buckets where id = 'audios')    as balde_criado,
  (select public from storage.buckets where id = 'audios')      as e_publico;
