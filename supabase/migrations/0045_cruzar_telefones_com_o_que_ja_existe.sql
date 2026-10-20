-- ============================================================================
-- QUANTO UMA AGENDA NOVA ACRESCENTA DE GENTE QUE A CAMPANHA AINDA NÃO TEM
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Só cria função de leitura.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- 29/09, Emanuel, ao pedir a importação de agenda por arquivo: "essas bases
-- não podem duplicar".
--
-- O contato repetido NÃO é recusado na importação, e isso é decisão, não
-- descuido: a agenda do Walter é a agenda do Walter. Tirar dela quem também
-- está na do Pedro produziria uma lista que não corresponde a celular nenhum,
-- e que ninguém consegue conferir.
--
-- O que não pode é o TOTAL contar a mesma pessoa duas vezes — e isso já está
-- resolvido desde 28/09: a somatória de Outras bases conta por pessoa
-- distinta (`bases_venn`, 0042), somando as regiões do diagrama em vez de
-- somar gaveta com gaveta.
--
-- Então o que falta é MEDIR a repetição e mostrá-la na hora da importação,
-- para ele saber quanto a agenda nova acrescenta de gente de verdade. Uma
-- agenda de 2.000 contatos que traz 40 pessoas novas e uma que traz 1.500 são
-- notícias muito diferentes, e hoje as duas apareciam igual.
--
-- ── POR QUE NÃO CONTAR NO NAVEGADOR ─────────────────────────────────────────
--
-- Porque o cruzamento é contra 63 mil telefones. Mandá-los ao navegador para
-- comparar lá seria despejar a base inteira da campanha na máquina de quem
-- abriu a tela — inclusive o que ela não teria permissão de ver numa consulta
-- normal.
--
-- Aqui só atravessa a resposta: quais dos telefones ENVIADOS já são conhecidos.
-- Nada do banco sai que já não estivesse na pergunta.

create or replace function public.base_externa_cruzar(p_telefones text[])
returns jsonb
language sql
stable
security definer
set search_path = public
as $function$
  with pedido as materialized (
    select distinct public.fone_canonico(t) as f
      from unnest(coalesce(p_telefones, '{}')) t
     where public.fone_canonico(t) <> ''
  ),
  campanha as materialized (
    select public.fone_canonico(telefone) as f
      from liderancas where telefone is not null
    union
    select public.fone_canonico(telefone)
      from conversas where telefone is not null and telefone not like 'lid.%'
  ),
  bases as materialized (
    select distinct public.fone_canonico(telefone) as f
      from bases_externas_pessoas where telefone is not null
  )
  select case when not public.perfil_admin() then null else jsonb_build_object(
    -- Só os telefones que VIERAM na pergunta e já são conhecidos. A lista de
    -- quem a campanha tem não sai daqui.
    'campanha', coalesce((select jsonb_agg(p.f) from pedido p
                           where exists (select 1 from campanha c where c.f = p.f)), '[]'::jsonb),
    'bases',    coalesce((select jsonb_agg(p.f) from pedido p
                           where exists (select 1 from bases b where b.f = p.f)
                             and not exists (select 1 from campanha c where c.f = p.f)), '[]'::jsonb)
  ) end
$function$;

comment on function public.base_externa_cruzar is
  'Dos telefones enviados, quais a campanha já conhece — separando os que vêm de cadastro/conversa dos que vêm de outra base externa. Devolve SÓ o que estava na pergunta: a base da campanha não atravessa. Serve para dizer, na hora de importar uma agenda, quanta gente nova ela acrescenta de verdade.';

revoke all on function public.base_externa_cruzar(text[]) from public, anon;
grant execute on function public.base_externa_cruzar(text[]) to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Rodando como postgres, `perfil_admin()` é falso e a função devolve nulo —
-- que é a prova de que ela não fala com quem não é da coordenação.
select public.base_externa_cruzar(array['71999999999']) as sem_login_devolve_nulo;
