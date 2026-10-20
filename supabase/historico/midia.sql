-- ============================================================================
-- MÍDIA — onde o áudio e a foto que a pessoa manda vão morar
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE GUARDAR, EM VEZ DE APONTAR PARA O WHATSAPP ──────────────────────
--
-- A mensagem que chega traz uma URL do servidor do WhatsApp. Ela parece
-- resolver o problema e não resolve:
--
--   · o arquivo é CIFRADO — baixar direto devolve bytes embaralhados;
--   · a URL EXPIRA em horas;
--   · e ela é do WhatsApp, não nossa. No dia em que o número cair ou for
--     banido, todo áudio que a campanha recebeu vira link quebrado.
--
-- A gente busca o arquivo já decifrado na Evolution, guarda no nosso
-- armazenamento, e a partir daí ele é da campanha. Custa espaço; é o preço de
-- ainda ter a conversa daqui a seis meses.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O BALDE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- PRIVADO, e essa é a decisão que mais importa aqui. Um balde público significa
-- que qualquer pessoa com o endereço ouve o áudio de qualquer eleitor — e
-- endereço vaza em print, em log, em histórico de navegador. O acesso passa por
-- link assinado, que vence em minutos e é emitido só para quem a RLS deixaria
-- ver a conversa.
insert into storage.buckets (id, name, public, file_size_limit)
values ('conversas', 'conversas', false, 26214400)   -- 25 MB, o teto do WhatsApp
on conflict (id) do update set public = false, file_size_limit = 26214400;

-- Quem lê: a equipe de atendimento. Quem escreve: só o servidor, com a chave de
-- serviço — o navegador nunca envia arquivo direto para cá, senão qualquer
-- conta logada poderia encher o balde.
drop policy if exists "midia le" on storage.objects;
drop policy if exists "midia escreve" on storage.objects;

create policy "midia le" on storage.objects
  for select to authenticated
  using (bucket_id = 'conversas' and public.perfil_atendimento());

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. ONDE O ARQUIVO FICA REGISTRADO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Coluna nova em vez de reaproveitar `midia_url`: a URL original continua
-- guardada. Quando um áudio não aparecer, a diferença entre "o WhatsApp não
-- mandou" e "a gente não conseguiu baixar" é o que diz onde procurar.
alter table public.mensagens
  add column if not exists midia_arquivo text,
  -- Marca o que falhou, para a tela poder dizer "não consegui baixar" em vez de
  -- mostrar um espaço vazio que parece defeito da tela.
  add column if not exists midia_erro text,
  -- A MINIATURA QUE O WHATSAPP JÁ MANDA, em base64, junto do aviso da mensagem.
  --
  -- Ela chega antes do arquivo e permite mostrar a imagem borrada enquanto o
  -- download acontece — sem isso a bolha fica vazia por alguns segundos e
  -- parece defeito.
  --
  -- ESTAVA SÓ NO BANCO. O código escreve (`evolution/route.ts`,
  -- `enviar-midia/route.ts`) e lê (caixa e supervisão) desde sempre, mas
  -- nenhum arquivo do repositório a criava: alguém a adicionou pelo painel e
  -- não trouxe para cá. Quem rebuildasse a base pelos scripts teria a caixa
  -- quebrada sem entender por quê.
  add column if not exists midia_previa text;

create index if not exists mensagens_com_midia
  on public.mensagens (conversa_id) where midia_arquivo is not null;

-- ── conferência ─────────────────────────────────────────────────────────────
select
  (select count(*) from storage.buckets where id = 'conversas')          as balde_criado,
  (select public from storage.buckets where id = 'conversas')            as e_publico,
  (select count(*) from information_schema.columns
    where table_name = 'mensagens' and column_name = 'midia_arquivo')    as coluna_arquivo,
  (select count(*) from pg_policies
    where tablename = 'objects' and policyname = 'midia le')             as politica_leitura;
