-- ============================================================================
-- A QUEDA DO NÚMERO PRECISA GRITAR
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE CUSTOU NÃO TER ISTO ───────────────────────────────────────────────
--
-- A sessão da Maiana caiu às 15h. Ninguém soube até o dia seguinte. Nesse
-- intervalo ela atendeu 420 pessoas pelo aparelho, e o PIE não viu nenhuma:
-- 371 leads pagos entraram sem telefone, o SLA contou todo mundo como
-- abandonado, e a campanha mediu menos do que fez.
--
-- O aviso já chegava. A Evolution manda `CONNECTION_UPDATE` a cada mudança, e
-- a instância já estava assinada nesse evento desde o começo — o webhook é que
-- recebia e jogava fora.
--
-- ── POR QUE ISTO IMPORTA MAIS AGORA ─────────────────────────────────────────
--
-- São sete números novos entrando. Chip recente que começa a receber volume é
-- exatamente o perfil que o WhatsApp derruba primeiro, e vão ser sete sessões
-- para cair em vez de uma.
--
-- A diferença entre uma queda de 5 minutos e uma de 7 horas não é a queda: é
-- quanto tempo leva para alguém saber.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O ESTADO DE CADA NÚMERO, GUARDADO
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.numeros
  add column if not exists conexao     text        not null default 'desconhecido',
  add column if not exists conexao_em  timestamptz,
  -- QUANDO CAIU, e não só que caiu. É o que responde "desde quando estamos
  -- cegos neste número" — a pergunta que ninguém pôde fazer ontem.
  add column if not exists caiu_em     timestamptz;

comment on column public.numeros.conexao is
  'open | connecting | close | desconhecido. Vem do CONNECTION_UPDATE da Evolution.';
comment on column public.numeros.caiu_em is
  'Quando saiu de "open". Zera ao voltar. Mede há quanto tempo o número está cego.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. REGISTRAR A MUDANÇA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Chamada pelo webhook. Cria o número se ele ainda não existir, pela mesma
-- razão de `receber_mensagem`: um número que avisa que caiu antes de alguém
-- cadastrar é informação, e recusar seria perdê-la.
--
-- `caiu_em` só é escrito na TRANSIÇÃO. A Evolution repete `close` várias vezes
-- durante a tentativa de reconexão; reescrever a cada repetição faria a queda
-- parecer sempre recente, e a faixa na tela diria "caiu agora" durante horas.
create or replace function public.marcar_conexao(
  p_instancia text,
  p_estado    text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_antes text;
  v_novo  text := lower(coalesce(nullif(trim(p_estado), ''), 'desconhecido'));
  v_id    bigint;
begin
  if coalesce(p_instancia, '') = '' then
    return jsonb_build_object('ok', false, 'motivo', 'sem instancia');
  end if;

  select id, conexao into v_id, v_antes
    from public.numeros where instancia = p_instancia;

  if v_id is null then
    insert into public.numeros (apelido, instancia, ordem, conexao, conexao_em)
    values (p_instancia, p_instancia, 500, v_novo, now())
    on conflict (instancia) do nothing;
    select id, conexao into v_id, v_antes
      from public.numeros where instancia = p_instancia;
  end if;

  update public.numeros set
    conexao    = v_novo,
    conexao_em = now(),
    caiu_em    = case
                   when v_novo = 'open' then null
                   -- só na transição: 'close' repetido não reinicia o relógio
                   when coalesce(v_antes, '') = 'open' or caiu_em is null then now()
                   else caiu_em
                 end
  where id = v_id;

  return jsonb_build_object('ok', true, 'de', v_antes, 'para', v_novo,
                            'mudou', coalesce(v_antes, '') is distinct from v_novo);
end $$;

revoke all on function public.marcar_conexao(text, text)
  from public, anon, authenticated;
grant execute on function public.marcar_conexao(text, text) to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. CONFERÊNCIA
-- ─────────────────────────────────────────────────────────────────────────────
select apelido, instancia, conexao,
       case when caiu_em is null then '—'
            else to_char(now() - caiu_em, 'HH24:MI') end as cego_ha
  from public.numeros
 where ativo
 order by ordem;
