-- ============================================================================
-- MAIS ÁUDIO E MAIS SANTINHO POR CHIP
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE AGORA ───────────────────────────────────────────────────────────
--
-- O pedido veio do Emanuel, mas o que decide é a medição: os chips estão
-- BATENDO NO TETO, e bater no número redondo significa que a fila parou por
-- causa do limite, não por falta de gente pedindo.
--
-- Nos últimos 7 dias, melhor dia de cada chip contra o teto de 200:
--
--     Maiana ............ 200   ← exatamente o teto
--     Talita Oliveira ... 200   ← exatamente o teto
--     Thiago ............ 200   ← exatamente o teto
--     Patricia Barbora .. 196
--     Ariane ............ 171
--
-- E no pico de hora, contra o teto de 30: onze chips marcaram exatamente 30.
--
-- ── POR QUE É SEGURO SUBIR ──────────────────────────────────────────────────
--
-- Três coisas, nesta ordem de importância:
--
-- 1. NENHUM chip tem registro de queda. Os 19 estão `open`, e o campo
--    `caiu_em` está vazio em todos — inclusive nos que rodam desde 29/08.
--
-- 2. Este material é RESPOSTA, não abordagem. A pessoa pediu o áudio ou o
--    santinho e a atendente mandou. O WhatsApp pune envio não solicitado em
--    massa; conversa em que o outro lado pediu é o oposto disso.
--
-- 3. Os chips têm de três semanas a um mês de uso contínuo. Chip aquecido
--    aguenta volume que chip novo não aguenta.
--
-- ── POR QUE O DIÁRIO SOBE MAIS QUE O DA HORA ────────────────────────────────
--
--     por hora:  30 → 40   (+33%)
--     por dia:  200 → 400  (+100%)
--
-- Não é distração: o WhatsApp reage muito mais a RAJADA do que a total. Cem
-- mensagens em dez minutos chamam atenção; quatrocentas espalhadas por dez
-- horas de expediente, não.
--
-- Subir o teto da hora na mesma proporção seria convidar a equipe a despejar
-- tudo de manhã — e é exatamente esse desenho que derruba chip.
--
-- 40 por hora durante as dez horas de expediente dá as 400, sem rajada.
--
-- ── SE UM CHIP CAIR ─────────────────────────────────────────────────────────
--
-- Voltar é um comando:
--
--     update public.numeros set materiais_por_hora = 30, materiais_por_dia = 200;
--
-- E vale voltar ao primeiro sinal. Chip derrubado na véspera da eleição não se
-- recupera a tempo.

alter table public.numeros alter column materiais_por_hora set default 40;
alter table public.numeros alter column materiais_por_dia  set default 400;

-- Só quem ainda está no teto antigo. Chip com limite ajustado à mão por algum
-- motivo específico continua como está — sobrescrever apagaria uma decisão que
-- alguém tomou olhando o caso.
update public.numeros
   set materiais_por_hora = 40
 where materiais_por_hora = 30;

update public.numeros
   set materiais_por_dia = 400
 where materiais_por_dia = 200;

-- ── conferência ─────────────────────────────────────────────────────────────
select apelido, materiais_por_hora as por_hora, materiais_por_dia as por_dia, conexao
  from public.numeros where ativo order by apelido;
