-- ============================================================================
-- A ATENDENTE LÊ A FILA E O QUE É DELA — NÃO A CONVERSA DA COLEGA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE ESTAVA ABERTO ─────────────────────────────────────────────────────
--
-- A tela já separava: "Meus atendimentos" e "Meu histórico" mostram só o que é
-- da conta, e "Aguardando" é o monte compartilhado. Mas isso era FILTRO DE
-- TELA — a RLS deixava qualquer atendente LER TODAS as conversas, e o servidor
-- mandava todas para o navegador dela para depois esconder.
--
-- Ou seja: a conversa da colega estava no navegador, só não aparecia. Bastava
-- a ferramenta de desenvolvedor, ou uma chamada direta à API, para ler tudo —
-- inclusive as demandas de saúde e jurídico com nome e telefone.
--
-- Regra escondida na tela não é regra. Agora o banco decide.
--
-- ── QUEM VÊ O QUÊ ───────────────────────────────────────────────────────────
--
--   equipe e supervisão   tudo. A tela de Supervisão existe para isso.
--   atendente             o que está com ela + o que não está com ninguém.
--
-- A segunda metade é essencial: sem ela, "Aguardando" fica vazio e ninguém
-- consegue puxar lead nenhum.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CONVERSAS
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "conversas equipe" on public.conversas;
drop policy if exists "conversas le" on public.conversas;
drop policy if exists "conversas escreve" on public.conversas;

create policy "conversas le" on public.conversas
  for select to authenticated
  using (
    public.perfil_supervisao()
    or (
      public.perfil_atendimento()
      and (atendente_id = auth.uid() or atendente_id is null)
    )
  );

-- Escrever segue a mesma régua: responder, etiquetar e encerrar valem para o
-- que é dela ou para o que está livre — puxar da fila é justamente escrever
-- numa conversa sem dono.
create policy "conversas escreve" on public.conversas
  for all to authenticated
  using (
    public.perfil_supervisao()
    or (
      public.perfil_atendimento()
      and (atendente_id = auth.uid() or atendente_id is null)
    )
  )
  with check (
    public.perfil_supervisao()
    or (
      public.perfil_atendimento()
      and (atendente_id = auth.uid() or atendente_id is null)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. MENSAGENS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- De nada adianta trancar a conversa e deixar a mensagem aberta: é nela que
-- está o conteúdo.
drop policy if exists "mensagens equipe" on public.mensagens;
drop policy if exists "mensagens le" on public.mensagens;
drop policy if exists "mensagens escreve" on public.mensagens;

create policy "mensagens le" on public.mensagens
  for select to authenticated
  using (
    public.perfil_supervisao()
    or exists (
      select 1 from public.conversas c
       where c.id = mensagens.conversa_id
         and (c.atendente_id = auth.uid() or c.atendente_id is null)
    )
  );

create policy "mensagens escreve" on public.mensagens
  for all to authenticated
  using (
    public.perfil_supervisao()
    or exists (
      select 1 from public.conversas c
       where c.id = mensagens.conversa_id
         and (c.atendente_id = auth.uid() or c.atendente_id is null)
    )
  )
  with check (
    public.perfil_supervisao()
    or exists (
      select 1 from public.conversas c
       where c.id = mensagens.conversa_id
         and (c.atendente_id = auth.uid() or c.atendente_id is null)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ETIQUETAS APLICADAS
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "conversa_tags equipe" on public.conversa_tags;
drop policy if exists "conversa_tags mexe" on public.conversa_tags;

create policy "conversa_tags mexe" on public.conversa_tags
  for all to authenticated
  using (
    public.perfil_supervisao()
    or exists (
      select 1 from public.conversas c
       where c.id = conversa_tags.conversa_id
         and (c.atendente_id = auth.uid() or c.atendente_id is null)
    )
  )
  with check (
    public.perfil_supervisao()
    or exists (
      select 1 from public.conversas c
       where c.id = conversa_tags.conversa_id
         and (c.atendente_id = auth.uid() or c.atendente_id is null)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O ÍNDICE QUE SUSTENTA A NOVA REGRA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Toda leitura da atendente passa a filtrar por `atendente_id`. Sem índice,
-- cada abertura de caixa varre a tabela inteira — e ela cresce mil por dia.
create index if not exists conversas_por_atendente
  on public.conversas (atendente_id, ultima_msg_at desc);

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Rodando como admin, o total tem de bater com o total real. O teste de
-- verdade é entrar com a conta de uma atendente e conferir que ela vê só a
-- fila e o que é dela.
select
  (select count(*) from public.conversas)                              as vejo_conversas,
  (select count(*) from public.conversas where atendente_id is null)   as na_fila,
  (select count(*) from pg_policies
    where tablename = 'conversas' and policyname = 'conversas le')     as politica_leitura,
  (select count(*) from pg_policies
    where tablename = 'mensagens' and policyname = 'mensagens le')     as politica_mensagens;
