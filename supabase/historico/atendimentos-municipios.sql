-- ============================================================================
-- AS GRAFIAS SOLTAS SAEM DO MAPA — E O MAPA SO CONTA QUEM CASA EXATO
-- ============================================================================
--
-- GERADO por scripts/gerar-sql-municipios.py a partir de
-- scripts/municipios-de-para.json. Nao edite aqui: edite o JSON e gere de
-- novo, senao a planilha e o banco passam a discordar.
--
-- Rode inteiro. Pode rodar de novo sem medo.
--
-- ── O QUE ISTO CONSERTA ─────────────────────────────────────────────────────
--
-- O mapa da Bahia soma por NOME EXATO contra municipios_ba. Uma grafia solta
-- nao produz erro em lugar nenhum: a pessoa simplesmente some do mapa, e o
-- municipio aparece mais vazio do que e. E o defeito mais silencioso que
-- existe nesta base — ninguem olha um numero que nunca apareceu.
--
-- Sao 45 pessoas assim hoje, em 34 grafias, de 980 com municipio preenchido.
-- Destas, 34 voltam para o mapa aqui embaixo.
--
-- Fora do estado fica como esta, de proposito: a pessoa e de Sao Paulo mesmo.
-- Trocar por nulo esconderia que ela existe; o mapa da Bahia ja a ignora.

-- vai para Aporá
update public.liderancas
   set municipio = 'Aporá'
 where municipio in ('Itamira apora bahia');

-- vai para Boa Vista do Tupim
update public.liderancas
   set municipio = 'Boa Vista do Tupim'
 where municipio in ('Boa vista Tumpi');

-- vai para Campo Alegre de Lourdes
update public.liderancas
   set municipio = 'Campo Alegre de Lourdes'
 where municipio in ('Campo alegre');

-- vai para Mucuri
update public.liderancas
   set municipio = 'Mucuri'
 where municipio in ('Itabatan');

-- vai para Nova Viçosa
update public.liderancas
   set municipio = 'Nova Viçosa'
 where municipio in ('Mata nova viçosa');

-- vai para Remanso
update public.liderancas
   set municipio = 'Remanso'
 where municipio in ('Remansso Bahia');

-- vai para Salvador
update public.liderancas
   set municipio = 'Salvador'
 where municipio in ('Ilha de Maré', 'so savado');

-- vai para Tucano
update public.liderancas
   set municipio = 'Tucano'
 where municipio in ('Calda de jorro');

-- sem cidade legivel — lixo de digitacao, ou regiao em vez de municipio
update public.liderancas
   set municipio = null
 where municipio in ('!!', '++', ',,', '..', 'Atalaia', 'Bahia', 'Bento Simões', 'CHAPADA DIAMANTINA', 'Chapada Diamantina', 'Lisinu', 'Padro', 'chapada', 'chapada diamantina', 'sebastiao de souza');

-- ── AS OBSERVACOES DA PLANILHA PRECISAM DE ONDE MORAR ───────────────────────
--
-- 2.714 das 3.346 linhas tem observacao, e e a parte mais util da planilha:
-- 'tem 1.000 votos no condominio', 'pediu ajuda com exame de vista', 'quer
-- entregar panfleto'. Nao existe coluna para isso em liderancas hoje.
--
-- NAO vai para a tabela `demandas`: la e fila de atendimento, com status e
-- prazo. Despejar 2.714 tickets abertos afogaria uma tela que a equipe usa
-- para trabalhar. Isto aqui e anotacao sobre a pessoa, nao pedido em aberto.
alter table public.liderancas
  add column if not exists observacoes text;

comment on column public.liderancas.observacoes is
  'Anotacao livre sobre a pessoa, vinda do atendimento. Nao e fila: pedido em aberto vai para a tabela demandas.';

-- ── conferencia ─────────────────────────────────────────────────────────────
select count(*)                                   as pessoas,
       count(municipio)                           as com_municipio,
       count(*) filter (where observacoes is not null) as com_observacao
  from public.liderancas;
