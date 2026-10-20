-- ============================================================================
-- QUEM FALOU PELO WHATSAPP E NUNCA VIROU CADASTRO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo — quem já entrou não duplica.
--
-- ── O BURACO ────────────────────────────────────────────────────────────────
--
-- 336 pessoas falaram com a campanha pelo WhatsApp. 255 delas não existem em
-- número nenhum do painel: custaram tráfego pago, estão na caixa das meninas, e
-- somem de todo relatório.
--
-- A causa não é defeito: virar cadastro exige a atendente clicar em "cadastrar"
-- na ficha. Com 180 conversas na fila, ninguém clica.
--
-- ── SÓ ENTRA QUEM TEM NOME ──────────────────────────────────────────────────
--
-- Esta é a decisão que importa aqui, e ela vale explicar.
--
-- Trazer as 255 sem filtro encheria a base de linha sem pessoa atrás — um
-- telefone e nada mais. O número do painel subiria e a INFORMAÇÃO PIORARIA:
-- "290 munícipes" viraria "545", e metade seria fantasma que ninguém consegue
-- procurar, ligar ou contar por município.
--
-- Número maior que mente é pior que número menor que diz a verdade.
--
-- Quem fica de fora não se perde: continua na conversa, e entra no dia em que
-- disser o nome. É exatamente isso que o roteiro de boas-vindas resolve — ele
-- pergunta nome e cidade em toda conversa nova.
--
-- ── DE ONDE VEM O NOME E A CIDADE ───────────────────────────────────────────
--
-- `nome` é o que a atendente confirmou. `nome_sugerido` é o do perfil do
-- WhatsApp, lido pelo webhook. O confirmado ganha; o sugerido serve quando não
-- há confirmação — apelido de perfil é melhor que vazio, e a atendente corrige
-- na ficha quando reparar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. QUEM ENTRA
-- ─────────────────────────────────────────────────────────────────────────────
with candidatas as (
  select
    c.id,
    right(public.so_digitos(c.telefone), 11)                          as dig,
    c.telefone,
    coalesce(nullif(btrim(c.nome), ''),
             nullif(btrim(c.nome_sugerido), ''))                      as nome,
    coalesce(nullif(btrim(c.municipio), ''),
             nullif(btrim(c.municipio_sugerido), ''))                 as municipio,
    coalesce(nullif(btrim(c.bairro), ''),
             nullif(btrim(c.bairro_sugerido), ''))                    as bairro
  from public.conversas c
  where not exists (
    select 1 from public.liderancas l
     where l.telefone_digitos = right(public.so_digitos(c.telefone), 11)
  )
),
-- A mesma pessoa pode ter conversa em dois números. Uma linha por telefone.
unicas as (
  select distinct on (dig) *
    from candidatas
   where nome is not null
   order by dig, id
),
nova as (
  insert into public.liderancas
    (nome, telefone, municipio, bairro, tipo, created_via)
  select nome, telefone, municipio, bairro, 'lead', 'whatsapp'
    from unicas
  returning id
)
select
  (select count(*) from candidatas)                          as sem_cadastro,
  (select count(*) from unicas)                              as entraram,
  (select count(*) from candidatas where nome is null)       as ficaram_de_fora_sem_nome,
  (select count(*) from unicas where municipio is not null)  as com_cidade;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A CONVERSA PASSA A APONTAR PARA A PESSOA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sem isto a ficha continuaria pedindo cadastro de quem acabou de ser
-- cadastrado, e a atendente faria de novo o trabalho que a máquina já fez.
--
-- `cadastrado_por` fica NULO de propósito: ninguém clicou. Atribuir a alguém
-- seria inventar autoria, e é por `cadastrado_por` que se audita quem
-- cadastrou o quê.
update public.conversas c
   set lideranca_id  = l.id,
       cadastrado_em = coalesce(c.cadastrado_em, now()),
       nome          = coalesce(c.nome, l.nome),
       municipio     = coalesce(c.municipio, l.municipio)
  from public.liderancas l
 where l.telefone_digitos = right(public.so_digitos(c.telefone), 11)
   and c.lideranca_id is distinct from l.id;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  (select count(*) from public.liderancas where tipo in ('lead','lideranca')) as municipes_agora,
  (select count(*) from public.conversas where cadastrado_em is null)          as conversas_sem_cadastro;
