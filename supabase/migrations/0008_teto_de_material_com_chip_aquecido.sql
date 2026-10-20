-- ============================================================================
-- OS CHIPS AQUECERAM: O TETO DE MATERIAL SOBE
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- Cada número tem um teto de quantos materiais (áudio, imagem, kit) ele pode
-- mandar por hora e por dia. Estava em 12 por hora e 60 por dia — números de
-- chip NOVO, escolhidos quando os chips eram novos.
--
-- Os chips estão aquecidos agora, e o teto virou o gargalo. Medido nos últimos
-- 14 dias:
--
--   seis números bateram EXATOS 12 numa hora    (2, 4, 6, 7, 9, 11)
--   quatro números bateram EXATOS 60 num dia    (2, 7, 9, 11)
--   17 horas encostaram no teto
--
-- Bater no valor exato do teto não é coincidência: é o teto barrando. A média
-- é bem menor — de 2 a 6 por hora, de 5 a 42 por dia — então o teto não
-- atrapalha o dia comum. Ele atrapalha exatamente no PICO, que é quando a
-- atendente precisa mandar o áudio e recebe "espere uns minutos ou use outro
-- número".
--
--   por hora   12  →  30      um a cada dois minutos
--   por dia    60  → 200
--
-- ── O QUE ISTO NÃO MUDA ─────────────────────────────────────────────────────
--
-- Este teto conta MATERIAL — o que sai da biblioteca e dos kits. Resposta de
-- texto da atendente nunca passou por aqui e continua sem teto: ela responde
-- quem escreveu primeiro, que é conversa iniciada pelo eleitor.
--
-- ── POR QUE O TETO CONTINUA EXISTINDO ───────────────────────────────────────
--
-- Aquecido não é imune. O que derruba chip é RAJADA: trinta mídias em dois
-- minutos parece disparo em massa mesmo vindo de número velho. O teto por hora
-- é o que transforma trinta envios em trinta envios espalhados na hora, e essa
-- é a diferença entre operar e perder o número no meio da campanha.
--
-- Subir mais é decisão de quem conhece o aquecimento de cada chip. Para mudar
-- só um número, sem mexer nos outros:
--
--     update public.numeros set materiais_por_hora = 40, materiais_por_dia = 300
--      where apelido = 'Ariane';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O PADRÃO DA TABELA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Muda também o DEFAULT, e não só as linhas: número cadastrado amanhã tem de
-- nascer com o teto de hoje. Trocar só as linhas deixaria o próximo chip
-- entrando em 12 sem ninguém perceber — é o defeito silencioso de sempre.
alter table public.numeros alter column materiais_por_hora set default 30;
alter table public.numeros alter column materiais_por_dia  set default 200;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. OS NÚMEROS QUE JÁ EXISTEM
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só quem ainda está no valor antigo. Assim, se alguém já tiver ajustado um
-- número na mão para outro valor, este arquivo não desfaz o ajuste — e pode
-- ser rodado de novo sem apagar decisão de ninguém.
update public.numeros
   set materiais_por_hora = 30
 where materiais_por_hora = 12;

update public.numeros
   set materiais_por_dia = 200
 where materiais_por_dia = 60;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O NÚMERO DESCONHECIDO CONTINUA BAIXO, E ISSO É DE PROPÓSITO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `material_pode_sair` tem um segundo teto escrito dentro dela, para quando o
-- número não está na tabela — conversa sem número, ou id que não existe mais.
-- Aquele caminho NÃO sobe junto.
--
-- O motivo: o teto alto é a recompensa do aquecimento, e aquecimento é de um
-- chip específico. Um envio que não sabe de qual número está saindo não pode
-- herdar a confiança de nenhum. Deixar os dois iguais transformaria o caminho
-- desconhecido no buraco por onde a rajada passa.
--
-- Está escrito aqui porque este é o arquivo que alguém vai abrir quando
-- perguntar "por que subi o teto e continua barrando?". A resposta é: aquele
-- envio não tem número.

-- ── conferência ─────────────────────────────────────────────────────────────
select id, apelido, ativo, materiais_por_hora, materiais_por_dia
  from public.numeros
 order by id;

select (select column_default from information_schema.columns
         where table_name = 'numeros' and column_name = 'materiais_por_hora') as padrao_hora,
       (select column_default from information_schema.columns
         where table_name = 'numeros' and column_name = 'materiais_por_dia')  as padrao_dia;
