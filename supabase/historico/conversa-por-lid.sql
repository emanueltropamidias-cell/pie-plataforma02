-- ============================================================================
-- A CONVERSA QUE CHEGOU SEM TELEFONE
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
--
-- A sessão da Maiana caiu e ela atendeu ~420 pessoas direto no aparelho. Ao
-- reconectar, a Evolution recebeu 452 conversas de volta. Só 108 tinham
-- telefone. As outras 371 vieram como `@lid` — o identificador anônimo que o
-- WhatsApp usa hoje.
--
-- Não é a Evolution que perde o número. Quando a mensagem chega AO VIVO, o
-- webhook traz `key.remoteJidAlt` com o telefone real. Quando ela chega pelo
-- history sync de uma reconexão, o WhatsApp entrega só o identificador. O
-- telefone não é descartado no caminho: ele nunca é enviado.
--
-- Procurei nos três lugares onde poderia estar — agenda de contatos, mensagem
-- armazenada, endpoint de mapeamento. Não está em nenhum. Na Evolution 2.3.7
-- não existe.
--
-- ── POR QUE NÃO DÁ PARA SIMPLESMENTE IGNORAR ────────────────────────────────
--
-- São os leads do tráfego pago. Uma delas guarda o `externalAdReply` com o
-- texto do anúncio inteiro — "Se você é direita raiz, clica no botão aqui
-- embaixo". E 336 das 371 têm a última mensagem do LEAD: gente esperando
-- resposta.
--
-- Deixar de fora é a campanha medir menos do que fez e não saber disso.
--
-- ── O DESENHO ───────────────────────────────────────────────────────────────
--
-- A conversa entra com o IDENTIFICADOR no lugar do telefone, escrito
-- `lid.143417564733621` — com ponto, que telefone nenhum tem. Ela conta na
-- métrica, aparece na fila, recebe etiqueta, tem dona.
--
-- Quando a pessoa mandar a próxima mensagem, o webhook traz o telefone real e
-- `fundir_lid` COSTURA as duas: a conversa antiga ganha o número e continua a
-- mesma — histórico, dona, etiqueta e SLA intactos.
--
-- Sem essa costura, a mesma pessoa viraria duas conversas e a métrica que você
-- passou o dia consertando inflaria de novo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. ENDEREÇO DE LID NÃO É TELEFONE, E O BANCO INTEIRO PRECISA SABER
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `so_digitos` é o funil por onde passa TODO cruzamento de pessoa no sistema:
-- achar o lead na base, aplicar etiqueta do WhatsApp, decidir se a conversa já
-- é gente conhecida.
--
-- Se ela devolvesse os dígitos do identificador, `right(...,11)` daria algo
-- como 17564733621 — que tem cara de celular de DDD 17. Um dia isso ia bater
-- com o telefone de um eleitor de verdade e amarrar a conversa errada à pessoa
-- errada. Numa base de campanha isso é mandar material político para quem não
-- pediu.
--
-- Consertar no funil, e não em cada consulta, é o que garante que a consulta
-- escrita daqui a três meses já nasce protegida.
create or replace function public.so_digitos(v text)
returns text language sql immutable as $$
  select case
           when coalesce(v, '') like 'lid.%' then ''
           else regexp_replace(coalesce(v, ''), '\D', '', 'g')
         end;
$$;

comment on function public.so_digitos(text) is
  'Dígitos de um telefone. Devolve vazio para endereço lid.* — identificador anônimo do WhatsApp não é telefone e não pode cruzar com pessoa.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A ETIQUETA NÃO PODE CAIR NUMA CONVERSA SEM TELEFONE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Aqui os dois lados passam por `so_digitos`. Com o funil devolvendo vazio, uma
-- marcação feita num contato sem telefone daria '' = '' e acertaria uma
-- conversa `lid.` QUALQUER — a primeira da ordenação.
--
-- O vazio nunca pode servir de chave.
-- ── A FUNÇÃO `etiqueta_do_whatsapp` NÃO MORA MAIS AQUI ──────────────────────
--
-- Ela estava definida em TRÊS arquivos: aqui, no `etiquetas-do-whatsapp.sql` e
-- no `etiqueta-espera-a-conversa.sql`. Três cópias da mesma função é três
-- versões que se desencontram — e desencontram em silêncio: rodar o arquivo
-- errado depois substitui a boa pela velha, e as etiquetas voltam a ser
-- descartadas sem nada na tela dizendo.
--
-- Aconteceu de verdade: a versão nova nasceu sem as duas proteções de `lid.`
-- que ESTE arquivo tinha acrescentado.
--
-- Agora ela mora num lugar só: `supabase/etiqueta-espera-a-conversa.sql`.
-- Rode aquele depois deste se precisar recriar do zero.



drop trigger if exists liderancas_normaliza_telefone on public.liderancas;
create trigger liderancas_normaliza_telefone
  before insert or update of telefone on public.liderancas
  for each row execute function public.liderancas_normaliza_telefone();

-- Se alguma já escapou antes desta trava existir, limpa.
update public.liderancas
   set telefone = null
 where telefone like 'lid.%';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. CONFERÊNCIA
-- ─────────────────────────────────────────────────────────────────────────────
select 'lid nao vira telefone'    as prova,
       public.so_digitos('lid.143417564733621') = '' as passou
union all
select 'telefone continua igual',
       public.so_digitos('55 71 99233-0000') = '5571992330000'
union all
select 'fundir_lid existe',
       exists (select 1 from pg_proc where proname = 'fundir_lid');
