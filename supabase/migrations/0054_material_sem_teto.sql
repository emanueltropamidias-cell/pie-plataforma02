-- ============================================================================
-- ÁUDIO E FOTO SEM TETO, EM TODOS OS NÚMEROS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- RODAR TAMBÉM NA INSTALAÇÃO DO MANASSÉS.
--
-- ── O QUE ACONTECEU ─────────────────────────────────────────────────────────
--
-- 03/10, véspera da eleição, Emanuel: "preciso que você libere todos os
-- WhatsApps, não é pra ter mais limite de envio de áudios e nem envio de
-- fotos".
--
-- Medido na hora do pedido: a Maiana estava em 200 de 200 no dia — parada — e
-- o Thiago em 190. O teto estava em 30 por hora e 200 por dia em todos os 19
-- números: a `0036_teto_de_material_sobe_com_chip_provado` (40 e 400) nunca
-- chegou a valer neste banco.
--
-- ── COMO FICA ───────────────────────────────────────────────────────────────
--
-- Teto NULO passa a significar SEM TETO, e todos os números ficam nulos.
--
-- Não foi "pôr um número enorme": 100 mil na coluna continua sendo um teto, só
-- que escondido, e alguém lendo a tabela depois não sabe se é limite ou
-- enfeite. Nulo diz o que é.
--
-- O número desconhecido (conversa sem número, id que não existe mais) também
-- fica livre. Antes ele tinha 12 e 60 escritos dentro da função, de propósito
-- — mas o pedido é sem limite, e deixar um caminho barrando seria a atendente
-- recebendo "atingiu o limite" depois de ouvir que não existe mais limite.
--
-- A CONTAGEM continua: `envios_material` segue registrando cada envio. Só a
-- trava saiu. Dá para saber depois quanto cada chip mandou.
--
-- ── O QUE ISTO NÃO MUDA ─────────────────────────────────────────────────────
--
-- A trava de primeiro contato fica: material só sai depois que a pessoa
-- escreveu. Ela não é limite de quantidade, é o que separa resposta de disparo.
--
-- O tamanho máximo do arquivo anexado também fica — esse é do WhatsApp e da
-- hospedagem, não nosso.
--
-- ── O RISCO, E COMO VOLTAR ──────────────────────────────────────────────────
--
-- O teto existia porque o WhatsApp derruba chip por RAJADA de mídia. Três
-- números já estavam caídos antes desta mudança, com o teto de pé: Talita
-- Oliveira (01/10), Deise (02/10) e Carlos Vinicius (03/10). Sem teto, o que
-- segura a rajada é só a mão de quem envia.
--
-- Para devolver o teto a todos:
--
--     update public.numeros set materiais_por_hora = 40, materiais_por_dia = 400;
--
-- Ou a um só:
--
--     update public.numeros set materiais_por_hora = 40, materiais_por_dia = 400
--      where apelido = 'Maiana';

-- ────────────────────────────────────────────────────────────────────────────
-- 1. A COLUNA ACEITA NULO, E NÚMERO NOVO NASCE SEM TETO
-- ────────────────────────────────────────────────────────────────────────────
--
-- Muda o DEFAULT junto, como na 0008: chip cadastrado amanhã entrando em 30
-- sem ninguém perceber é o defeito silencioso de sempre.
alter table public.numeros alter column materiais_por_hora drop not null;
alter table public.numeros alter column materiais_por_dia  drop not null;
alter table public.numeros alter column materiais_por_hora drop default;
alter table public.numeros alter column materiais_por_dia  drop default;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. TODOS OS NÚMEROS
-- ────────────────────────────────────────────────────────────────────────────
--
-- Todos, e não "só quem está no valor antigo": o pedido é todos.
update public.numeros
   set materiais_por_hora = null,
       materiais_por_dia  = null
 where materiais_por_hora is not null
    or materiais_por_dia  is not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 3. A FUNÇÃO: NULO É SEM TETO
-- ────────────────────────────────────────────────────────────────────────────
--
-- Saiu do banco vivo (`pg_get_functiondef`), com os dois `coalesce` e o
-- `if not found` trocados. O formato da resposta é o mesmo, porque as rotas de
-- material e de kit leem `pode`, `motivo`, `teto`, `minutos` e `restam_hora`.
--
-- `restam_hora` sem teto vai como 100000 e não como nulo: a rota do kit compara
-- com o tamanho do kit, e nulo ali viraria zero — o kit inteiro barrado por
-- "só cabem mais 0 envios".
create or replace function public.material_pode_sair(p_numero bigint)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_hora     int;
  v_dia      int;
  v_na_hora  int;
  v_no_dia   int;
  v_libera   timestamptz;
begin
  -- Nulo = sem teto. Número desconhecido não acha linha e fica nulo também.
  select materiais_por_hora, materiais_por_dia
    into v_hora, v_dia
    from public.numeros where id = p_numero;

  if v_hora is null and v_dia is null then
    return jsonb_build_object('pode', true, 'restam_hora', 100000, 'restam_dia', 100000);
  end if;

  -- `is not distinct from` e não `=`: conversa sem número cai no balde do nulo
  -- e continua sendo contada. Com `=` ela escaparia da conta em silêncio.
  select count(*) into v_na_hora
    from public.envios_material
   where numero_id is not distinct from p_numero
     and em >= now() - interval '1 hour';

  select count(*) into v_no_dia
    from public.envios_material
   where numero_id is not distinct from p_numero
     and em >= date_trunc('day', now() at time zone 'America/Bahia')
               at time zone 'America/Bahia';

  if v_hora is not null and v_na_hora >= v_hora then
    -- Quando libera: uma hora depois do envio mais antigo que ainda conta.
    select min(em) + interval '1 hour' into v_libera
      from (
        select em from public.envios_material
         where numero_id is not distinct from p_numero
           and em >= now() - interval '1 hour'
         order by em desc
         limit v_hora
      ) x;

    return jsonb_build_object(
      'pode', false,
      'motivo', 'hora',
      'teto', v_hora,
      'usados', v_na_hora,
      'minutos', greatest(1, ceil(extract(epoch from (v_libera - now())) / 60)::int)
    );
  end if;

  if v_dia is not null and v_no_dia >= v_dia then
    return jsonb_build_object(
      'pode', false,
      'motivo', 'dia',
      'teto', v_dia,
      'usados', v_no_dia
    );
  end if;

  return jsonb_build_object(
    'pode', true,
    'restam_hora', coalesce(v_hora - v_na_hora, 100000),
    'restam_dia',  coalesce(v_dia  - v_no_dia,  100000)
  );
end $function$;

comment on function public.material_pode_sair is
  'Diz se o número ainda pode mandar material (áudio, foto, kit). Teto NULO em numeros.materiais_por_hora / materiais_por_dia = sem teto; desde a 0054 todos estão nulos. A contagem em envios_material continua.';

-- ── conferência ─────────────────────────────────────────────────────────────
-- Todo número tem de responder `pode: true`, inclusive o que estava parado no
-- teto do dia, e inclusive o número que não existe (nulo).
select n.apelido,
       n.materiais_por_hora as por_hora,
       n.materiais_por_dia  as por_dia,
       (select count(*) from public.envios_material e
         where e.numero_id = n.id
           and e.em >= date_trunc('day', now() at time zone 'America/Bahia')
                       at time zone 'America/Bahia') as enviados_hoje,
       public.material_pode_sair(n.id)->>'pode' as pode
  from public.numeros n
 order by n.id;

select public.material_pode_sair(null)->>'pode' as numero_desconhecido_pode,
       (select count(*) from public.numeros
         where materiais_por_hora is not null or materiais_por_dia is not null) as numeros_ainda_com_teto;
