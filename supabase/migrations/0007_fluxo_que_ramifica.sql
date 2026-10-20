-- ============================================================================
-- O ROTEIRO PASSA A RAMIFICAR
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE MUDA ──────────────────────────────────────────────────────────────
--
-- O motor de `fluxo.sql` executa uma FILA: passo 1, passo 2, passo 3. Serve
-- para perguntar nome e cidade, que é o mesmo caminho para todo mundo.
--
-- Não serve para o que a campanha precisa agora. A 25 dias da eleição as
-- mensagens chegam declarando apoio, pedindo ajuda, atacando — e cada uma
-- dessas exige um caminho diferente. Uma fila só tem um caminho.
--
-- Isto transforma a fila em MAPA: cada passo pode ter várias saídas, e a saída
-- escolhida depende do que a pessoa escreveu. É o que ZapVoice e BotConversa
-- fazem, e é a única peça que faltava — o resto do motor já existe e já está
-- ligado na entrada.
--
-- ── O QUE NÃO MUDA, E POR QUE ISSO IMPORTA ──────────────────────────────────
--
-- As SEIS TRAVAS de `fluxo.sql` continuam inteiras, com uma trocada por
-- necessidade: a trava 3 era "o contador só anda para frente", e num mapa o
-- contador pode voltar — mapa tem ciclo, fila não tem. No lugar dela entra um
-- TETO DE EXECUÇÕES por conversa, que é um número que só cresce e que nenhum
-- desenho de mapa consegue burlar.
--
-- Trocar a trava por outra, e não removê-la, é o ponto todo: laço num robô de
-- WhatsApp não é bug de tela, é o chip da campanha caindo e a conversa virando
-- print.
--
-- ── BOTÃO NÃO ENTRA AQUI, E ISSO É DECISÃO TÉCNICA ──────────────────────────
--
-- ZapVoice e BotConversa montam o fluxo em botão clicável. Aquilo é recurso da
-- API oficial da Meta. O PIE fala com o WhatsApp pelo aparelho pareado, que foi
-- decisão de 01/09 — e ali botão não renderiza de forma confiável: chega como
-- texto solto, ou não chega.
--
-- Por isso a ramificação lê TEXTO: o número que a pessoa digitou ("1", "2") ou
-- as palavras que ela usou. Menu numerado funciona no pareado; botão não.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. NORMALIZAR TEXTO DE GENTE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Comparar o que a pessoa digitou com o que o roteiro espera só funciona se os
-- dois passarem pela mesma peneira. "Não" e "nao" e "NÃO" são a mesma resposta,
-- e quem escreve no WhatsApp usa as três.
--
-- `translate` em vez de `unaccent`: a extensão pode não estar instalada na
-- instalação do candidato novo, e isto precisa rodar do zero sem depender de
-- nada que alguém tenha de lembrar de ligar.
create or replace function public.fluxo_normaliza(p_texto text)
returns text
language sql
immutable
set search_path = pg_catalog, pg_temp
as $$
  select lower(trim(translate(
    coalesce(p_texto, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )));
$$;

comment on function public.fluxo_normaliza is
  'Minúscula, sem acento, sem espaço nas pontas. A peneira por onde passam os dois lados de toda comparação do roteiro.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O PASSO GANHA AÇÃO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Até agora o passo só sabia FALAR. Um roteiro de atendimento de verdade
-- precisa também MARCAR (etiqueta), ENCAMINHAR (departamento) e ENTREGAR o
-- link de multiplicador — senão a conversa termina bonita e não vira nada no
-- banco, que é exatamente o que acontece hoje: 794 apoiadores em sete dias, 43
-- multiplicadores, porque o link só sai se a atendente lembrar.
--
-- Um `jsonb` e não sete colunas: cada ação nova viraria coluna nova, migração
-- nova e tela nova. Assim o desenho do roteiro é dado, e ação nova é uma chave
-- a mais no objeto.
alter table public.fluxo_passos
  add column if not exists acoes jsonb not null default '{}'::jsonb;

comment on column public.fluxo_passos.acoes is
  $c$O que este passo FAZ além de falar. Chaves aceitas:
  {"etiqueta": "apoiador"}        marca a etiqueta com este nome (tags.nome)
  {"status": "apoiador"}          grava conversas.status_lead
  {"departamento": "Geral"}       manda a conversa para este departamento
  {"vira_lideranca": true}        cria a liderança e o link pessoal dela
  {"encerra": true}               o roteiro termina aqui; o robô não volta
Chave desconhecida é ignorada de propósito: roteiro com erro de digitação tem
de continuar atendendo, não parar de responder.$c$;

-- A frase de quando a resposta não bate com saída nenhuma. Nulo = usa a
-- mensagem do próprio passo de novo.
alter table public.fluxo_passos
  add column if not exists nao_entendi text;

-- Quantas vezes repetir antes de desistir e entregar para gente. Duas já é
-- muito: na terceira a pessoa acha que está falando com parede.
alter table public.fluxo_passos
  add column if not exists tentativas_max int not null default 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. AS SAÍDAS — O QUE FAZ O MAPA SER MAPA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Cada linha é uma seta saindo de um passo. `ordem` é a prioridade: a primeira
-- que casar ganha, e por isso a mais específica tem de vir antes da mais geral.
--
-- `proximo_id` nulo significa FIM DO CAMINHO: o robô se cala e a conversa fica
-- para a atendente. Fim explícito é melhor que fila que acaba, porque o desenho
-- mostra onde a máquina para de falar.
create table if not exists public.fluxo_saidas (
  id          bigserial primary key,
  passo_id    bigint not null references public.fluxo_passos(id) on delete cascade,
  ordem       int not null,
  quando      jsonb not null,
  proximo_id  bigint references public.fluxo_passos(id) on delete set null,
  rotulo      text,
  unique (passo_id, ordem)
);

comment on table public.fluxo_saidas is
  'As setas do roteiro. Uma linha por caminho possível saindo de um passo; a primeira que casar (por ordem) é a escolhida.';

comment on column public.fluxo_saidas.quando is
  $c$A condição, em jsonb. Formatos aceitos:
  {"tipo":"sempre"}                                 casa com qualquer coisa
  {"tipo":"numero","valor":"1"}                     a pessoa digitou 1
  {"tipo":"palavra","termos":["apoio","conte comigo"]}  o texto contém algum termo
  {"tipo":"senao"}                                  nenhuma das anteriores casou
Termos são comparados normalizados (sem acento, minúscula) dos dois lados.$c$;

create index if not exists fluxo_saidas_passo on public.fluxo_saidas (passo_id, ordem);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. ONDE A CONVERSA ESTÁ NO MAPA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `fluxo_passo` (o inteiro antigo) NÃO some e continua sendo a trava 1: o
-- gatilho `fluxo_cala_quando_gente_fala` escreve -1 ali quando uma atendente
-- fala, e o motor novo respeita esse -1 igual. Mexer no gatilho seria mexer na
-- trava mais importante das seis para ganhar arrumação — não vale.
alter table public.conversas
  add column if not exists fluxo_passo_id bigint references public.fluxo_passos(id) on delete set null;

comment on column public.conversas.fluxo_passo_id is
  'Em que passo do mapa esta conversa parou, esperando resposta. Nulo = ainda não entrou no roteiro, ou o roteiro terminou.';

-- ── A TRAVA 3, REFEITA ──────────────────────────────────────────────────────
--
-- Num mapa o passo pode repetir, então "o contador só anda para frente" deixa
-- de valer como garantia. Este contador conta EXECUÇÕES, não posição: cresce a
-- cada passo executado nesta conversa e nunca diminui. Nenhum desenho de mapa,
-- por mais errado que esteja, faz o robô falar mais que o teto.
alter table public.conversas
  add column if not exists fluxo_execucoes int not null default 0;

comment on column public.conversas.fluxo_execucoes is
  'Quantos passos o robô já executou nesta conversa. Só cresce. É o teto que torna laço impossível num roteiro que ramifica.';

-- Quantas vezes seguidas a pessoa respondeu algo que não casou com saída
-- nenhuma NESTE passo. Zera ao sair do passo.
alter table public.conversas
  add column if not exists fluxo_tentativas int not null default 0;

-- ── O TETO, no fluxo e não no código ────────────────────────────────────────
--
-- Fica na tabela para poder ser baixado às pressas sem publicar nada — mesma
-- razão do `ativo`. Trinta passos numa conversa já é sinal de que algo está
-- errado no desenho.
alter table public.fluxos
  add column if not exists teto_execucoes int not null default 30
    check (teto_execucoes between 1 and 200);

-- Quantas mensagens o robô pode emendar antes de parar para ouvir. Passo que
-- não espera resposta encadeia no seguinte; sem teto, um desenho errado manda
-- quinze mensagens de uma vez e o número cai na hora.
alter table public.fluxos
  add column if not exists teto_seguidas int not null default 4
    check (teto_seguidas between 1 and 10);

-- ── A JANELA DE HORÁRIO ─────────────────────────────────────────────────────
--
-- Mensagem da campanha às 3h da manhã é denúncia, e o robô não dorme. Fora da
-- janela ele fica calado; a pessoa é respondida por gente de manhã.
--
-- Nulo nos dois = sem janela, responde a qualquer hora. Fuso da Bahia, que é o
-- fuso de quem está do outro lado.
alter table public.fluxos
  add column if not exists hora_inicio int check (hora_inicio between 0 and 23);

alter table public.fluxos
  add column if not exists hora_fim int check (hora_fim between 0 and 23);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. AS AÇÕES
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Separadas do motor de propósito: o motor decide PARA ONDE ir, e isto faz o
-- que o passo mandou fazer. Duas responsabilidades, dois lugares — quando uma
-- etiqueta parar de ser aplicada, o defeito está aqui e só aqui.
--
-- Nada aqui pode derrubar a resposta. Etiqueta que não existe, departamento
-- renomeado, liderança que falhou: registra e segue. O eleitor não pode ficar
-- sem resposta porque alguém apagou uma tag na tela de configuração.
create or replace function public.fluxo_executar_acoes(
  p_conversa bigint,
  p_acoes    jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tag        bigint;
  v_dep        bigint;
  v_conv       record;
  v_lid        uuid;
  v_code       text;
  v_feitas     text[] := '{}';
begin
  if p_acoes is null or p_acoes = '{}'::jsonb then
    return jsonb_build_object('feitas', v_feitas);
  end if;

  select id, telefone, nome, nome_sugerido, municipio, municipio_sugerido,
         bairro, bairro_sugerido, lideranca_id
    into v_conv
    from public.conversas where id = p_conversa;

  -- ── etiqueta ──────────────────────────────────────────────────────────────
  --
  -- `marcada_por` nulo é a assinatura do robô, igual à mensagem: é assim que a
  -- supervisão consegue separar o que a máquina marcou do que a menina marcou.
  if p_acoes ? 'etiqueta' then
    select id into v_tag from public.tags
     where public.fluxo_normaliza(nome) = public.fluxo_normaliza(p_acoes->>'etiqueta')
       and ativa
     limit 1;
    if v_tag is not null then
      insert into public.conversa_tags (conversa_id, tag_id, marcada_por)
      values (p_conversa, v_tag, null)
      on conflict do nothing;
      v_feitas := v_feitas || ('etiqueta:' || (p_acoes->>'etiqueta'));
    else
      v_feitas := v_feitas || ('ETIQUETA NAO EXISTE:' || (p_acoes->>'etiqueta'));
    end if;
  end if;

  -- ── status do lead ────────────────────────────────────────────────────────
  if p_acoes ? 'status' then
    update public.conversas
       set status_lead = p_acoes->>'status', atualizado_em = now()
     where id = p_conversa;
    v_feitas := v_feitas || ('status:' || (p_acoes->>'status'));
  end if;

  -- ── departamento ──────────────────────────────────────────────────────────
  if p_acoes ? 'departamento' then
    select id into v_dep from public.departamentos
     where public.fluxo_normaliza(nome) = public.fluxo_normaliza(p_acoes->>'departamento')
       and ativo
     limit 1;
    if v_dep is not null then
      update public.conversas
         set departamento_id = v_dep, atualizado_em = now()
       where id = p_conversa;
      v_feitas := v_feitas || ('departamento:' || (p_acoes->>'departamento'));
    else
      v_feitas := v_feitas || ('DEPARTAMENTO NAO EXISTE:' || (p_acoes->>'departamento'));
    end if;
  end if;

  -- ── vira liderança, com link próprio ──────────────────────────────────────
  --
  -- É a ação que gera crescimento: sem ela, "declarou apoio" morre como
  -- etiqueta. Com ela, a pessoa sai da conversa com um link que credita a ela
  -- quem chegar.
  --
  -- Achada pelo TELEFONE em dígitos, e não criada sempre: quem já é liderança
  -- (as 208 de hoje, ou quem escreveu semana passada) reaproveita o código que
  -- já tem. Código novo a cada mensagem espalharia o crédito da mesma pessoa
  -- por dez links diferentes, e o placar dela nunca fecharia.
  --
  -- O CÓDIGO DO LINK NÃO É GERADO AQUI, e isso é de propósito. O gerador do
  -- PIE mora em `src/lib/link-code.ts`: alfabeto sem vogal e sem 0/1/l/o,
  -- porque o código é ditado por telefone e escrito à mão em ficha de papel.
  -- Uma segunda versão em SQL seria uma terceira cópia da mesma regra — e a
  -- que já existe no banco (`cadastrar_lead_publico`) usa 6 caracteres de md5,
  -- que colide e credita o lead à liderança errada.
  --
  -- Então: o banco cria a liderança sem código, devolve o id, e a rota gera e
  -- grava. Um gerador só, no lugar onde ele já está certo.
  if coalesce((p_acoes->>'vira_lideranca')::boolean, false) then
    if v_conv.lideranca_id is not null then
      select id, link_code into v_lid, v_code
        from public.liderancas where id = v_conv.lideranca_id;
      v_feitas := v_feitas || 'lideranca:ja tinha'::text;
    else
      -- Achada pelo TELEFONE, e não criada sempre: quem já é liderança (as 208
      -- de hoje, ou quem escreveu semana passada) reaproveita o código que já
      -- tem. Código novo a cada mensagem espalharia o crédito da mesma pessoa
      -- por dez links diferentes, e o placar dela nunca fecharia.
      select id, link_code into v_lid, v_code
        from public.liderancas
       where telefone_digitos = public.so_digitos(v_conv.telefone)
       limit 1;

      if v_lid is null then
        insert into public.liderancas
          (nome, telefone, telefone_digitos, municipio, bairro, tipo, created_via)
        values (
          coalesce(nullif(trim(coalesce(v_conv.nome, v_conv.nome_sugerido, '')), ''), 'Sem nome'),
          v_conv.telefone,
          public.so_digitos(v_conv.telefone),
          coalesce(v_conv.municipio, v_conv.municipio_sugerido),
          coalesce(v_conv.bairro, v_conv.bairro_sugerido),
          'apoiador',
          'fluxo'
        )
        returning id, link_code into v_lid, v_code;
        v_feitas := v_feitas || 'lideranca:criada'::text;
      else
        v_feitas := v_feitas || 'lideranca:achada pelo telefone'::text;
      end if;

      update public.conversas set lideranca_id = v_lid, atualizado_em = now()
       where id = p_conversa;
    end if;

    return jsonb_build_object(
      'feitas',       v_feitas,
      'lideranca_id', v_lid,
      'link_code',    v_code   -- nulo quando acabou de ser criada; a rota preenche
    );
  end if;

  return jsonb_build_object('feitas', v_feitas);
end $$;

revoke all on function public.fluxo_executar_acoes(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.fluxo_executar_acoes(bigint, jsonb) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. ESCOLHER A SAÍDA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Percorre as saídas do passo em ordem e devolve a primeira que casar. `senao`
-- fica de fora da primeira passada de propósito: ela é a rede, e rede que
-- compete com as regras pega gente que uma regra pegaria.
create or replace function public.fluxo_escolher_saida(
  p_passo bigint,
  p_texto text
) returns bigint
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_norm text := public.fluxo_normaliza(p_texto);
  -- Só os dígitos, para o menu numerado. Muita gente responde "1" e muita
  -- gente responde "opção 1" ou "1️⃣" — o que sobra dos dois é o mesmo dígito.
  v_num  text := regexp_replace(coalesce(p_texto, ''), '[^0-9]', '', 'g');
  v_s    record;
  v_termo text;
begin
  for v_s in
    select * from public.fluxo_saidas
     where passo_id = p_passo and quando->>'tipo' <> 'senao'
     order by ordem
  loop
    if v_s.quando->>'tipo' = 'sempre' then
      return v_s.id;

    elsif v_s.quando->>'tipo' = 'numero' then
      -- Casa com o dígito sozinho ou com o dígito no começo ("1 - quero
      -- apoiar" colado da mensagem anterior conta como 1).
      if v_num = (v_s.quando->>'valor') or left(v_num, 1) = (v_s.quando->>'valor') then
        return v_s.id;
      end if;

    elsif v_s.quando->>'tipo' = 'palavra' then
      for v_termo in select jsonb_array_elements_text(v_s.quando->'termos') loop
        if v_norm like '%' || public.fluxo_normaliza(v_termo) || '%' then
          return v_s.id;
        end if;
      end loop;
    end if;
  end loop;

  -- Nada casou: a rede, se existir.
  select id into v_s from public.fluxo_saidas
   where passo_id = p_passo and quando->>'tipo' = 'senao'
   order by ordem limit 1;

  return v_s.id;
end $$;

revoke all on function public.fluxo_escolher_saida(bigint, text) from public, anon, authenticated;
grant execute on function public.fluxo_escolher_saida(bigint, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. O MOTOR
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Mesmo nome e mesma assinatura da versão anterior — a rota já chama assim, e
-- trocar o nome deixaria as duas versões vivas ao mesmo tempo, que é como uma
-- correção volta sozinha.
--
-- O QUE MUDA NO RETORNO: antes devolvia UM texto. Agora devolve uma LISTA, em
-- ordem, porque passo que não espera resposta encadeia no seguinte — é assim
-- que se manda "obrigado!" e o link logo abaixo, como gente faz, em vez de uma
-- frase por mensagem recebida.
create or replace function public.fluxo_responder(
  p_conversa bigint,
  p_texto    text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_f          record;
  v_conv       record;
  v_passo      record;
  v_saida      bigint;
  v_proximo    bigint;
  v_msgs       jsonb := '[]'::jsonb;
  v_msg        text;
  v_link_code  text;
  v_lideranca  uuid;
  v_acao       jsonb;
  v_feitas     text[] := '{}';
  v_seguidas   int := 0;
  v_hora       int;
  v_encerrou   boolean := false;
begin
  -- ── trava 6: parar tudo ────────────────────────────────────────────────
  select id, modo, telefones_teste, teto_execucoes, teto_seguidas,
         hora_inicio, hora_fim
    into v_f
    from public.fluxos where ativo limit 1;

  if v_f.id is null then
    return jsonb_build_object('enviar', false, 'motivo', 'sem fluxo ativo');
  end if;

  -- ── a janela de horário ────────────────────────────────────────────────
  if v_f.hora_inicio is not null and v_f.hora_fim is not null then
    v_hora := extract(hour from (now() at time zone 'America/Bahia'))::int;
    if v_hora < v_f.hora_inicio or v_hora >= v_f.hora_fim then
      return jsonb_build_object('enviar', false, 'motivo',
        format('fora da janela (%s-%sh, agora %sh)', v_f.hora_inicio, v_f.hora_fim, v_hora));
    end if;
  end if;

  -- `for update` segura a linha: é o que faz duas mensagens da mesma pessoa no
  -- mesmo instante virarem uma resposta só, e não duas.
  select c.id, c.telefone, c.fluxo_passo, c.fluxo_passo_id, c.fluxo_execucoes,
         c.fluxo_tentativas, c.nome, c.nome_sugerido, c.municipio,
         c.municipio_sugerido, c.cadastrado_em, c.lideranca_id
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
  if v_f.modo = 'rascunho'
     and not (right(public.so_digitos(v_conv.telefone), 11) = any (
       select right(public.so_digitos(t), 11) from unnest(v_f.telefones_teste) as t
     )) then
    return jsonb_build_object('enviar', false, 'motivo', 'rascunho: fora da lista de teste');
  end if;

  -- ── trava 3, refeita: teto de execuções ────────────────────────────────
  if v_conv.fluxo_execucoes >= v_f.teto_execucoes then
    return jsonb_build_object('enviar', false, 'motivo', 'teto de execucoes atingido');
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- ONDE ESTAMOS: começo do mapa, ou saída do passo em que paramos
  -- ─────────────────────────────────────────────────────────────────────────
  if v_conv.fluxo_passo_id is null then
    -- ── NULO É DOIS ESTADOS DIFERENTES ──────────────────────────────────
    --
    -- "ainda não entrou no roteiro" e "o roteiro já acabou" são os dois nulo
    -- aqui. Sem separar os dois, a pessoa que terminou o roteiro e escreve de
    -- novo amanhã é CUMPRIMENTADA DE NOVO — e de novo, e de novo, cada vez que
    -- falar com a campanha.
    --
    -- O contador de execuções separa: zero é quem nunca foi atendido pelo robô.
    if v_conv.fluxo_execucoes > 0 then
      return jsonb_build_object('enviar', false, 'motivo', 'roteiro ja terminou nesta conversa');
    end if;

    -- Primeira mensagem desta pessoa: entra pelo passo de menor ordem.
    select * into v_passo from public.fluxo_passos
     where fluxo_id = v_f.id order by ordem limit 1;

    if v_passo.id is null then
      return jsonb_build_object('enviar', false, 'motivo', 'roteiro sem passos');
    end if;
    v_proximo := v_passo.id;
  else
    -- Já estávamos esperando resposta. Guardar o que ela disse, e ver por onde
    -- essa resposta sai.
    select * into v_passo from public.fluxo_passos where id = v_conv.fluxo_passo_id;

    -- ── guardar o que a pessoa respondeu ──────────────────────────────────
    --
    -- Vai para os campos _sugerido, nunca para os definitivos: quem confirma é
    -- a atendente, com o clique que já existe na ficha. Robô escrevendo direto
    -- no cadastro enche a base de "oi" no lugar do nome.
    if v_passo.guarda_em is not null
       and v_conv.cadastrado_em is null
       and length(trim(coalesce(p_texto, ''))) between 2 and 120 then
      if v_passo.guarda_em = 'nome' then
        update public.conversas set nome_sugerido = coalesce(nome_sugerido, trim(p_texto))
         where id = p_conversa;
      elsif v_passo.guarda_em = 'municipio' then
        update public.conversas set municipio_sugerido = coalesce(municipio_sugerido, trim(p_texto))
         where id = p_conversa;
      elsif v_passo.guarda_em = 'bairro' then
        update public.conversas set bairro_sugerido = coalesce(bairro_sugerido, trim(p_texto))
         where id = p_conversa;
      end if;
    end if;

    v_saida := public.fluxo_escolher_saida(v_passo.id, p_texto);

    if v_saida is null then
      -- ── NÃO ENTENDI ────────────────────────────────────────────────────
      --
      -- Repete uma vez e desiste. Na terceira a pessoa acha que está falando
      -- com parede, e parede não ganha voto.
      if v_conv.fluxo_tentativas < v_passo.tentativas_max then
        update public.conversas
           set fluxo_tentativas = fluxo_tentativas + 1,
               fluxo_execucoes  = fluxo_execucoes + 1,
               fluxo_em = now()
         where id = p_conversa and fluxo_tentativas = v_conv.fluxo_tentativas;

        if not found then
          return jsonb_build_object('enviar', false, 'motivo', 'outra mensagem chegou antes');
        end if;

        v_msg := coalesce(v_passo.nao_entendi, v_passo.mensagem);
        return jsonb_build_object(
          'enviar', true,
          'mensagens', jsonb_build_array(v_msg),
          'motivo', 'nao entendi: repetindo',
          'passo', v_passo.id
        );
      end if;

      -- Acabaram as tentativas: cala e deixa para gente.
      update public.conversas
         set fluxo_passo_id = null, fluxo_tentativas = 0, fluxo_em = now()
       where id = p_conversa;
      return jsonb_build_object('enviar', false, 'motivo', 'nao entendi: entregue para gente');
    end if;

    select proximo_id into v_proximo from public.fluxo_saidas where id = v_saida;

    if v_proximo is null then
      -- Saída de fim explícito: o caminho acabou aqui.
      update public.conversas
         set fluxo_passo_id = null, fluxo_tentativas = 0, fluxo_em = now()
       where id = p_conversa;
      return jsonb_build_object('enviar', false, 'motivo', 'fim do caminho');
    end if;
  end if;

  -- ─────────────────────────────────────────────────────────────────────────
  -- EXECUTAR, EMENDANDO ATÉ ALGUÉM PEDIR PARA OUVIR
  -- ─────────────────────────────────────────────────────────────────────────
  --
  -- trava 4: o `update` condicional embaixo é o que autoriza falar. Se ele não
  -- acertar linha nenhuma, outra mensagem chegou primeiro e já avançou — e aí
  -- esta desiste calada.
  update public.conversas
     set fluxo_passo_id   = v_proximo,
         fluxo_tentativas = 0,
         fluxo_execucoes  = fluxo_execucoes + 1,
         fluxo_em         = now()
   where id = p_conversa
     and coalesce(fluxo_passo_id, -1) = coalesce(v_conv.fluxo_passo_id, -1)
     and fluxo_execucoes = v_conv.fluxo_execucoes;

  if not found then
    return jsonb_build_object('enviar', false, 'motivo', 'outra mensagem chegou antes');
  end if;

  loop
    select * into v_passo from public.fluxo_passos where id = v_proximo;
    exit when v_passo.id is null;

    -- ── o que este passo FAZ ────────────────────────────────────────────
    if v_passo.acoes is not null and v_passo.acoes <> '{}'::jsonb then
      v_acao := public.fluxo_executar_acoes(p_conversa, v_passo.acoes);
      v_feitas := v_feitas || coalesce(
        array(select jsonb_array_elements_text(v_acao->'feitas')), '{}'::text[]);
      if v_acao ? 'link_code' then
        v_link_code := v_acao->>'link_code';
      end if;
      if v_acao ? 'lideranca_id' then
        v_lideranca := (v_acao->>'lideranca_id')::uuid;
      end if;
      if coalesce((v_passo.acoes->>'encerra')::boolean, false) then
        v_encerrou := true;
      end if;
    end if;

    -- ── o que este passo FALA ───────────────────────────────────────────
    if coalesce(trim(v_passo.mensagem), '') <> '' then
      -- Relê a conversa: a ação de guardar nome pode ter acabado de mudar o
      -- que o {{nome}} deve mostrar.
      select nome, nome_sugerido, municipio, municipio_sugerido
        into v_conv.nome, v_conv.nome_sugerido, v_conv.municipio, v_conv.municipio_sugerido
        from public.conversas where id = p_conversa;

      v_msg := v_passo.mensagem;
      v_msg := replace(v_msg, '{{nome}}',
        coalesce(nullif(split_part(coalesce(v_conv.nome, v_conv.nome_sugerido, ''), ' ', 1), ''), 'tudo bem'));
      v_msg := replace(v_msg, '{{municipio}}',
        coalesce(v_conv.municipio, v_conv.municipio_sugerido, 'sua cidade'));
      -- {{link}} NÃO é resolvido aqui. Fica no texto do jeito que está, e quem
      -- troca é a rota — que sabe o domínio (`candidato.ts`, o que muda de uma
      -- instalação para outra) e sabe gerar o código quando a liderança acabou
      -- de nascer. Banco que soubesse o domínio mandaria o eleitor do Manassés
      -- para o site da Talita, e isso não falharia em teste nenhum.

      v_msgs := v_msgs || to_jsonb(v_msg);
      v_seguidas := v_seguidas + 1;
    end if;

    update public.conversas
       set fluxo_estagio = v_passo.estagio, atualizado_em = now()
     where id = p_conversa;

    -- ── parar de emendar ────────────────────────────────────────────────
    exit when v_passo.espera_resposta;      -- é pergunta: cala e espera
    exit when v_encerrou;                   -- o passo mandou encerrar
    exit when v_seguidas >= v_f.teto_seguidas;

    -- Passo que não espera resposta segue pela saída 'sempre'. Sem ela, o
    -- caminho acabou.
    select proximo_id into v_proximo
      from public.fluxo_saidas
     where passo_id = v_passo.id and quando->>'tipo' = 'sempre'
     order by ordem limit 1;

    exit when v_proximo is null;

    update public.conversas
       set fluxo_passo_id  = v_proximo,
           fluxo_execucoes = fluxo_execucoes + 1
     where id = p_conversa;

    -- Teto de execuções conferido a cada volta, e não só na entrada: é aqui
    -- que um mapa com ciclo tentaria rodar sozinho.
    select fluxo_execucoes into v_conv.fluxo_execucoes
      from public.conversas where id = p_conversa;
    exit when v_conv.fluxo_execucoes >= v_f.teto_execucoes;
  end loop;

  -- Encerrou ou parou num passo que não espera: o robô não volta a falar
  -- sozinho nesta conversa.
  if v_encerrou or not coalesce(v_passo.espera_resposta, false) then
    update public.conversas set fluxo_passo_id = null where id = p_conversa;
  end if;

  if jsonb_array_length(v_msgs) = 0 then
    return jsonb_build_object('enviar', false, 'motivo', 'passos sem mensagem',
                              'acoes', to_jsonb(v_feitas));
  end if;

  return jsonb_build_object(
    'enviar',       true,
    'mensagens',    v_msgs,
    'link_code',    v_link_code,
    'lideranca_id', v_lideranca,
    'acoes',        to_jsonb(v_feitas),
    'passo',        v_passo.id,
    'titulo',       v_passo.titulo
  );
end $$;

revoke all on function public.fluxo_responder(bigint, text) from public, anon, authenticated;
grant execute on function public.fluxo_responder(bigint, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. QUEM MEXE NAS SAÍDAS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Mesma regra dos passos: editar o mapa é escrever em nome da campanha para
-- milhares de pessoas. Atendimento lê, supervisão mexe.
alter table public.fluxo_saidas enable row level security;

drop policy if exists "fluxo_saidas le" on public.fluxo_saidas;
create policy "fluxo_saidas le" on public.fluxo_saidas for select to authenticated
  using ((select public.perfil_atendimento()) or (select public.perfil_supervisao()));

drop policy if exists "fluxo_saidas mexe" on public.fluxo_saidas;
create policy "fluxo_saidas mexe" on public.fluxo_saidas for all to authenticated
  using ((select public.perfil_supervisao()))
  with check ((select public.perfil_supervisao()));

grant select on public.fluxo_saidas to authenticated;
grant all on public.fluxo_saidas to service_role;
grant usage, select on sequence public.fluxo_saidas_id_seq to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. O ROTEIRO QUE JÁ EXISTIA CONTINUA FUNCIONANDO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Boas-vindas" tem 3 passos e ZERO saídas — porque saída não existia quando
-- ele foi escrito. No motor novo, passo sem saída é caminho que termina: ele
-- perguntaria o nome e nunca chegaria à cidade.
--
-- Migração que muda a máquina não pode mudar o comportamento do que já estava
-- desenhado. Então todo passo que não tem saída ganha uma seta 'sempre' para o
-- passo seguinte, que é exatamente o que a fila fazia — e o último não ganha
-- nada, porque a fila também acabava ali.
--
-- Roda uma vez. Passo que já tem saída não é tocado, então rodar de novo não
-- desfaz mapa nenhum que alguém tenha desenhado depois.
insert into public.fluxo_saidas (passo_id, ordem, quando, proximo_id, rotulo)
select p.id, 1, '{"tipo":"sempre"}'::jsonb, prox.id, 'segue'
  from public.fluxo_passos p
  join lateral (
    select p2.id from public.fluxo_passos p2
     where p2.fluxo_id = p.fluxo_id and p2.ordem > p.ordem
     order by p2.ordem limit 1
  ) prox on true
 where not exists (select 1 from public.fluxo_saidas s where s.passo_id = p.id)
on conflict (passo_id, ordem) do nothing;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- `ativo` tem de continuar false e `modo` rascunho. Se vier diferente, alguém
-- ligou antes de testar. E `saidas` tem de ser `passos - 1` por fluxo: uma seta
-- entre cada par, e o último sem seta.
select f.nome, f.ativo, f.modo, f.teto_execucoes, f.teto_seguidas,
       f.hora_inicio, f.hora_fim,
       count(distinct p.id) as passos,
       count(distinct s.id) as saidas
  from public.fluxos f
  left join public.fluxo_passos p on p.fluxo_id = f.id
  left join public.fluxo_saidas s on s.passo_id = p.id
 group by f.id, f.nome, f.ativo, f.modo, f.teto_execucoes, f.teto_seguidas,
          f.hora_inicio, f.hora_fim;
