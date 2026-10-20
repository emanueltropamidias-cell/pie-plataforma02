-- ============================================================================
-- A ETIQUETA PASSA A CONTAR NAS MÉTRICAS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O PROBLEMA ──────────────────────────────────────────────────────────────
--
-- Havia dois lugares para dizer a mesma coisa. A atendente marcava a etiqueta
-- "Apoiador" e o painel continuava mostrando zero apoiadores, porque o painel
-- lê `conversas.status_lead` — uma coluna que nenhuma tela preenchia.
--
-- Marcar em dois lugares não é opção: ninguém faz, e o painel mente.
--
-- ── A SOLUÇÃO: A ETIQUETA SABE A QUE EIXO PERTENCE ──────────────────────────
--
--   eixo 'status'   uma por pessoa, e a soma fecha 100%. Apoiador, hater.
--   eixo 'demanda'  zero ou várias. Saúde, material.
--   eixo nulo       etiqueta de TRABALHO — "ligar depois", "número errado".
--                   Serve para a equipe se organizar e NÃO entra em métrica
--                   nenhuma. Sem essa terceira opção, "número errado" viraria
--                   categoria política no relatório.
--
-- Marcar a etiqueta escreve na coluna. Um gesto, um lugar.

alter table public.tags
  add column if not exists eixo  text check (eixo in ('status', 'demanda')),
  add column if not exists valor text;

comment on column public.tags.eixo is
  'status = uma por pessoa e fecha 100%. demanda = zero ou varias. nulo = etiqueta de trabalho, nao entra em metrica.';

-- ─────────────────────────────────────────────────────────────────────────────
-- AS ETIQUETAS DOS DOIS EIXOS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `valor` tem de casar EXATAMENTE com o que o painel espera — os mesmos nomes
-- de src/lib/atendimento.ts. Um acento a mais aqui e a categoria some do
-- relatório sem erro nenhum, que é o pior jeito de falhar.
insert into public.tags (nome, cor, descricao, ordem, eixo, valor) values
  ('Apoiador',      '#12703c', 'Declarou apoio ou pediu material.',                    100, 'status',  'apoiador'),
  ('Multiplicador', '#5b34c9', 'Aceitou levar o projeto para outras pessoas.',         101, 'status',  'multiplicador'),
  ('Tem candidato', '#b8880a', 'Ja tem candidato a deputado federal.',                 102, 'status',  'tem_candidato'),
  ('Indeciso',      '#1f6a9e', 'Conversou, nao recusou, mas nao declarou apoio.',      103, 'status',  'indeciso'),
  ('Hater',         '#c02020', 'Hostil a campanha. Prevalece sobre as outras.',        104, 'status',  'hater'),
  ('Saude',         '#0e7490', 'Pediu ajuda com saude.',                               200, 'demanda', 'saude'),
  ('Emprego',       '#8a6009', 'Pediu ajuda com emprego.',                             201, 'demanda', 'emprego'),
  ('Juridico',      '#5b34c9', 'Pediu ajuda juridica.',                                202, 'demanda', 'juridico'),
  ('Material',      '#12703c', 'Pediu adesivo, santinho ou panfleto.',                 203, 'demanda', 'material'),
  ('Geral',         '#52535c', 'Outro pedido, sem categoria propria.',                 204, 'demanda', 'geral')
on conflict (nome) do update
  set eixo = excluded.eixo, valor = excluded.valor, cor = excluded.cor,
      descricao = excluded.descricao, ordem = excluded.ordem;

-- A "Quer material" da leva anterior vira a mesma coisa que "Material". Ficar
-- com duas etiquetas para o mesmo pedido rachava o número no relatório.
delete from public.conversa_tags
 where tag_id in (select id from public.tags where nome = 'Quer material');
delete from public.tags where nome = 'Quer material';

-- ─────────────────────────────────────────────────────────────────────────────
-- O GATILHO QUE MANTÉM A COLUNA EM DIA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NO BANCO, e não na tela: marcar etiqueta acontece na caixa hoje, e amanhã vai
-- acontecer no roteiro, na importação e na correção manual. Regra que mora numa
-- tela vale só para aquela tela.
create or replace function public.tag_alimenta_eixos()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_eixo  text;
  v_valor text;
  v_conversa bigint;
begin
  v_conversa := coalesce(new.conversa_id, old.conversa_id);

  select t.eixo, t.valor into v_eixo, v_valor
    from public.tags t
   where t.id = coalesce(new.tag_id, old.tag_id);

  -- Etiqueta de trabalho não mexe em métrica.
  if v_eixo is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    if v_eixo = 'status' then
      -- STATUS É UMA SÓ. Marcar "Apoiador" em quem já era "Indeciso" tem de
      -- TIRAR o indeciso — senão a soma passa de 100% e o eixo perde o sentido.
      delete from public.conversa_tags ct
       using public.tags t
       where ct.conversa_id = v_conversa
         and ct.tag_id = t.id
         and t.eixo = 'status'
         and ct.tag_id <> new.tag_id;

      update public.conversas
         set status_lead = v_valor, atualizado_em = now()
       where id = v_conversa;
    else
      update public.conversas
         set demandas = (
               select array_agg(distinct d)
                 from unnest(demandas || array[v_valor]) as d
             ),
             atualizado_em = now()
       where id = v_conversa;
    end if;

  elsif tg_op = 'DELETE' then
    if v_eixo = 'status' then
      update public.conversas
         set status_lead = null, atualizado_em = now()
       where id = v_conversa and status_lead = v_valor;
    else
      update public.conversas
         set demandas = array_remove(demandas, v_valor), atualizado_em = now()
       where id = v_conversa;
    end if;
  end if;

  return coalesce(new, old);
end $$;

drop trigger if exists tag_alimenta_eixos on public.conversa_tags;
create trigger tag_alimenta_eixos
  after insert or delete on public.conversa_tags
  for each row execute function public.tag_alimenta_eixos();

-- ─────────────────────────────────────────────────────────────────────────────
-- ALINHA O QUE JÁ FOI MARCADO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Quem etiquetou antes do gatilho existir não pode ficar de fora do relatório.
update public.conversas c
   set status_lead = (
     select t.valor from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
     where ct.conversa_id = c.id and t.eixo = 'status'
     order by ct.marcada_em desc limit 1
   )
 where exists (
   select 1 from public.conversa_tags ct
    join public.tags t on t.id = ct.tag_id
   where ct.conversa_id = c.id and t.eixo = 'status'
 );

update public.conversas c
   set demandas = coalesce((
     select array_agg(distinct t.valor) from public.conversa_tags ct
      join public.tags t on t.id = ct.tag_id
     where ct.conversa_id = c.id and t.eixo = 'demanda'
   ), '{}')
 where exists (
   select 1 from public.conversa_tags ct
    join public.tags t on t.id = ct.tag_id
   where ct.conversa_id = c.id and t.eixo = 'demanda'
 );

-- ── conferência ─────────────────────────────────────────────────────────────
select coalesce(eixo, '(trabalho — nao conta)') as eixo,
       nome, valor,
       (select count(*) from public.conversa_tags ct where ct.tag_id = t.id) as usos
  from public.tags t
 order by eixo nulls last, ordem;
