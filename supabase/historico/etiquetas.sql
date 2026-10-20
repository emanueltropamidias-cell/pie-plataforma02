-- ============================================================================
-- ETIQUETAS — a atendente cria, a supervisão organiza
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── A TRAVA QUE ATRAPALHAVA ─────────────────────────────────────────────────
--
-- `tags` estava com escrita só para supervisão. Mas etiqueta nasce no meio do
-- atendimento: a atendente percebe um padrão que ninguém previu e precisa
-- marcar ali, não na semana que vem depois de pedir para alguém.
--
-- Agora ela CRIA. Não APAGA nem RENOMEIA — isso continua de quem coordena,
-- porque apagar etiqueta apaga a marcação de todas as conversas que a usavam, e
-- renomear muda o significado do que já foi contado. Criar é barato de desfazer
-- (desativa); apagar não é.

drop policy if exists "tags le" on public.tags;
drop policy if exists "tags equipe" on public.tags;
drop policy if exists "tags cria" on public.tags;
drop policy if exists "tags manda" on public.tags;

-- Toda a equipe de atendimento LÊ.
create policy "tags le" on public.tags
  for select to authenticated
  using (public.perfil_atendimento());

-- Toda a equipe de atendimento CRIA.
create policy "tags cria" on public.tags
  for insert to authenticated
  with check (public.perfil_atendimento());

-- Alterar e apagar é da coordenação.
create policy "tags manda" on public.tags
  for update to authenticated
  using (public.perfil_supervisao())
  with check (public.perfil_supervisao());

create policy "tags apaga" on public.tags
  for delete to authenticated
  using (public.perfil_supervisao());

-- ─────────────────────────────────────────────────────────────────────────────
-- SEIS PARA COMEÇAR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Etiqueta é diferente de DEMANDA e de STATUS, e as três convivem:
--
--   STATUS    em que pé a pessoa está — apoiador, hater. Uma por pessoa.
--   DEMANDA   o que ela pediu — saúde, material. Zero ou várias.
--   ETIQUETA  o que a EQUIPE precisa lembrar — "ligar depois", "número errado".
--
-- Estas seis saem do que já apareceu na operação. Cada uma tem descrição porque
-- sem ela duas atendentes usam a mesma etiqueta para coisas diferentes, e o
-- número que sai dela deixa de significar qualquer coisa.
insert into public.tags (nome, cor, descricao, ordem)
select * from (values
  ('Ligar depois',    '#0525f7', 'Pediu contato por telefone ou nao da para resolver por escrito.', 10),
  ('Sem retorno',     '#8a6009', 'A equipe respondeu e a pessoa nao voltou.',                        20),
  ('Numero errado',   '#52535c', 'Nao e a pessoa que o cadastro dizia.',                             30),
  ('Quer material',   '#12703c', 'Pediu adesivo, santinho ou panfleto.',                             40),
  ('Multiplicador',   '#5b34c9', 'Aceitou levar o projeto para outras pessoas.',                     50),
  ('Atencao',         '#c02020', 'Caso delicado — a supervisao precisa olhar.',                      60)
) as novas(nome, cor, descricao, ordem)
where not exists (select 1 from public.tags);

-- ── conferência ─────────────────────────────────────────────────────────────
select t.nome, t.cor, t.ativa, t.descricao,
       (select count(*) from public.conversa_tags ct where ct.tag_id = t.id) as usos
  from public.tags t
 order by t.ordem, t.nome;
