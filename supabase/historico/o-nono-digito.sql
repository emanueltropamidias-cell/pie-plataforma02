-- ============================================================================
-- O NONO DÍGITO — 621 TELEFONES QUE NÃO CASAM COM NINGUÉM
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O DEFEITO ───────────────────────────────────────────────────────────────
--
-- O WhatsApp entrega o endereço de celular antigo SEM o nono dígito:
--
--     557583543633     55 + DDD 75 + 8354-3633
--
-- São doze dígitos. E todo cruzamento de pessoa neste sistema faz
-- `right(so_digitos(telefone), 11)`, que nesses doze devolve:
--
--     57583543633      <- DDD 57, que não existe no Brasil
--
-- O corte come o "5" do código do país e deixa o número irreconhecível. Não dá
-- erro em lugar nenhum: a pessoa simplesmente nunca casa com ela mesma.
--
-- ── O QUE ISSO CUSTOU ───────────────────────────────────────────────────────
--
-- 621 cadastros com a chave podre. Destes, 232 pares são a MESMA PESSOA cadastrada
-- duas vezes — uma pelo WhatsApp e outra pelo tráfego — porque a importação
-- comparou a chave podre e concluiu que era gente nova:
--
--     JOSE CARLOS  557382032848  (whatsapp)  ==  Jose Carlos  5573982032848  (trafego)
--     ARI          557583543633  (whatsapp)  ==  ARI          75983543633    (manual)
--
-- ── POR QUE A CORREÇÃO É NUMA FUNÇÃO SÓ ─────────────────────────────────────
--
-- `right(so_digitos(x), 11)` está escrito TRINTA vezes, em doze arquivos deste
-- repositório. Corrigir chamada por chamada garante esquecer alguma, e a
-- esquecida não dá erro — só deixa de casar, calada.
--
-- `so_digitos` é o funil por onde passa todo cruzamento de pessoa. Não existe
-- um único uso dela fora disso. Consertar o funil conserta as trinta.
--
-- ── O QUE ELA NÃO FAZ ───────────────────────────────────────────────────────
--
-- Não mexe na coluna `telefone`. Esse valor é o endereço que o WhatsApp usa
-- para ENTREGAR mensagem, e para conta antiga o endereço sem o nono dígito é o
-- que funciona. Reescrever ali arriscaria parar de entregar. O que muda é só a
-- CHAVE DE CRUZAMENTO.
--
-- Não junta as 232 duplicatas. Juntar apaga cadastro, e apagar é decisão do
-- Emanuel — a conferência no fim lista os pares para ele olhar.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. OS 67 DDD QUE EXISTEM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Separado numa função porque é usado no funil E na conferência. A mesma lista
-- escrita duas vezes é a que desencontra.
create or replace function public.ddd_valido(v text)
returns boolean language sql immutable as $$
  select v in ('11','12','13','14','15','16','17','18','19','21','22','24','27',
               '28','31','32','33','34','35','37','38','41','42','43','44','45',
               '46','47','48','49','51','53','54','55','61','62','63','64','65',
               '66','67','68','69','71','73','74','75','77','79','81','82','83',
               '84','85','86','87','88','89','91','92','93','94','95','96','97',
               '98','99');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O FUNIL APRENDE AS QUATRO FORMAS TORTAS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- É a MESMA regra de `normalizarTelefone` em src/lib/csv.ts, que foi validada
-- contra 2.539 telefones da Planilha de Atendimentos. Regra de casamento de
-- pessoa escrita diferente no banco e no código é desencontro garantido.
create or replace function public.so_digitos(v text)
returns text language sql immutable as $$
  select case
           when coalesce(v, '') like 'lid.%' then ''
           else (
             select case
                      -- 55 + DDD + OITO: celular antigo, sem o nono dígito. É
                      -- assim que o WhatsApp entrega conta velha. Doze dígitos
                      -- começando em 55 não pode ser outra coisa — local de
                      -- nove daria treze, e DDD com local de dez não existe.
                      --
                      -- O teste do primeiro dígito local protege o FIXO: 2 a 5
                      -- é telefone de casa, tem oito dígitos e não ganha nono.
                      when length(d) = 12
                       and left(d, 2) = '55'
                       and substr(d, 5, 1) in ('6', '7', '8', '9')
                        then substr(d, 1, 4) || '9' || substr(d, 5)

                      -- Mesma forma, mas fixo: tira só o código do país. Sem
                      -- isto o `right(...,11)` come o '5' do 55 e estraga igual.
                      when length(d) = 12 and left(d, 2) = '55'
                        then substr(d, 3)

                      -- DDD + NOVE + oito, com um dígito sobrando no fim. É
                      -- como a exportação do Gabiflow entrega: 719964959300.
                      when length(d) = 12
                       and public.ddd_valido(left(d, 2))
                       and substr(d, 3, 1) = '9'
                        then substr(d, 1, 11)

                      -- DDD + OITO, sem código do país. Digitado à mão, sem o
                      -- nono dígito.
                      when length(d) = 10 and substr(d, 3, 1) in ('6','7','8','9')
                        then substr(d, 1, 2) || '9' || substr(d, 3)

                      else d
                    end
               from (select regexp_replace(coalesce(v, ''), '\D', '', 'g')) as t(d)
           )
         end;
$$;

comment on function public.so_digitos(text) is
  'Dígitos de um telefone, com o nono dígito reposto quando o WhatsApp entrega o celular antigo sem ele (55+DDD+8). Devolve vazio para endereço lid.* — identificador anônimo do WhatsApp não é telefone e não pode cruzar com pessoa.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. QUEM JÁ ESTÁ GRAVADO COM A CHAVE PODRE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O gatilho só recalcula quando `telefone` muda. Sem este update, os 621
-- continuariam com a chave velha até alguém editar cada um na mão.
update public.liderancas
   set telefone_digitos = nullif(right(public.so_digitos(telefone), 11), '')
 where telefone is not null
   and telefone_digitos is distinct from nullif(right(public.so_digitos(telefone), 11), '');

-- A fila de etiquetas tem coluna GERADA a partir da mesma função. Está vazia
-- hoje, mas o valor guardado não recalcula sozinho quando a função muda —
-- então a coluna é refeita, para não guardar chave velha no dia em que encher.
alter table public.etiquetas_pendentes drop column if exists digitos;
alter table public.etiquetas_pendentes
  add column digitos text generated always as (right(public.so_digitos(telefone), 11)) stored;

-- ─────────────────────────────────────────────────────────────────────────────
-- ── conferência ─────────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────

-- Deve dar ZERO. Qualquer linha aqui é chave que continua irreconhecível.
select count(*) as chave_ainda_invalida
  from public.liderancas
 where telefone_digitos is not null
   and (length(telefone_digitos) <> 11
        or not public.ddd_valido(left(telefone_digitos, 2)));

-- OS PARES PARA OLHAR. Nada é apagado aqui — é lista, não faxina.
select l.telefone_digitos,
       count(*)                              as cadastros,
       string_agg(l.nome, ' | ' order by l.created_at)        as nomes,
       string_agg(l.created_via, ' | ' order by l.created_at) as origens
  from public.liderancas l
 where l.telefone_digitos is not null
 group by l.telefone_digitos
having count(*) > 1
 order by count(*) desc, 3;
