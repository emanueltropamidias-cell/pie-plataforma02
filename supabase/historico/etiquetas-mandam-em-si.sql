-- ============================================================================
-- A COORDENAÇÃO MANDA NAS ETIQUETAS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE NINGUÉM CONSEGUIA APAGAR ────────────────────────────────────────
--
-- `tags` tinha três políticas: ler, criar e editar. Não tinha de APAGAR — e no
-- Postgres, com RLS ligada, o que não tem política é proibido. Não era tela
-- faltando: o banco recusava, calado.
--
-- ── APAGAR ETIQUETA APAGA CLASSIFICAÇÃO ─────────────────────────────────────
--
-- `conversa_tags.tag_id` é `on delete cascade`. Apagar "Apoiador" hoje levaria
-- junto as 245 marcações — o trabalho de classificar da equipe inteira, sem
-- aviso e sem volta.
--
-- Por isso a política é de SUPERVISÃO, e a tela tem de mostrar o número antes
-- do clique. Quem lê "245 pessoas perdem esta marcação" decide diferente de
-- quem lê "tem certeza?".
--
-- Desativar (`ativa = false`) tira a etiqueta da lista sem tocar em marcação
-- nenhuma, e resolve quase todo caso. Apagar é para etiqueta criada por engano.

drop policy if exists "tags apaga" on public.tags;
create policy "tags apaga" on public.tags
  for delete to authenticated
  using ((select public.perfil_supervisao()));

-- ── CRIAR TAMBÉM VIRA COISA DE SUPERVISÃO ───────────────────────────────────
--
-- Criar estava liberado para qualquer atendente (`perfil_atendimento`), e foi
-- assim que nasceu a `APOIADOR` em maiúscula, sem eixo, duplicando a que já
-- existia. Treze pessoas foram marcadas com ela e não contaram na métrica.
--
-- Etiqueta é o vocabulário do relatório da campanha. Duas palavras para a mesma
-- coisa quebram o eixo em silêncio — e quem marca não tem como saber disso.
drop policy if exists "tags cria" on public.tags;
create policy "tags cria" on public.tags
  for insert to authenticated
  with check ((select public.perfil_supervisao()));

-- ─────────────────────────────────────────────────────────────────────────────
-- OS DOIS DEFEITOS QUE JÁ EXISTEM
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. `Não apoiador` é do eixo status e está SEM VALOR. Marcar ela hoje grava
--    nulo em `status_lead`: a pessoa fica classificada na tela e invisível na
--    métrica. Zero usos até agora, então dá para consertar antes de doer.
--
--    `nao_apoiador` NÃO está na lista fixa de sete que o painel conhece
--    (`PREVALENCIA`, em `lib/atendimento.ts`). Isso deixaria a pessoa contada
--    em `leads` e fora de todas as barras — a soma pararia de fechar 100%, com
--    o texto ao lado dizendo que fecha.
--
--    Por isso o painel foi corrigido junto, no mesmo commit: status que o
--    código não conhece passa a aparecer no fim da lista, com o nome cru e cor
--    neutra, e ENTRA na soma. Feio é melhor que ausente — assim alguém vê e
--    decide se acrescenta ao código ou corrige a etiqueta.
update public.tags
   set valor = 'nao_apoiador'
 where id = 14
   and eixo = 'status'
   and valor is null;

-- 2. A `APOIADOR` duplicada NÃO é apagada aqui.
--
--    Apagar levaria as 13 marcações junto, e essas 13 pessoas ficariam sem
--    classificação nenhuma. O certo é MUDAR as marcações para a etiqueta boa e
--    só então apagar a duplicada — mas isso muda dado de gente, e é decisão da
--    coordenação, não de um arquivo que roda sozinho.
--
--    O que dá para fazer sem risco: desativar, para ninguém mais marcar com ela.
--    As 13 já marcadas continuam como estão até você decidir.
update public.tags set ativa = false where id = 1 and nome = 'APOIADOR';

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- `APOIADOR` tem de aparecer com ativa = false. `Não apoiador` com valor
-- preenchido. E as três de trabalho — Liderança, Responder depois, Importante —
-- seguem sem eixo, o que está CERTO: etiqueta de trabalho não alimenta métrica.
select t.id,
       t.nome,
       coalesce(t.eixo, '(trabalho)') as eixo,
       coalesce(t.valor, '—')         as valor,
       t.ativa,
       count(ct.conversa_id)          as marcacoes
  from public.tags t
  left join public.conversa_tags ct on ct.tag_id = t.id
 group by t.id, t.nome, t.eixo, t.valor, t.ativa, t.ordem
 order by t.eixo nulls last, t.ordem;
