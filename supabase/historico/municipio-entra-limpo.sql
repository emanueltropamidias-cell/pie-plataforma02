-- ============================================================================
-- O MUNICÍPIO ENTRA LIMPO, NAS DUAS TABELAS
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE O EMANUEL VIU ─────────────────────────────────────────────────────
--
-- O filtro "Município" das Métricas abriu com isto no topo da lista:
--
--     -   ''   !!   ..   ++   Abaíra   Abaíra/BA   Alcobaça/BA   Alibrife/
--     ARACAJU-SE   Aracaju/SE   Apoiadora de outro estado. CEARÁ
--
-- Não é problema de tela. A tela mostra o que existe: 445 grafias distintas em
-- `conversas`, das quais 164 o mapa não reconhece.
--
-- ── O DEFEITO É MEU, E É O QUE A REGRA MANDA EVITAR ─────────────────────────
--
-- Em 31/08 eu limpei município. Limpei em `liderancas` e NÃO em `conversas` —
-- exatamente o erro que o CLAUDE.md descreve: "limpeza de município escrita
-- para duas tabelas, conferida em uma".
--
-- ── O PADRÃO DOMINANTE É O SUFIXO DE ESTADO ─────────────────────────────────
--
-- `Camaçari/BA` e `Camaçari` são duas linhas no filtro, dois grupos no mapa e
-- duas fatias na métrica — para a mesma cidade. Quem escolhe uma vê metade dos
-- leads e não tem como desconfiar.
--
-- ── E O CONSERTO NÃO PODE SER SÓ NO QUE JÁ ESTÁ GRAVADO ─────────────────────
--
-- Nada normalizava na escrita. Limpar hoje e não travar a porta é combinar de
-- limpar de novo daqui a duas semanas. Por isso vai gatilho nas duas tabelas.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A REGRA, NUM LUGAR SÓ
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Devolve o nome OFICIAL quando reconhece, o texto limpo quando não reconhece,
-- e nulo quando não sobra nada.
--
-- Fora da Bahia CONTINUA aparecendo, com o estado junto: "Aracaju/SE" é
-- informação. Virar "Aracaju" faria parecer cidade baiana; virar nulo apagaria
-- que a pessoa existe. Só o que não tem letra nenhuma vira nulo.

-- A comparação sem acento e sem caixa JÁ EXISTE no banco:
-- `public.chave_municipio(t text)`, que baixa a caixa, tira o acento pelo
-- `unaccent_simples` e colapsa o resto. Criar outra igual aqui seria a mesma
-- regra em dois lugares — e regra de cruzamento duplicada é a que desencontra
-- primeiro. Esta função só a chama.

create or replace function public.municipio_oficial(v text)
returns text language plpgsql immutable
set search_path = public, pg_temp
as $$
declare
  v_limpo text := btrim(coalesce(v, ''));
  v_sem_uf text;
  v_achado text;
begin
  -- Sem letra é lixo de digitação: '..', ',,', '!!', '++', '-'. E o 'X' era o
  -- marcador de "não informado" da planilha de atendimentos.
  if v_limpo = '' or v_limpo !~ '[[:alpha:]]' or upper(v_limpo) = 'X' then
    return null;
  end if;

  -- Tira o sufixo de estado só para PROCURAR — nas duas formas que aparecem na
  -- base: a sigla ("Camaçari/BA", "ARACAJU-SE") e o nome por extenso
  -- ("Brumado Bahia", "Aracatu Bahia").
  v_sem_uf := btrim(regexp_replace(v_limpo, '\s*[/-]\s*[A-Za-z]{2}\s*$', ''));
  v_sem_uf := btrim(regexp_replace(v_sem_uf, '\s+bahia\s*$', '', 'i'));

  select m.nome into v_achado
    from public.municipios_ba m
   where public.chave_municipio(m.nome) = public.chave_municipio(v_sem_uf)
   limit 1;

  if v_achado is not null then
    return v_achado;
  end if;

  -- ── NÃO RECONHECIDO: PADRONIZA A CAIXA ───────────────────────────────────
  --
  -- Não é da Bahia, ou está escrito de um jeito que ninguém reconhece. O texto
  -- fica — inventar aqui é pior que deixar aparecer.
  --
  -- Mas a CAIXA é padronizada, senão 'chapada diamantina', 'Chapada diamantina'
  -- e 'CHAPADA DIAMANTINA' viram TRÊS linhas no filtro para a mesma coisa.
  v_limpo := initcap(v_limpo);

  -- A sigla do estado volta para maiúscula: `initcap` faria 'Aracaju/Se'.
  --
  -- Feito com `left`/`right` e NÃO com backreferência dentro de
  -- `regexp_replace`: o Postgres não deixa passar `\1` por `upper()`, e a
  -- tentativa escreveu a string literal "\1\2" no lugar do estado em 37
  -- linhas. O jeito torto falhava GRAVANDO, não dando erro.
  -- O separador vira barra sempre: 'ARACAJU-SE' e 'Aracaju/SE' são a mesma
  -- cidade e viravam duas linhas no filtro.
  v_limpo := regexp_replace(v_limpo, '\s*-\s*([A-Za-z]{2})$', '/\1');

  if v_limpo ~ '[/-][A-Za-z]{2}$' then
    v_limpo := left(v_limpo, length(v_limpo) - 2) || upper(right(v_limpo, 2));
  end if;

  return v_limpo;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. O REPARO DE UM ERRO MEU
-- ─────────────────────────────────────────────────────────────────────────────
--
-- A primeira versão desta função tentou passar uma backreferência por `upper()`
-- dentro de `regexp_replace`. O Postgres não faz isso — e não reclama: gravou a
-- string literal "\1\2" no lugar da sigla do estado, em 37 linhas.
--
-- O nome da cidade sobreviveu; a sigla se perdeu. Aqui o lixo sai. Restaurar a
-- sigla exigiria adivinhar de que estado é cada uma, e adivinhar dado de
-- eleitor é pior que assumir a perda.
update public.conversas
   set municipio = nullif(btrim(replace(municipio, chr(92) || '1' || chr(92) || '2', '')), '')
 where strpos(municipio, chr(92)) > 0;

update public.conversas
   set municipio_sugerido = nullif(btrim(replace(municipio_sugerido, chr(92) || '1' || chr(92) || '2', '')), '')
 where strpos(municipio_sugerido, chr(92)) > 0;

update public.liderancas
   set municipio = nullif(btrim(replace(municipio, chr(92) || '1' || chr(92) || '2', '')), '')
 where strpos(municipio, chr(92)) > 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. O QUE JÁ ESTÁ GRAVADO
-- ─────────────────────────────────────────────────────────────────────────────
update public.conversas
   set municipio = public.municipio_oficial(municipio)
 where municipio is distinct from public.municipio_oficial(municipio);

update public.conversas
   set municipio_sugerido = public.municipio_oficial(municipio_sugerido)
 where municipio_sugerido is distinct from public.municipio_oficial(municipio_sugerido);

update public.liderancas
   set municipio = public.municipio_oficial(municipio)
 where municipio is distinct from public.municipio_oficial(municipio);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. A PORTA, PARA NÃO SUJAR DE NOVO
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.municipio_normaliza()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.municipio := public.municipio_oficial(new.municipio);
  return new;
end $$;

create or replace function public.municipio_normaliza_conversa()
returns trigger language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.municipio          := public.municipio_oficial(new.municipio);
  new.municipio_sugerido := public.municipio_oficial(new.municipio_sugerido);
  return new;
end $$;

drop trigger if exists conversa_municipio_limpo on public.conversas;
create trigger conversa_municipio_limpo
  before insert or update of municipio, municipio_sugerido on public.conversas
  for each row execute function public.municipio_normaliza_conversa();

drop trigger if exists lideranca_municipio_limpo on public.liderancas;
create trigger lideranca_municipio_limpo
  before insert or update of municipio on public.liderancas
  for each row execute function public.municipio_normaliza();

-- ── conferência ─────────────────────────────────────────────────────────────
select 'conversas' as tabela,
       count(distinct municipio)                                   as grafias,
       count(distinct municipio) filter (where m.nome is null)     as soltas
  from public.conversas c
  left join public.municipios_ba m on m.nome = c.municipio
 where c.municipio is not null
union all
select 'liderancas',
       count(distinct l.municipio),
       count(distinct l.municipio) filter (where m.nome is null)
  from public.liderancas l
  left join public.municipios_ba m on m.nome = l.municipio
 where l.municipio is not null;

-- O que sobrou solto, para olho humano. Deve ser só gente de fora da Bahia.
select c.municipio, count(*) as conversas
  from public.conversas c
  left join public.municipios_ba m on m.nome = c.municipio
 where c.municipio is not null and m.nome is null
 group by 1 order by 2 desc, 1 limit 30;
