-- ============================================================================
-- A SEGUNDA CONVERSA JÁ NASCE SABENDO QUEM É A PESSOA
-- ============================================================================
--
-- Rode DEPOIS de pessoa-ja-conhecida.sql. Pode rodar de novo sem medo.
--
-- ── A ARESTA ────────────────────────────────────────────────────────────────
--
-- `confirmar_cadastro` já marcava as OUTRAS conversas da mesma pessoa como
-- cadastradas. Mas ele roda no momento do cadastro — e só alcança as conversas
-- que existiam NAQUELE instante.
--
-- A conversa que nasce DEPOIS fica de fora. E é justamente o caso comum:
--
--   09:20  Thami cadastra o José pelo número 1
--   16:40  o José escreve para o número 3 — conversa nova, sem cadastro
--
-- A Boneca abre e vê duas coisas se contradizendo na mesma tela:
--
--   ✅ "Já cadastrada — por Thami"        (o aviso, que lê `liderancas`)
--   ▢  "Cadastrar esta pessoa"            (o formulário, que lê `cadastrado_em`)
--
-- Ela não sabe em qual acreditar. Se cadastrar de novo, não estraga nada — o
-- banco atualiza em vez de duplicar — mas ela perde tempo perguntando nome e
-- cidade de quem a campanha já conhece. Que é exatamente o que a gente estava
-- tentando evitar.
--
-- ── O CONSERTO ──────────────────────────────────────────────────────────────
--
-- A conversa NOVA olha `liderancas` na hora em que nasce. Se a pessoa já está
-- lá, ela nasce com nome, município, bairro e o carimbo de cadastrada.
--
-- De quebra, resolve um caso que não tem nada a ver com vários números: quem
-- está nas 29 mil da base antiga e escreve pela primeira vez agora aparece com
-- o nome preenchido, em vez de virar "lead novo" para ser recadastrado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. A COLUNA DE QUEM CADASTROU, POR GARANTIA
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Ela é criada em `pessoa-ja-conhecida.sql`. Repetir aqui não custa nada — o
-- `if not exists` não faz nada quando ela já existe — e evita o erro que este
-- arquivo dava quando rodado fora de ordem:
--
--   ERROR: column l.cadastrado_por does not exist
--
-- Arquivo de migração que só funciona na ordem certa é armadilha: a ordem está
-- na cabeça de quem escreveu, e quem roda seis meses depois não tem essa cabeça.
alter table public.liderancas
  add column if not exists cadastrado_por uuid
    references public.profiles(id) on delete set null;

create or replace function public.conversa_nasce_conhecida()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dig  text;
  v_lid  record;
begin
  -- Só quando a conversa NASCE, e só se ainda não veio preenchida.
  if new.cadastrado_em is not null then
    return new;
  end if;

  v_dig := right(public.so_digitos(new.telefone), 11);
  if v_dig is null or length(v_dig) < 10 then
    return new;
  end if;

  select l.id, l.nome, l.municipio, l.bairro, l.cadastrado_por
    into v_lid
    from public.liderancas l
   where l.telefone_digitos = v_dig
   limit 1;

  if v_lid.id is null then
    return new;
  end if;

  -- `coalesce` em tudo: o que já veio na conversa manda. O nome do perfil do
  -- WhatsApp pode estar mais atual que o da base de dois anos atrás.
  new.lideranca_id   := v_lid.id;
  new.nome           := coalesce(new.nome, v_lid.nome);
  new.municipio      := coalesce(new.municipio, v_lid.municipio);
  new.bairro         := coalesce(new.bairro, v_lid.bairro);
  new.cadastrado_em  := now();
  new.cadastrado_por := v_lid.cadastrado_por;

  return new;
end $$;

drop trigger if exists conversa_nasce_conhecida on public.conversas;
create trigger conversa_nasce_conhecida
  before insert on public.conversas
  for each row execute function public.conversa_nasce_conhecida();

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE JÁ ESTÁ TORTO
-- ─────────────────────────────────────────────────────────────────────────────
--
-- As conversas que já existem e cuja pessoa está na base, mas que ficaram sem
-- o carimbo. Uma varredura, agora.
update public.conversas c
   set lideranca_id   = l.id,
       nome           = coalesce(c.nome, l.nome),
       municipio      = coalesce(c.municipio, l.municipio),
       bairro         = coalesce(c.bairro, l.bairro),
       cadastrado_em  = now(),
       cadastrado_por = l.cadastrado_por
  from public.liderancas l
 where l.telefone_digitos = right(public.so_digitos(c.telefone), 11)
   and c.cadastrado_em is null;

-- ── conferência ─────────────────────────────────────────────────────────────
--
-- `contradicao` tem de ser 0: conversa cuja pessoa está na base mas que ainda
-- mostraria o formulário de cadastro.
select
  (select count(*) from public.conversas)                    as conversas,
  (select count(*) from public.conversas
    where cadastrado_em is not null)                         as cadastradas,
  (select count(*)
     from public.conversas c
     join public.liderancas l
       on l.telefone_digitos = right(public.so_digitos(c.telefone), 11)
    where c.cadastrado_em is null)                           as contradicao;
