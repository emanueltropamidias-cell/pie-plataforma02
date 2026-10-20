-- ============================================================================
-- ADMIN TAMBÉM PODE ENTRAR NUM SETOR
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O QUE MUDA, E POR QUÊ ───────────────────────────────────────────────────
--
-- A Thami é admin e não aparecia para escolher em Encaminhamentos. Não era
-- defeito de tela: `departamento_membros.atendente_id` aponta para
-- `atendentes`, e quem é admin não tinha linha lá. Sem a linha, é impossível
-- pôr a pessoa num setor — o banco recusaria.
--
-- Quem tirava a linha era o gatilho `papel_arruma_o_resto`, e ele tinha razão
-- de existir: promover o Diego a admin o deixava na distribuição, dono de chip,
-- com conversas abertas presas na mão de quem não atendia mais. Lead esperando
-- por alguém que saiu é lead perdido, e nada na tela dizia isso.
--
-- O conserto NÃO é desligar aquela proteção. É corrigir a premissa: "admin" foi
-- tratado como "saiu do atendimento", e não é. Admin coordena E atende.
--
-- Basta admin entrar na lista de quem atende. Com isso:
--
--   · promover atendente -> admin não mexe em NADA (antes e depois atendem), a
--     pessoa mantém linha, setores, chip e conversas;
--   · rebaixar para `usuario` ou `lideranca` continua soltando tudo, que é o
--     caso que o gatilho foi escrito para pegar.
--
-- ── O QUE ISTO NÃO FAZ ──────────────────────────────────────────────────────
--
-- Não põe admin em setor nenhum sozinho. Ela passa a PODER ser escolhida; quem
-- escolhe é a coordenação, na tela. Admin fora de todo setor não recebe nada:
-- `transferir_para_departamento` só sorteia entre membros do setor.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. O GATILHO PASSA A CONTAR ADMIN COMO QUEM ATENDE
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.papel_arruma_o_resto()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- A ÚNICA MUDANÇA: 'admin' entra nas duas listas.
  --
  -- Nas duas, e não só numa: se entrasse só em "agora", promover atendente a
  -- admin seria lido como ENTRADA no atendimento e a pessoa seria jogada no
  -- setor padrão de novo, mesmo que a coordenação a tivesse tirado de lá.
  v_atende_antes boolean := coalesce(old.role, '') in ('atendente', 'supervisor', 'admin');
  v_atende_agora boolean := coalesce(new.role, '') in ('atendente', 'supervisor', 'admin');
  v_setor bigint;
begin
  if v_atende_antes = v_atende_agora then
    return new;
  end if;

  -- ── ENTROU NO ATENDIMENTO ────────────────────────────────────────────────
  if v_atende_agora then
    insert into public.atendentes (id, nome, disponivel)
    values (new.id, coalesce(new.nome, 'sem nome'), true)
    on conflict (id) do update set disponivel = true;

    select id into v_setor
      from public.departamentos
     where padrao and ativo
     limit 1;

    if v_setor is not null then
      insert into public.departamento_membros (departamento_id, atendente_id)
      values (v_setor, new.id)
      on conflict (departamento_id, atendente_id) do nothing;
    end if;

    return new;
  end if;

  -- ── SAIU DO ATENDIMENTO ──────────────────────────────────────────────────
  --
  -- A ORDEM IMPORTA. Soltar as conversas ANTES de apagar a linha de atendente:
  -- depois de apagada não há mais como saber quais eram dela.
  --
  -- Só as ABERTAS voltam para a fila. As encerradas guardam o nome de quem
  -- atendeu — é histórico, e é de lá que sai o crédito por atendente na
  -- métrica. Apagar isso seria reescrever o que a pessoa fez.
  update public.conversas
     set atendente_id = null, atribuido_em = null, atualizado_em = now()
   where atendente_id = new.id
     and encerrada_em is null;

  -- O chip volta a ser de ninguém, e a tela de Números mostra isso.
  update public.numeros set atendente_id = null where atendente_id = new.id;

  delete from public.departamento_membros where atendente_id = new.id;
  delete from public.atendentes where id = new.id;

  return new;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. QUEM JÁ É ADMIN E PERDEU A LINHA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- O gatilho só roda em `update`. Quem virou admin antes desta correção — a
-- Thami e quem mais estiver assim — continua sem linha em `atendentes`, e
-- continuaria invisível no seletor.
--
-- `disponivel = true` porque a chave hoje não distribui nada sozinha: ela só
-- decide entre os membros DE UM SETOR quando alguém encaminha. Admin fora de
-- setor segue sem receber coisa alguma.
--
-- NÃO entram no setor padrão. Quem decide de qual setor a admin faz parte é a
-- coordenação — enfiar todo admin no Geral encheria a fila de quem não pediu.
insert into public.atendentes (id, nome, disponivel)
select p.id, coalesce(p.nome, 'sem nome'), true
  from public.profiles p
 where coalesce(p.role, 'usuario') = 'admin'
   and coalesce(p.status, 'ativo') = 'ativo'
on conflict (id) do nothing;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- Todo admin ativo tem de aparecer com `pode_ser_escolhida = true`. `setores`
-- em zero é normal e esperado — significa que ninguém a pôs em nenhum ainda.
select p.nome,
       p.role,
       (a.id is not null)                as pode_ser_escolhida,
       coalesce(a.disponivel, false)     as disponivel,
       count(m.departamento_id)          as setores
  from public.profiles p
  left join public.atendentes a on a.id = p.id
  left join public.departamento_membros m on m.atendente_id = p.id
 where coalesce(p.role, 'usuario') in ('admin', 'supervisor', 'atendente')
   and coalesce(p.status, 'ativo') = 'ativo'
 group by p.id, p.nome, p.role, a.id, a.disponivel
 order by p.role, p.nome;
