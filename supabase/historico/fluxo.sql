-- ============================================================================
-- O ROTEIRO QUE RESPONDE SOZINHO
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- Lead de anúncio que espera quatro horas por um "oi" já esfriou. Agora mesmo
-- há 112 pessoas em Aguardando — verba paga parada. O roteiro responde no
-- segundo em que a mensagem chega, pergunta nome e cidade, e entrega para a
-- atendente uma conversa que já sabe quem é a pessoa.
--
-- ── AS TRAVAS VÊM ANTES DA FUNÇÃO, E ISSO NÃO É FORMALIDADE ─────────────────
--
-- Um robô solto no WhatsApp da campanha é o jeito mais rápido de queimar sete
-- números de uma vez. Se ele responder duas vezes, entrar em laço, falar por
-- cima da atendente ou disparar para quem não escreveu, o estrago é público e
-- não tem como recolher.
--
-- São SEIS travas, e cada uma cobre uma forma diferente de dar errado:
--
--   1. CALA QUANDO GENTE FALA.   Assim que uma atendente escreve na conversa,
--                                o robô se aposenta ali PARA SEMPRE. É a trava
--                                mais importante das seis: sem ela, o robô
--                                interrompe a menina no meio de um atendimento.
--
--   2. SÓ RESPONDE A QUEM ESCREVEU. Roda em mensagem recebida, nunca enviada.
--                                Não existe caminho por onde ele inicie
--                                conversa — o que também é o que a lei
--                                eleitoral exige.
--
--   3. TETO DE PASSOS.           No máximo os passos do roteiro, e ponto. Laço
--                                não tem como acontecer porque o contador só
--                                anda para frente.
--
--   4. UMA RESPOSTA POR MENSAGEM. O avanço acontece dentro de um `update`
--                                condicional: duas mensagens no mesmo instante
--                                não produzem duas respostas.
--
--   5. MODO RASCUNHO.            Responde só aos telefones da lista de teste. É
--                                assim que se experimenta com o tráfego ligado
--                                sem escrever para eleitor nenhum.
--
--   6. PARAR TUDO.               Uma chave. Desligou, para na próxima mensagem,
--                                sem deploy e sem esperar ninguém.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O FLUXO GANHA MODO E LISTA DE TESTE
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.fluxos
  add column if not exists modo text not null default 'rascunho'
    check (modo in ('rascunho', 'no-ar'));

alter table public.fluxos
  add column if not exists telefones_teste text[] not null default '{}';

comment on column public.fluxos.modo is
  'rascunho = responde só aos telefones_teste. no-ar = responde a todo lead novo.';

-- `ativo` já existia e continua sendo o PARAR TUDO. Índice parcial único
-- garante um só no ar — não há caminho de escrita que escape.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O PASSO GANHA O QUE FALTAVA PARA SER EXECUTÁVEL
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O desenho antigo era CHECKLIST para a atendente conferir na mão: `criterio`
-- é texto para gente ler. Isso continua valendo e não some — mas para o robô
-- executar, faltam duas coisas: se ele espera resposta, e onde guarda o que a
-- pessoa responder.
alter table public.fluxo_passos
  add column if not exists espera_resposta boolean not null default true;

alter table public.fluxo_passos
  add column if not exists guarda_em text
    check (guarda_em in ('nome', 'municipio', 'bairro'));

comment on column public.fluxo_passos.guarda_em is
  'Onde gravar a resposta da pessoa. Vai para o campo _sugerido — quem confirma é a atendente.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. ONDE A CONVERSA ESTÁ NO ROTEIRO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `fluxo_estagio` já existia, como texto para leitura humana. O contador é
-- separado de propósito: número que só anda para frente é o que torna o laço
-- impossível por construção, e não por cuidado de quem escreve o código.
alter table public.conversas
  add column if not exists fluxo_passo int not null default 0;

alter table public.conversas
  add column if not exists fluxo_em timestamptz;

-- -1 significa APOSENTADO nesta conversa: gente assumiu, e o robô não volta.
comment on column public.conversas.fluxo_passo is
  'Em qual passo do roteiro esta conversa está. -1 = o robô se calou porque uma pessoa respondeu.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRAVA 1: O ROBÔ SE CALA QUANDO GENTE FALA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A mais importante das seis, e por isso mora num GATILHO e não no código da
-- aplicação: assim ela vale para qualquer caminho de escrita, inclusive os que
-- ainda não existem.
--
-- `enviada_por` é o que separa a atendente do robô: mensagem do robô sai com
-- ele nulo, mensagem de gente carrega o id de quem clicou em Enviar.
create or replace function public.fluxo_cala_quando_gente_fala()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.direcao = 'outbound' and new.enviada_por is not null then
    update public.conversas
       set fluxo_passo = -1
     where id = new.conversa_id
       and fluxo_passo <> -1;
  end if;
  return new;
end $$;

drop trigger if exists fluxo_cala_quando_gente_fala on public.mensagens;
create trigger fluxo_cala_quando_gente_fala
  after insert on public.mensagens
  for each row execute function public.fluxo_cala_quando_gente_fala();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. O MOTOR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Uma chamada por mensagem recebida. Ela DECIDE e AVANÇA na mesma transação, e
-- devolve o texto a enviar — ou nada.
--
-- Decidir e avançar juntos é o que sustenta a trava 4: se duas mensagens da
-- mesma pessoa chegarem no mesmo instante, o `update ... where fluxo_passo = X`
-- só acerta uma. A outra encontra o contador já mudado e desiste.
create or replace function public.fluxo_responder(
  p_conversa bigint,
  p_texto    text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fluxo     bigint;
  v_modo      text;
  v_teste     text[];
  v_conv      record;
  v_passo     record;
  v_total     int;
  v_msg       text;
  v_resposta  text;
begin
  -- ── trava 6: parar tudo ────────────────────────────────────────────────
  select id, modo, telefones_teste into v_fluxo, v_modo, v_teste
    from public.fluxos where ativo limit 1;
  if v_fluxo is null then
    return jsonb_build_object('enviar', false, 'motivo', 'sem fluxo ativo');
  end if;

  select c.id, c.telefone, c.fluxo_passo, c.nome, c.nome_sugerido,
         c.municipio, c.municipio_sugerido, c.cadastrado_em
    into v_conv
    from public.conversas c
   where c.id = p_conversa
     for update;

  if v_conv.id is null then
    return jsonb_build_object('enviar', false, 'motivo', 'conversa nao existe');
  end if;

  -- ── trava 1: gente já falou aqui ───────────────────────────────────────
  if v_conv.fluxo_passo = -1 then
    return jsonb_build_object('enviar', false, 'motivo', 'gente assumiu');
  end if;

  -- ── trava 5: modo rascunho ─────────────────────────────────────────────
  if v_modo = 'rascunho'
     and not (right(public.so_digitos(v_conv.telefone), 11) = any (
       select right(public.so_digitos(t), 11) from unnest(v_teste) as t
     )) then
    return jsonb_build_object('enviar', false, 'motivo', 'rascunho: fora da lista de teste');
  end if;

  -- ── trava 3: teto de passos ────────────────────────────────────────────
  select count(*) into v_total from public.fluxo_passos where fluxo_id = v_fluxo;
  if v_conv.fluxo_passo >= v_total then
    return jsonb_build_object('enviar', false, 'motivo', 'roteiro terminou');
  end if;

  -- ── guardar o que a pessoa respondeu ao passo ANTERIOR ─────────────────
  --
  -- Vai para os campos _sugerido, e nunca para os definitivos: quem confirma é
  -- a atendente, com o clique que já existe na ficha. Robô que escreve direto
  -- no cadastro enche a base de "oi" no lugar do nome.
  if v_conv.fluxo_passo > 0 then
    select * into v_passo
      from public.fluxo_passos
     where fluxo_id = v_fluxo and ordem = v_conv.fluxo_passo;

    if v_passo.guarda_em is not null
       and v_conv.cadastrado_em is null
       and length(trim(coalesce(p_texto, ''))) between 2 and 120 then
      v_resposta := trim(p_texto);
      if v_passo.guarda_em = 'nome' then
        update public.conversas
           set nome_sugerido = coalesce(nome_sugerido, v_resposta)
         where id = p_conversa;
      elsif v_passo.guarda_em = 'municipio' then
        update public.conversas
           set municipio_sugerido = coalesce(municipio_sugerido, v_resposta)
         where id = p_conversa;
      elsif v_passo.guarda_em = 'bairro' then
        update public.conversas
           set bairro_sugerido = coalesce(bairro_sugerido, v_resposta)
         where id = p_conversa;
      end if;
    end if;
  end if;

  -- ── o próximo passo ────────────────────────────────────────────────────
  select * into v_passo
    from public.fluxo_passos
   where fluxo_id = v_fluxo and ordem = v_conv.fluxo_passo + 1;

  if v_passo.id is null or coalesce(trim(v_passo.mensagem), '') = '' then
    -- Passo sem mensagem: avança sem falar. Serve para marcar etapa que a
    -- atendente cumpre na mão sem o robô interromper.
    update public.conversas
       set fluxo_passo = v_conv.fluxo_passo + 1,
           fluxo_em = now()
     where id = p_conversa and fluxo_passo = v_conv.fluxo_passo;
    return jsonb_build_object('enviar', false, 'motivo', 'passo sem mensagem');
  end if;

  -- ── trava 4: avançar é o que autoriza enviar ───────────────────────────
  --
  -- Se o `update` não acertar nenhuma linha, outra mensagem chegou primeiro e
  -- já avançou. Aí não se envia — é assim que duas mensagens simultâneas não
  -- viram duas respostas.
  update public.conversas
     set fluxo_passo   = v_conv.fluxo_passo + 1,
         fluxo_em      = now(),
         fluxo_estagio = v_passo.estagio
   where id = p_conversa
     and fluxo_passo = v_conv.fluxo_passo;

  if not found then
    return jsonb_build_object('enviar', false, 'motivo', 'outra mensagem chegou antes');
  end if;

  -- ── o texto, com os buracos preenchidos ────────────────────────────────
  v_msg := v_passo.mensagem;
  v_msg := replace(v_msg, '{{nome}}',
             coalesce(nullif(split_part(coalesce(v_conv.nome, v_conv.nome_sugerido, ''), ' ', 1), ''), 'tudo bem'));
  v_msg := replace(v_msg, '{{municipio}}',
             coalesce(v_conv.municipio, v_conv.municipio_sugerido, 'sua cidade'));

  return jsonb_build_object(
    'enviar',  true,
    'texto',   v_msg,
    'passo',   v_passo.ordem,
    'titulo',  v_passo.titulo,
    'ultimo',  v_passo.ordem >= v_total
  );
end $$;

revoke all on function public.fluxo_responder(bigint, text) from public, anon, authenticated;
grant execute on function public.fluxo_responder(bigint, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. O ROTEIRO DE BOAS-VINDAS, JÁ ESCRITO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Nasce em RASCUNHO e DESLIGADO. Ligar é gesto de quem coordena, na tela — e
-- tem de ser, porque a partir do "ligar" ele fala com eleitor de verdade.
--
-- As mensagens são curtas de propósito. Bloco de texto grande, vindo de número
-- desconhecido, é o que a pessoa lê como propaganda e denuncia. Três linhas com
-- uma pergunta no fim parecem atendimento.
insert into public.fluxos (nome, descricao, ativo, modo)
select 'Boas-vindas', 'Responde o primeiro contato e pergunta nome e cidade.', false, 'rascunho'
where not exists (select 1 from public.fluxos where nome = 'Boas-vindas');

do $$
declare v_id bigint;
begin
  select id into v_id from public.fluxos where nome = 'Boas-vindas';

  insert into public.fluxo_passos
    (fluxo_id, ordem, estagio, titulo, mensagem, espera_resposta, guarda_em, automatico)
  values
    (v_id, 1, 'novo', 'Cumprimenta e pergunta o nome',
     E'Oi! Aqui é da equipe da Talita Oliveira 💙\n\nQue bom que você chamou. Como é seu nome?',
     true, 'nome', true),

    (v_id, 2, 'qualificando', 'Pergunta a cidade',
     E'Prazer, {{nome}}! 🙏\n\nDe qual cidade você fala com a gente?',
     true, 'municipio', true),

    (v_id, 3, 'qualificando', 'Avisa que já vai ser atendido',
     E'Anotado, {{nome}}. Já já uma pessoa da equipe continua com você por aqui, tá bom?',
     false, null, true)
  on conflict (fluxo_id, ordem) do nothing;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. QUEM MEXE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só supervisão. Editar o roteiro é escrever em nome da campanha para milhares
-- de pessoas — não é tarefa de quem atende.
do $$
declare t text;
begin
  foreach t in array array['fluxos', 'fluxo_passos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s le" on public.%I', t, t);
    execute format(
      'create policy "%s le" on public.%I for select to authenticated
         using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()))', t, t);
    execute format('drop policy if exists "%s mexe" on public.%I', t, t);
    execute format(
      'create policy "%s mexe" on public.%I for all to authenticated
         using ((select public.perfil_supervisao()))
         with check ((select public.perfil_supervisao()))', t, t);
  end loop;
end $$;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- `ativo` tem de vir false e `modo` rascunho. Se vier diferente, alguém ligou
-- antes de testar.
select f.nome, f.ativo, f.modo,
       cardinality(f.telefones_teste) as telefones_de_teste,
       count(p.id)                    as passos
  from public.fluxos f
  left join public.fluxo_passos p on p.fluxo_id = f.id
 group by f.id, f.nome, f.ativo, f.modo, f.telefones_teste;
