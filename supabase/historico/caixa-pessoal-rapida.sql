-- ============================================================================
-- AS MESMAS REGRAS, SEM DERRUBAR A PÁGINA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. NÃO muda quem vê o quê — muda só
-- quantas vezes o banco pergunta.
--
-- ── O QUE EU FIZ ERRADO ─────────────────────────────────────────────────────
--
-- Escrevi `auth.uid()` e `perfil_supervisao()` soltos dentro da política. O
-- Postgres então chama as duas UMA VEZ POR LINHA examinada. Com poucas
-- conversas ninguém sente; com a base crescendo mil por dia, a consulta estoura
-- o tempo e a página mostra "This page couldn't load".
--
-- É o primeiro item da própria documentação da Supabase sobre RLS, e eu passei
-- por cima dele.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
--
-- Envolver em `(select ...)`. O Postgres reconhece que o valor não muda entre
-- as linhas, calcula uma vez e reaproveita. A regra é idêntica; o custo cai de
-- "uma pergunta por linha" para "uma pergunta".

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONVERSAS
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "conversas le" on public.conversas;
drop policy if exists "conversas escreve" on public.conversas;

create policy "conversas le" on public.conversas
  for select to authenticated
  using (
    (select public.perfil_supervisao())
    or (
      (select public.perfil_atendimento())
      and (atendente_id = (select auth.uid()) or atendente_id is null)
    )
  );

create policy "conversas escreve" on public.conversas
  for all to authenticated
  using (
    (select public.perfil_supervisao())
    or (
      (select public.perfil_atendimento())
      and (atendente_id = (select auth.uid()) or atendente_id is null)
    )
  )
  with check (
    (select public.perfil_supervisao())
    or (
      (select public.perfil_atendimento())
      and (atendente_id = (select auth.uid()) or atendente_id is null)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MENSAGENS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Aqui era pior: além da função por linha, havia uma SUBCONSULTA A CONVERSAS
-- por mensagem. Abrir uma conversa de 300 mensagens fazia 300 buscas.
--
-- A conferência da supervisão vem primeiro e sai por `(select ...)`: para quem
-- supervisiona, o Postgres nem chega na parte cara.
drop policy if exists "mensagens le" on public.mensagens;
drop policy if exists "mensagens escreve" on public.mensagens;

create policy "mensagens le" on public.mensagens
  for select to authenticated
  using (
    (select public.perfil_supervisao())
    or exists (
      select 1 from public.conversas c
       where c.id = mensagens.conversa_id
         and (c.atendente_id = (select auth.uid()) or c.atendente_id is null)
    )
  );

create policy "mensagens escreve" on public.mensagens
  for all to authenticated
  using (
    (select public.perfil_supervisao())
    or exists (
      select 1 from public.conversas c
       where c.id = mensagens.conversa_id
         and (c.atendente_id = (select auth.uid()) or c.atendente_id is null)
    )
  )
  with check (
    (select public.perfil_supervisao())
    or exists (
      select 1 from public.conversas c
       where c.id = mensagens.conversa_id
         and (c.atendente_id = (select auth.uid()) or c.atendente_id is null)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ETIQUETAS APLICADAS
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "conversa_tags mexe" on public.conversa_tags;

create policy "conversa_tags mexe" on public.conversa_tags
  for all to authenticated
  using (
    (select public.perfil_supervisao())
    or exists (
      select 1 from public.conversas c
       where c.id = conversa_tags.conversa_id
         and (c.atendente_id = (select auth.uid()) or c.atendente_id is null)
    )
  )
  with check (
    (select public.perfil_supervisao())
    or exists (
      select 1 from public.conversas c
       where c.id = conversa_tags.conversa_id
         and (c.atendente_id = (select auth.uid()) or c.atendente_id is null)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OS ÍNDICES QUE A REGRA USA
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists conversas_por_atendente
  on public.conversas (atendente_id, ultima_msg_at desc);

-- Sem este, a subconsulta de `mensagens` volta a varrer.
create index if not exists conversas_id_atendente
  on public.conversas (id, atendente_id);

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Se voltar rápido e com os números certos, funcionou. O tempo aparece no
-- rodapé do editor do Supabase.
select
  (select count(*) from public.conversas)                            as conversas,
  (select count(*) from public.conversas where atendente_id is null) as na_fila,
  (select count(*) from public.mensagens)                            as mensagens;
