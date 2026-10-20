-- ============================================================================
-- QUEM RESPONDEU PELO CELULAR TAMBÉM TEM NOME
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── A DECISÃO QUE MOTIVA ISTO ───────────────────────────────────────────────
--
-- A campanha vai dedicar um celular por número, e as meninas VÃO atender pelo
-- aparelho. Isso funciona: o celular é o aparelho principal e o PIE é um
-- aparelho vinculado, então tudo que ela manda pelo celular chega aqui pelo
-- webhook e entra na conversa.
--
-- O que não chegava era o AUTOR. Mensagem enviada pelo aplicativo entrava com
-- `enviada_por` nulo — igual à do robô do fluxo. Na supervisão ela aparecia
-- sem ninguém atrás, e qualquer contagem por atendente que passe a olhar essa
-- coluna contaria o trabalho dela como se fosse da máquina.
--
-- Num time onde cada número é de UMA atendente, isso é informação que já
-- existe e estava sendo jogada fora.
--
-- ── POR QUE GATILHO, E NÃO DENTRO DE `receber_mensagem` ─────────────────────
--
-- `receber_mensagem` está definida em QUATRO arquivos deste repositório
-- (ingestao, varios-numeros, rodar-agora, encerrada-fica-encerrada). Mexer no
-- corpo dela obrigaria a acertar as quatro cópias, e a que ficasse para trás
-- traria o defeito de volta no dia em que alguém rodasse o script antigo — que
-- é o gesto mais seguro que existe e por isso o mais perigoso.
--
-- O gatilho é um lugar só, e não depende de qual cópia foi rodada por último.
--
-- ── COMO ELE SABE QUE VEIO DO CELULAR ───────────────────────────────────────
--
-- Pela coluna `bruto`, e isto é o miolo da regra:
--
--   PIE           `enviada_por` já vem com o id de quem clicou. Não entra aqui.
--   robô do fluxo `enviada_por` nulo e `bruto` NULO. Não entra aqui — e é o
--                 que impede o robô de ser creditado a uma pessoa.
--   celular       só chega pelo webhook, e o webhook guarda o pacote inteiro
--                 em `bruto`. É a única saída com `bruto` preenchido.
--
-- E o eco não atrapalha: a Evolution devolve por webhook tudo que o PIE mandou,
-- mas `receber_mensagem` insere com `on conflict (wa_id) do nothing`. A linha
-- do PIE já está lá com o autor certo, e o eco não faz nada.

create or replace function public.creditar_resposta_do_celular()
returns trigger language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dono uuid;
begin
  select n.atendente_id into v_dono
    from public.conversas c
    join public.numeros   n on n.id = c.numero_id
   where c.id = new.conversa_id;

  -- Número sem dono cadastrado fica nulo mesmo. Chutar uma atendente aqui
  -- seria pior que não creditar: métrica de trabalho errada é o que decide
  -- escala de gente.
  if v_dono is null then
    return null;
  end if;

  update public.mensagens
     set enviada_por = v_dono
   where id = new.id and enviada_por is null;

  return null;
end $$;

drop trigger if exists mensagem_do_celular_tem_autor on public.mensagens;
create trigger mensagem_do_celular_tem_autor
  after insert on public.mensagens
  for each row
  when (
    new.direcao = 'outbound'
    and new.enviada_por is null
    and new.bruto is not null
  )
  execute function public.creditar_resposta_do_celular();

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE JÁ ESTÁ GRAVADO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O gatilho só vale daqui para frente. Hoje há 1.192 saídas pelo celular sem
-- autor — 24% de tudo que a equipe já respondeu. Deixá-las em branco faria a
-- métrica dizer que o trabalho começou hoje.
--
-- A mesma regra, aplicada ao passado. Roda de novo sem efeito, porque só toca
-- o que ainda está nulo.
update public.mensagens m
   set enviada_por = n.atendente_id
  from public.conversas c
  join public.numeros   n on n.id = c.numero_id
 where m.conversa_id     = c.id
   and m.direcao         = 'outbound'
   and m.enviada_por is null
   and m.bruto       is not null
   and n.atendente_id is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Antes: toda saída sem autor era um monte só. Agora dá para separar o que a
-- equipe respondeu pelo aparelho do que o robô mandou sozinho.
select case
         when enviada_por is not null then 'tem autor'
         when bruto is not null       then 'pelo celular, sem dono no número'
         else 'robô do fluxo'
       end                        as origem,
       count(*)                   as mensagens
  from public.mensagens
 where direcao = 'outbound'
 group by 1
 order by 2 desc;
