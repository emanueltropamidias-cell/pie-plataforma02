-- ============================================================================
-- A ETIQUETA MARCADA NO WHATSAPP VIRA ETIQUETA DO PIE
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- A sessão da Evolution cai, o WhatsApp bloqueia a reconexão, e a operação não
-- pode parar. A saída é a equipe atender direto no aplicativo e marcar com as
-- etiquetas dele — "Apoiadores", "Nao apoiador", "Responder depois".
--
-- Sem isto, esse trabalho fica preso no celular: o PIE não sabe quem é
-- apoiador, a métrica não conta, e alguém teria de repassar tudo na mão depois.
--
-- Agora a Evolution avisa a cada marcação (evento LABELS_ASSOCIATION) e o PIE
-- aplica a etiqueta equivalente. A menina marca uma vez, no lugar onde já está
-- trabalhando, e os dois lados ficam em dia.
--
-- ── COMO OS NOMES SE ENCONTRAM ──────────────────────────────────────────────
--
-- No WhatsApp está "Apoiadores"; no PIE, "Apoiador". É a mesma coisa, e exigir
-- que alguém padronize os dois lados é pedir para dar errado no dia cheio.
--
-- Então a comparação é FROUXA de propósito: sem acento, sem maiúscula, sem
-- plural, sem espaço sobrando. "Apoiadores" acha "Apoiador"; "Liderana" (que é
-- como o WhatsApp guardou, sem cedilha) acha "Liderança".
--
-- Quando o palpite não serve, `wa_label` manda: escreva ali o nome exato do
-- WhatsApp e ele ganha da comparação frouxa.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O NOME DO OUTRO LADO, QUANDO O PALPITE NÃO BASTA
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.tags
  add column if not exists wa_label text;

comment on column public.tags.wa_label is
  'Nome EXATO da etiqueta no WhatsApp. Só é preciso quando a comparação por nome não acerta.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A COMPARAÇÃO FROUXA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `unaccent` é extensão e nem sempre está instalada. Esta faz o suficiente
-- para português, sem depender de nada.
create or replace function public.unaccent_simples(v text)
returns text
language sql
immutable
as $$
  select translate(
    coalesce(v, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  );
$$;

-- `immutable` porque entra em índice. Sem isso o Postgres recusa.
create or replace function public.chave_etiqueta(v text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             lower(trim(coalesce(unaccent_simples(v), ''))),
             '(es|s)$', ''            -- plural: "apoiadores" -> "apoiador"
           ),
           '[^a-z0-9]+', '', 'g'      -- espaço, hífen e o que mais vier
         );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ACHAR A ETIQUETA DO PIE A PARTIR DO NOME DO WHATSAPP
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.tag_do_whatsapp(p_nome text)
returns bigint
language sql
stable
as $$
  select id from public.tags
   where ativa
     and (
       -- o explícito ganha do palpite
       chave_etiqueta(wa_label) = chave_etiqueta(p_nome)
       or chave_etiqueta(nome)  = chave_etiqueta(p_nome)
     )
   order by (chave_etiqueta(wa_label) = chave_etiqueta(p_nome)) desc
   limit 1;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. APLICAR (OU TIRAR) A ETIQUETA NA CONVERSA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Chamada pelo webhook, com a chave de serviço. Devolve o que fez para o log —
-- "não achei a etiqueta" e "não achei a conversa" são coisas diferentes, e sem
-- distinguir ninguém descobre por que a marcação não apareceu.
-- ── A FUNÇÃO `etiqueta_do_whatsapp` NÃO MORA MAIS AQUI ──────────────────────
--
-- Ela estava definida em TRÊS arquivos: aqui, no `conversa-por-lid.sql` e no
-- `etiqueta-espera-a-conversa.sql`. Três cópias da mesma função é três versões
-- que se desencontram — e desencontram em SILÊNCIO: rodar o arquivo errado
-- depois substitui a boa pela velha, e as etiquetas voltam a ser descartadas
-- sem nada na tela dizendo.
--
-- Aconteceu de verdade: a versão nova nasceu sem as duas proteções de `lid.`
-- que o `conversa-por-lid.sql` tinha acrescentado, porque foi ESTE arquivo que
-- usei de base.
--
-- Agora ela mora num lugar só: `supabase/etiqueta-espera-a-conversa.sql`.


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CONFERIR O ENCAIXE DOS NOMES QUE JÁ EXISTEM NO WHATSAPP
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Estes são os nomes lidos da conta da campanha em 27/08. O que vier com
-- `tag_no_pie` nulo precisa de uma etiqueta correspondente — ou some em
-- silêncio quando a menina marcar.
select w.nome                                as no_whatsapp,
       coalesce(t.nome, '— SEM PAR NO PIE —') as no_pie
  from (values
    ('Apoiadores'), ('Nao apoiador'), ('Material'),
    ('Responder depois'), ('Liderana'), ('Importante')
  ) as w(nome)
  left join public.tags t on t.id = public.tag_do_whatsapp(w.nome);
