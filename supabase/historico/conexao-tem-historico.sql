-- ============================================================================
-- O NÚMERO QUE VAI E VOLTA DEIXA RASTRO
-- ============================================================================
--
-- Rode DEPOIS de `conexao-vigiada.sql`. Pode rodar de novo sem medo.
--
-- ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
--
-- `numeros.conexao` guarda o estado de AGORA, e `marcar_conexao` sobrescreve.
-- Então quando o Emanuel diz "o número da Boneca estava indo e voltando", não
-- há como conferir: a coluna mostra onde ele parou, nunca o caminho.
--
-- E é o caminho que diz o que está acontecendo. Cair uma vez e ficar caído é
-- chip removido — resolve lendo o QR. Cair e voltar seis vezes por hora é
-- outra doença, e o QR não resolve nada.
--
-- Enquanto isso não existir, toda queda vira relato de memória, e o defeito
-- que só aparece em rajada é justamente o que ninguém consegue provar.

create table if not exists public.conexao_eventos (
  id        bigserial primary key,
  numero_id bigint references public.numeros(id) on delete cascade,

  -- Repetida de propósito: a instância pode ser apagada e recriada, e o
  -- histórico do que aconteceu com aquele nome não pode sumir junto.
  instancia text not null,

  de   text,
  para text not null,
  em   timestamptz not null default now()
);

-- A pergunta é sempre "o que aconteceu com ESTE número, do mais novo para o
-- mais velho". Sem o índice, é varredura na tabela inteira toda vez.
create index if not exists conexao_eventos_por_instancia
  on public.conexao_eventos (instancia, em desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- POR QUE caiu, e não só QUE caiu
-- ─────────────────────────────────────────────────────────────────────────────
--
-- "Caiu" tem causas com respostas OPOSTAS, e a tela dava o mesmo aviso para
-- todas:
--
--   conflict  alguém abriu o WhatsApp Web ou tirou o PIE de "Aparelhos
--             conectados". Ler o QR resolve — e cai de novo amanhã se ninguém
--             avisar a equipe.
--
--   401       o WhatsApp cortou o número. Ler o QR NÃO resolve, e insistir
--             piora. Foi o que aconteceu em 26/08 às 15h01.
--
-- Sem a causa escrita, a coordenação lê QR em número banido e não avisa a
-- equipe no número que caiu por conflito. As duas respostas erradas, pelo
-- mesmo aviso.
alter table public.numeros
  add column if not exists motivo_queda text;

comment on column public.numeros.motivo_queda is
  'Frase pronta com a causa da última queda e o que fazer. Vem do disconnectionObject da Evolution.';

alter table public.conexao_eventos enable row level security;

drop policy if exists "eventos de conexao, quem supervisiona le" on public.conexao_eventos;
create policy "eventos de conexao, quem supervisiona le" on public.conexao_eventos
  for select to authenticated
  using ((select public.perfil_supervisao()));

-- ─────────────────────────────────────────────────────────────────────────────
-- `marcar_conexao` passa a registrar a MUDANÇA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Só a mudança. A varredura roda a cada carregamento de tela; gravar todas as
-- respostas encheria a tabela com milhares de linhas dizendo 'open' → 'open',
-- e a rajada de quedas se perderia no meio delas.
-- A assinatura ganha um terceiro parâmetro. Com `default null`, quem já chama
-- com dois continua funcionando — mas o Postgres não troca a aridade num
-- `create or replace`, por isso a versão antiga sai primeiro.
drop function if exists public.marcar_conexao(text, text);

create or replace function public.marcar_conexao(
  p_instancia text,
  p_estado    text,
  p_motivo    text default null
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
    -- Some quando volta: motivo velho pendurado em número de pé é pior que
    -- motivo nenhum — manda consertar o que já está funcionando.
    motivo_queda = case when v_novo = 'open' then null
                        else coalesce(p_motivo, motivo_queda) end,
    caiu_em    = case
                   when v_novo = 'open' then null
                   -- só na transição: 'close' repetido não reinicia o relógio
                   when coalesce(v_antes, '') = 'open' or caiu_em is null then now()
                   else caiu_em
                 end
  where id = v_id;

  if coalesce(v_antes, '') is distinct from v_novo then
    insert into public.conexao_eventos (numero_id, instancia, de, para)
    values (v_id, p_instancia, v_antes, v_novo);
  end if;

  return jsonb_build_object('ok', true, 'de', v_antes, 'para', v_novo,
                            'mudou', coalesce(v_antes, '') is distinct from v_novo);
end $$;

revoke all on function public.marcar_conexao(text, text, text)
  from public, anon, authenticated;
grant execute on function public.marcar_conexao(text, text, text) to service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Daqui a algumas horas esta consulta responde "quem está indo e voltando":
-- muitas trocas no mesmo dia é rajada, uma troca só é queda limpa.
select instancia,
       date_trunc('day', em) as dia,
       count(*)              as trocas_de_estado,
       count(*) filter (where para = 'open')  as voltou,
       count(*) filter (where para = 'close') as caiu
  from public.conexao_eventos
 group by 1, 2
 order by 3 desc, 2 desc;
