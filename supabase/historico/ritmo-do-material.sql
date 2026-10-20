-- ============================================================================
-- O RITMO DO MATERIAL — TETO POR NÚMERO, POR HORA E POR DIA
-- ============================================================================
--
-- Rode DEPOIS de kits.sql. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- O que faz o WhatsApp matar um número não é a rajada dentro de UMA conversa.
-- É o agregado: quantas pessoas DIFERENTES o número tocou numa janela, com o
-- mesmo conteúdo, e quantas delas bloquearam ou denunciaram.
--
-- O kit "Talita e Neto" é o mesmo arquivo, com o mesmo hash, saindo para
-- centenas de conversas. Isso É a assinatura de disparo — e não tem nada a ver
-- com quem clicou no botão.
--
-- Até aqui não havia teto NENHUM: nem por número, nem por hora, nem por
-- atendente. A rota mandava quantas vezes clicassem.
--
-- ── POR QUE O TETO É POR NÚMERO, E NÃO POR ATENDENTE ────────────────────────
--
-- Quem apanha do WhatsApp é o CHIP, não a menina. Duas atendentes no mesmo
-- número somam no mesmo balde; a mesma menina em dois números não soma. O
-- limite tem de ficar onde mora a punição.
--
-- ── POR QUE OS NÚMEROS FICAM NO BANCO ───────────────────────────────────────
--
-- Porque quem tem de mexer neles é a coordenação, no meio da operação, sem
-- esperar deploy. Se o teto travar a fila às 15h de um dia cheio, a saída não
-- pode ser "chama o programador".
--
-- ── OS PADRÕES SÃO DE DIA 1, E DE PROPÓSITO ─────────────────────────────────
--
-- 12 por hora e 60 por dia. É pouco, e tem de ser: chip recém-pareado, sem
-- histórico, mandando mídia política para desconhecido é o perfil que o
-- WhatsApp derruba mais rápido. Número quente aguenta muito mais — mas quem
-- decide que já esquentou é a coordenação, olhando, e não este arquivo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. CADA NÚMERO TEM O SEU TETO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Por número e não global: os sete não estão no mesmo estágio. O que está no ar
-- há semanas aguenta o que o pareado ontem não aguenta.
alter table public.numeros
  add column if not exists materiais_por_hora int not null default 12;

alter table public.numeros
  add column if not exists materiais_por_dia int not null default 60;

comment on column public.numeros.materiais_por_hora is
  'Teto de envios de material (kit ou áudio da biblioteca) por hora NESTE número. Suba devagar: chip novo cai rápido.';
comment on column public.numeros.materiais_por_dia is
  'Teto por dia, no fuso da Bahia. Vale junto com o de hora — o que estourar primeiro trava.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O LIVRO-CAIXA DOS ENVIOS
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Contar por `mensagens` não serve: lá está toda conversa normal, e travar a
-- menina de RESPONDER é o oposto do que se quer. O que precisa de teto é o
-- material pronto — o que sai igual para todo mundo.
--
-- `kits.vezes` também não serve: é um contador global, sem número e sem hora.
create table if not exists public.envios_material (
  id          bigserial primary key,

  -- De qual chip saiu. É a chave do teto, e é por isso que ela vem primeiro.
  numero_id   bigint references public.numeros(id)   on delete set null,

  conversa_id bigint references public.conversas(id) on delete set null,

  -- Um ou outro: veio de kit, ou é material solto da biblioteca.
  kit_id      bigint references public.kits(id)      on delete set null,
  material_id bigint references public.materiais(id) on delete set null,

  -- Quem clicou. Não entra na conta do teto, mas é o que responde "quem mandou
  -- isso?" quando alguém pergunta — e alguém pergunta.
  atendente_id uuid  references public.profiles(id)  on delete set null,

  em          timestamptz not null default now()
);

-- O índice que sustenta a pergunta do teto: "deste número, na última hora".
-- Sem ele a consulta varre a tabela inteira a cada clique, e ela cresce todo dia.
create index if not exists envios_material_numero_em
  on public.envios_material (numero_id, em desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. A PERGUNTA: PODE SAIR?
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Devolve a resposta INTEIRA, e não um booleano: a menina precisa saber quanto
-- falta para liberar, senão o botão travado vira "o PIE quebrou". Botão que não
-- explica é chamado de suporte no meio do plantão.
create or replace function public.material_pode_sair(p_numero bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hora     int;
  v_dia      int;
  v_na_hora  int;
  v_no_dia   int;
  v_libera   timestamptz;
begin
  -- Número desconhecido não tem teto próprio; usa o padrão da tabela em vez de
  -- virar buraco por onde tudo passa.
  select coalesce(materiais_por_hora, 12), coalesce(materiais_por_dia, 60)
    into v_hora, v_dia
    from public.numeros where id = p_numero;

  if not found then
    v_hora := 12;
    v_dia  := 60;
  end if;

  -- `is not distinct from` e não `=`: conversa sem número cai no balde do nulo
  -- e continua tendo teto. Com `=` ela escaparia da conta em silêncio.
  select count(*) into v_na_hora
    from public.envios_material
   where numero_id is not distinct from p_numero
     and em >= now() - interval '1 hour';

  select count(*) into v_no_dia
    from public.envios_material
   where numero_id is not distinct from p_numero
     and em >= date_trunc('day', now() at time zone 'America/Bahia')
               at time zone 'America/Bahia';

  if v_na_hora >= v_hora then
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

  if v_no_dia >= v_dia then
    return jsonb_build_object(
      'pode', false,
      'motivo', 'dia',
      'teto', v_dia,
      'usados', v_no_dia
    );
  end if;

  return jsonb_build_object(
    'pode', true,
    'restam_hora', v_hora - v_na_hora,
    'restam_dia',  v_dia  - v_no_dia
  );
end $$;

revoke all on function public.material_pode_sair(bigint) from public, anon;
grant execute on function public.material_pode_sair(bigint) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. O REGISTRO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Uma linha por MATERIAL que saiu, não por kit: um kit de quatro peças pesa
-- quatro no chip, porque são quatro mensagens. Contar kit como um faria o teto
-- mentir por um fator de quatro.
create or replace function public.material_saiu(
  p_numero    bigint,
  p_conversa  bigint,
  p_kit       bigint,
  p_material  bigint,
  p_atendente uuid
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.envios_material
    (numero_id, conversa_id, kit_id, material_id, atendente_id)
  values (p_numero, p_conversa, p_kit, p_material, p_atendente);
end $$;

revoke all on function public.material_saiu(bigint, bigint, bigint, bigint, uuid)
  from public, anon;
grant execute on function public.material_saiu(bigint, bigint, bigint, bigint, uuid)
  to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. QUEM LÊ O LIVRO-CAIXA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A atendente não precisa ver; ela vê o aviso do botão. Supervisão vê tudo,
-- porque é quem decide subir ou baixar o teto.
alter table public.envios_material enable row level security;

drop policy if exists "envios le" on public.envios_material;
create policy "envios le" on public.envios_material
  for select to authenticated
  using ((select public.perfil_supervisao()));

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- O teto de cada número, e quanto já saiu hoje.
select n.apelido,
       n.instancia,
       n.materiais_por_hora,
       n.materiais_por_dia,
       count(e.id) filter (
         where e.em >= date_trunc('day', now() at time zone 'America/Bahia')
                       at time zone 'America/Bahia'
       ) as saiu_hoje
  from public.numeros n
  left join public.envios_material e on e.numero_id = n.id
 where n.ativo
 group by n.id, n.apelido, n.instancia, n.materiais_por_hora, n.materiais_por_dia
 order by n.ordem;

-- ── PARA MUDAR O TETO (coordenação, sem deploy) ─────────────────────────────
--
--   update public.numeros
--      set materiais_por_hora = 25, materiais_por_dia = 150
--    where instancia = 'talita';
--
-- Suba DEVAGAR, e um degrau por dia. O sinal de que foi rápido demais é o 401 —
-- e quando ele chega, já é tarde para aquele chip.

-- ── ATENÇÃO: OS ~400 CADASTROS MANUAIS NÃO RECEBEM KIT ──────────────────────
--
-- A rota passou a exigir `conversas.ultima_entrada_at` — ou seja, a pessoa
-- precisa ter ESCRITO para o chip pelo menos uma vez.
--
-- `cadastrar_manual` NÃO preenche essa coluna, e está certo em não preencher:
-- a pessoa foi atendida por telefone e nunca escreveu no WhatsApp. Então as
-- ~400 cadastradas na mão vão bater na trava.
--
-- ISSO É PROTEÇÃO, E NÃO DEFEITO. Mandar mídia política para 400 números que
-- nunca abriram conversa com o chip é primeiro contato não solicitado, em
-- volume, com arquivo de hash idêntico. É o retrato exato do que derruba
-- número — e num chip recém-pareado derruba em horas.
--
-- O CAMINHO CERTO é converter em contato solicitado: na ligação, a atendente
-- pede "me manda um oi no WhatsApp que eu te envio o material da Talita".
-- A pessoa escreve, `ultima_entrada_at` é carimbado pelo gatilho, e o kit
-- libera sozinho. Mais lento, e é o único jeito que não queima o chip. Também
-- é o que a lei eleitoral pede.
--
-- Se a coordenação decidir assumir o risco assim mesmo, a trava é de rota, não
-- de banco — e derrubá-la exige mudar o código, de propósito: não quis deixar
-- um `update` de uma linha capaz de expor os sete números de uma vez.
