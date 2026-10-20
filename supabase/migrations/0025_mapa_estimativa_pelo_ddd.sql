-- ============================================================================
-- QUEM NÃO TEM MUNICÍPIO ENTRA NO MAPA PELO DDD — COMO ESTIMATIVA
-- ============================================================================
--
-- Rode inteiro. Pode rodar de novo sem medo. Não apaga nada.
--
-- ── O PEDIDO ────────────────────────────────────────────────────────────────
--
-- O Emanuel, em 15/09: as pessoas sem município — as que conversaram e nunca
-- foram registradas, as fichas sem cidade, as que escreveram "Chapada
-- Diamantina" — têm DDD, e o DDD diz a região. Que o mapa distribua essas
-- pessoas pelas cidades da região do DDD, e que, à medida que cada uma for
-- registrada, ela saia da estimativa e vá para o lugar certo.
--
-- A realocação não precisa de trabalho nenhum: a conta é refeita cada vez que
-- o mapa abre. Quem ganha município sai do grupo sem município e passa a
-- contar como confirmado na cidade dela.
--
-- ── COMO DISTRIBUIR ─────────────────────────────────────────────────────────
--
-- PROPORCIONAL À BASE CONFIRMADA DENTRO DO DDD, e não dividido igual. O DDD 75
-- tem 143 municípios: dividir igual poria gente em cidade onde a campanha nem
-- chegou. Se 30% das pessoas confirmadas com DDD 75 estão em Feira de Santana,
-- Feira recebe 30% das sem município do DDD 75.
--
-- DDD de fora da Bahia NÃO é distribuído — o próprio Emanuel lembrou que muita
-- gente mora aqui com número de outro estado, e para esse número não há região
-- nenhuma para onde levar. Fica contado, fora do mapa.
--
-- ── E A REGRA QUE ISTO ESTICA ───────────────────────────────────────────────
--
-- A Estratégia do PIE tem escrito que nada ali estima, porque "número inventado
-- num painel de campanha vira dinheiro gasto no lugar errado". Esta função é
-- estimativa por definição, e por isso ela nunca se mistura com o confirmado:
-- é função separada, devolve os dois números separados, e a tela mostra
-- "3.711 confirmados + ~N estimados" — nunca a soma como se fosse uma coisa só.
--
-- Função separada também por peso: `painel_territorio()` alimenta Dashboard e
-- Leads e já leva 0,9 s. A estimativa lê as 12 mil conversas, e só o mapa usa.

create table if not exists public.ddd_municipio (
  ddd       text not null,
  municipio text not null,
  chave     text generated always as (public.chave_municipio(municipio)) stored,
  primary key (chave)
);

alter table public.ddd_municipio enable row level security;
drop policy if exists "ddd_municipio ler" on public.ddd_municipio;
create policy "ddd_municipio ler" on public.ddd_municipio for select to authenticated using (true);

-- DADOS: DDD de cada município da Bahia, baixado em 15/09/2026 de
--   brasilapi.com.br/api/ddd/v1/{71,73,74,75,77}  (base: numeração da Anatel)
-- 417 municípios — os 417 da Bahia. Gerado por script, com TRÊS nomes trocados
-- à mão para a grafia oficial do IBGE, porque a Anatel usa outra e sem isso as
-- três cidades ficariam fora da distribuição (só 414 casavam):
--   Livramento do Brumado    -> Livramento de Nossa Senhora
--   Muquém de São Francisco  -> Muquém do São Francisco
--   Santa Teresinha          -> Santa Terezinha

insert into public.ddd_municipio (ddd, municipio) values
($$71$$,$$VERA CRUZ$$),
($$71$$,$$SIMÕES FILHO$$),
($$71$$,$$SAUBARA$$),
($$71$$,$$SÃO SEBASTIÃO DO PASSÉ$$),
($$71$$,$$SÃO FRANCISCO DO CONDE$$),
($$71$$,$$SALVADOR$$),
($$71$$,$$POJUCA$$),
($$71$$,$$MATA DE SÃO JOÃO$$),
($$71$$,$$MADRE DE DEUS$$),
($$71$$,$$LAURO DE FREITAS$$),
($$71$$,$$ITAPARICA$$),
($$71$$,$$DIAS D'ÁVILA$$),
($$71$$,$$CATU$$),
($$71$$,$$CANDEIAS$$),
($$71$$,$$CAMAÇARI$$),
($$73$$,$$WENCESLAU GUIMARÃES$$),
($$73$$,$$VEREDA$$),
($$73$$,$$URUÇUCA$$),
($$73$$,$$UNA$$),
($$73$$,$$UBATÃ$$),
($$73$$,$$UBAITABA$$),
($$73$$,$$TEOLÂNDIA$$),
($$73$$,$$TEIXEIRA DE FREITAS$$),
($$73$$,$$SÃO JOSÉ DA VITÓRIA$$),
($$73$$,$$SANTA LUZIA$$),
($$73$$,$$SANTA INÊS$$),
($$73$$,$$SANTA CRUZ DA VITÓRIA$$),
($$73$$,$$SANTA CRUZ CABRÁLIA$$),
($$73$$,$$PRESIDENTE TANCREDO NEVES$$),
($$73$$,$$PRADO$$),
($$73$$,$$POTIRAGUÁ$$),
($$73$$,$$PORTO SEGURO$$),
($$73$$,$$PLANALTINO$$),
($$73$$,$$PIRAÍ DO NORTE$$),
($$73$$,$$PAU BRASIL$$),
($$73$$,$$NOVA VIÇOSA$$),
($$73$$,$$NOVA ITARANA$$),
($$73$$,$$NOVA IBIÁ$$),
($$73$$,$$NOVA CANAÃ$$),
($$73$$,$$NILO PEÇANHA$$),
($$73$$,$$MUCURI$$),
($$73$$,$$MEDEIROS NETO$$),
($$73$$,$$MASCOTE$$),
($$73$$,$$MARAÚ$$),
($$73$$,$$MARACÁS$$),
($$73$$,$$MANOEL VITORINO$$),
($$73$$,$$LAJEDO DO TABOCAL$$),
($$73$$,$$LAJEDÃO$$),
($$73$$,$$LAFAIETE COUTINHO$$),
($$73$$,$$JUSSARI$$),
($$73$$,$$JUCURUÇU$$),
($$73$$,$$JITAÚNA$$),
($$73$$,$$JEQUIÉ$$),
($$73$$,$$JAGUAQUARA$$),
($$73$$,$$ITUBERÁ$$),
($$73$$,$$ITORORÓ$$),
($$73$$,$$ITIRUÇU$$),
($$73$$,$$ITARANTIM$$),
($$73$$,$$ITAQUARA$$),
($$73$$,$$ITAPITANGA$$),
($$73$$,$$ITAPEBI$$),
($$73$$,$$ITAPÉ$$),
($$73$$,$$ITANHÉM$$),
($$73$$,$$ITAMARI$$),
($$73$$,$$ITAMARAJU$$),
($$73$$,$$ITAJUÍPE$$),
($$73$$,$$ITAJU DO COLÔNIA$$),
($$73$$,$$ITAGIMIRIM$$),
($$73$$,$$ITAGIBÁ$$),
($$73$$,$$ITAGI$$),
($$73$$,$$ITACARÉ$$),
($$73$$,$$ITABUNA$$),
($$73$$,$$ITABELA$$),
($$73$$,$$IRAJUBA$$),
($$73$$,$$IPIAÚ$$),
($$73$$,$$ILHÉUS$$),
($$73$$,$$IGUAÍ$$),
($$73$$,$$IGRAPIÚNA$$),
($$73$$,$$IBIRATAIA$$),
($$73$$,$$IBIRAPUÃ$$),
($$73$$,$$IBIRAPITANGA$$),
($$73$$,$$IBICUÍ$$),
($$73$$,$$IBICARAÍ$$),
($$73$$,$$GUARATINGA$$),
($$73$$,$$GONGOGI$$),
($$73$$,$$GANDU$$),
($$73$$,$$FLORESTA AZUL$$),
($$73$$,$$FIRMINO ALVES$$),
($$73$$,$$EUNÁPOLIS$$),
($$73$$,$$DÁRIO MEIRA$$),
($$73$$,$$CRAVOLÂNDIA$$),
($$73$$,$$COARACI$$),
($$73$$,$$CARAVELAS$$),
($$73$$,$$CANAVIEIRAS$$),
($$73$$,$$CAMAMU$$),
($$73$$,$$CAMACAN$$),
($$73$$,$$BUERAREMA$$),
($$73$$,$$BELMONTE$$),
($$73$$,$$BARRO PRETO$$),
($$73$$,$$BARRA DO ROCHA$$),
($$73$$,$$AURELINO LEAL$$),
($$73$$,$$ARATACA$$),
($$73$$,$$APUAREMA$$),
($$73$$,$$ALMADINA$$),
($$73$$,$$ALCOBAÇA$$),
($$73$$,$$AIQUARA$$),
($$74$$,$$XIQUE-XIQUE$$),
($$74$$,$$VÁRZEA NOVA$$),
($$74$$,$$VÁRZEA DO POÇO$$),
($$74$$,$$VÁRZEA DA ROÇA$$),
($$74$$,$$UMBURANAS$$),
($$74$$,$$UIBAÍ$$),
($$74$$,$$UAUÁ$$),
($$74$$,$$TAPIRAMUTÁ$$),
($$74$$,$$SOBRADINHO$$),
($$74$$,$$SERROLÂNDIA$$),
($$74$$,$$SENTO SÉ$$),
($$74$$,$$SENHOR DO BONFIM$$),
($$74$$,$$SAÚDE$$),
($$74$$,$$SÃO JOSÉ DO JACUÍPE$$),
($$74$$,$$SÃO GABRIEL$$),
($$74$$,$$REMANSO$$),
($$74$$,$$QUIXABEIRA$$),
($$74$$,$$PRESIDENTE DUTRA$$),
($$74$$,$$PONTO NOVO$$),
($$74$$,$$PIRITIBA$$),
($$74$$,$$PINDOBAÇU$$),
($$74$$,$$PILÃO ARCADO$$),
($$74$$,$$OUROLÂNDIA$$),
($$74$$,$$MUNDO NOVO$$),
($$74$$,$$MULUNGU DO MORRO$$),
($$74$$,$$MORRO DO CHAPÉU$$),
($$74$$,$$MIRANGABA$$),
($$74$$,$$MIGUEL CALMON$$),
($$74$$,$$MAIRI$$),
($$74$$,$$MACAJUBA$$),
($$74$$,$$LAPÃO$$),
($$74$$,$$JUSSARA$$),
($$74$$,$$JUAZEIRO$$),
($$74$$,$$JOÃO DOURADO$$),
($$74$$,$$JAGUARARI$$),
($$74$$,$$JACOBINA$$),
($$74$$,$$ITIÚBA$$),
($$74$$,$$ITAGUAÇU DA BAHIA$$),
($$74$$,$$IRECÊ$$),
($$74$$,$$IBITITÁ$$),
($$74$$,$$IBIPEBA$$),
($$74$$,$$GENTIO DO OURO$$),
($$74$$,$$FILADÉLFIA$$),
($$74$$,$$CURAÇÁ$$),
($$74$$,$$CENTRAL$$),
($$74$$,$$CASA NOVA$$),
($$74$$,$$CAPIM GROSSO$$),
($$74$$,$$CANARANA$$),
($$74$$,$$CAMPO FORMOSO$$),
($$74$$,$$CAMPO ALEGRE DE LOURDES$$),
($$74$$,$$CALDEIRÃO GRANDE$$),
($$74$$,$$CAFARNAUM$$),
($$74$$,$$CAÉM$$),
($$74$$,$$BARRO ALTO$$),
($$74$$,$$BARRA DO MENDES$$),
($$74$$,$$BARRA$$),
($$74$$,$$BAIXA GRANDE$$),
($$74$$,$$ANTÔNIO GONÇALVES$$),
($$74$$,$$ANDORINHA$$),
($$74$$,$$AMÉRICA DOURADA$$),
($$75$$,$$WAGNER$$),
($$75$$,$$VARZEDO$$),
($$75$$,$$VALENTE$$),
($$75$$,$$VALENÇA$$),
($$75$$,$$UTINGA$$),
($$75$$,$$UBAÍRA$$),
($$75$$,$$TUCANO$$),
($$75$$,$$TERRA NOVA$$),
($$75$$,$$TEOFILÂNDIA$$),
($$75$$,$$TEODORO SAMPAIO$$),
($$75$$,$$TAPEROÁ$$),
($$75$$,$$TANQUINHO$$),
($$75$$,$$SOUTO SOARES$$),
($$75$$,$$SÍTIO DO QUINTO$$),
($$75$$,$$SERRINHA$$),
($$75$$,$$SERRA PRETA$$),
($$75$$,$$SEABRA$$),
($$75$$,$$SÁTIRO DIAS$$),
($$75$$,$$SAPEAÇU$$),
($$75$$,$$SÃO MIGUEL DAS MATAS$$),
($$75$$,$$SÃO GONÇALO DOS CAMPOS$$),
($$75$$,$$SÃO FELIPE$$),
($$75$$,$$SÃO FÉLIX$$),
($$75$$,$$SÃO DOMINGOS$$),
($$75$$,$$SANTO ESTÊVÃO$$),
($$75$$,$$SANTO ANTÔNIO DE JESUS$$),
($$75$$,$$SANTO AMARO$$),
($$75$$,$$Santa Terezinha$$),
($$75$$,$$SANTANÓPOLIS$$),
($$75$$,$$SANTALUZ$$),
($$75$$,$$SANTA BRÍGIDA$$),
($$75$$,$$SANTA BÁRBARA$$),
($$75$$,$$SALINAS DA MARGARIDA$$),
($$75$$,$$RUY BARBOSA$$),
($$75$$,$$RODELAS$$),
($$75$$,$$RIO REAL$$),
($$75$$,$$RIBEIRA DO POMBAL$$),
($$75$$,$$RIBEIRA DO AMPARO$$),
($$75$$,$$RIACHÃO DO JACUÍPE$$),
($$75$$,$$RETIROLÂNDIA$$),
($$75$$,$$RAFAEL JAMBEIRO$$),
($$75$$,$$QUIJINGUE$$),
($$75$$,$$QUEIMADAS$$),
($$75$$,$$PINTADAS$$),
($$75$$,$$PEDRO ALEXANDRE$$),
($$75$$,$$PEDRÃO$$),
($$75$$,$$PÉ DE SERRA$$),
($$75$$,$$PAULO AFONSO$$),
($$75$$,$$PARIPIRANGA$$),
($$75$$,$$PALMEIRAS$$),
($$75$$,$$OURIÇANGAS$$),
($$75$$,$$OLINDINA$$),
($$75$$,$$NOVO TRIUNFO$$),
($$75$$,$$NOVA SOURE$$),
($$75$$,$$NOVA REDENÇÃO$$),
($$75$$,$$NOVA FÁTIMA$$),
($$75$$,$$NORDESTINA$$),
($$75$$,$$NAZARÉ$$),
($$75$$,$$MUTUÍPE$$),
($$75$$,$$MURITIBA$$),
($$75$$,$$MUNIZ FERREIRA$$),
($$75$$,$$MUCUGÊ$$),
($$75$$,$$MONTE SANTO$$),
($$75$$,$$MILAGRES$$),
($$75$$,$$MARCIONÍLIO SOUZA$$),
($$75$$,$$MARAGOGIPE$$),
($$75$$,$$MACURURÉ$$),
($$75$$,$$LENÇÓIS$$),
($$75$$,$$LAMARÃO$$),
($$75$$,$$LAJEDINHO$$),
($$75$$,$$LAJE$$),
($$75$$,$$JIQUIRIÇÁ$$),
($$75$$,$$JEREMOABO$$),
($$75$$,$$JANDAÍRA$$),
($$75$$,$$JAGUARIPE$$),
($$75$$,$$ITATIM$$),
($$75$$,$$ITAPICURU$$),
($$75$$,$$ITANAGRA$$),
($$75$$,$$ITAETÉ$$),
($$75$$,$$ITABERABA$$),
($$75$$,$$IRARÁ$$),
($$75$$,$$IRAQUARA$$),
($$75$$,$$IPIRÁ$$),
($$75$$,$$IPECAETÁ$$),
($$75$$,$$INHAMBUPE$$),
($$75$$,$$ICHU$$),
($$75$$,$$IBIQUERA$$),
($$75$$,$$IAÇU$$),
($$75$$,$$HELIÓPOLIS$$),
($$75$$,$$GOVERNADOR MANGABEIRA$$),
($$75$$,$$GLÓRIA$$),
($$75$$,$$GAVIÃO$$),
($$75$$,$$FEIRA DE SANTANA$$),
($$75$$,$$FÁTIMA$$),
($$75$$,$$EUCLIDES DA CUNHA$$),
($$75$$,$$ESPLANADA$$),
($$75$$,$$ENTRE RIOS$$),
($$75$$,$$ELÍSIO MEDRADO$$),
($$75$$,$$DOM MACEDO COSTA$$),
($$75$$,$$CRUZ DAS ALMAS$$),
($$75$$,$$CRISÓPOLIS$$),
($$75$$,$$CORONEL JOÃO SÁ$$),
($$75$$,$$CORAÇÃO DE MARIA$$),
($$75$$,$$CONDE$$),
($$75$$,$$CONCEIÇÃO DO JACUÍPE$$),
($$75$$,$$CONCEIÇÃO DO COITÉ$$),
($$75$$,$$CONCEIÇÃO DO ALMEIDA$$),
($$75$$,$$CONCEIÇÃO DA FEIRA$$),
($$75$$,$$CIPÓ$$),
($$75$$,$$CÍCERO DANTAS$$),
($$75$$,$$CHORROCHÓ$$),
($$75$$,$$CASTRO ALVES$$),
($$75$$,$$CARDEAL DA SILVA$$),
($$75$$,$$CAPELA DO ALTO ALEGRE$$),
($$75$$,$$CANUDOS$$),
($$75$$,$$CANSANÇÃO$$),
($$75$$,$$CANDEAL$$),
($$75$$,$$CAIRU$$),
($$75$$,$$CACHOEIRA$$),
($$75$$,$$CABACEIRAS DO PARAGUAÇU$$),
($$75$$,$$BREJÕES$$),
($$75$$,$$BONITO$$),
($$75$$,$$BONINAL$$),
($$75$$,$$BOA VISTA DO TUPIM$$),
($$75$$,$$BIRITINGA$$),
($$75$$,$$BARROCAS$$),
($$75$$,$$BANZAÊ$$),
($$75$$,$$ARATUÍPE$$),
($$75$$,$$ARAMARI$$),
($$75$$,$$ARACI$$),
($$75$$,$$ARAÇAS$$),
($$75$$,$$APORÁ$$),
($$75$$,$$ANTÔNIO CARDOSO$$),
($$75$$,$$ANTAS$$),
($$75$$,$$ANGUERA$$),
($$75$$,$$ANDARAÍ$$),
($$75$$,$$AMÉLIA RODRIGUES$$),
($$75$$,$$AMARGOSA$$),
($$75$$,$$ALAGOINHAS$$),
($$75$$,$$ÁGUA FRIA$$),
($$75$$,$$ADUSTINA$$),
($$75$$,$$ACAJUTIBA$$),
($$75$$,$$ABARÉ$$),
($$77$$,$$LUIS EDUARDO MAGALHAES$$),
($$77$$,$$Livramento de Nossa Senhora$$),
($$77$$,$$WANDERLEY$$),
($$77$$,$$VITÓRIA DA CONQUISTA$$),
($$77$$,$$URANDI$$),
($$77$$,$$TREMEDAL$$),
($$77$$,$$TANQUE NOVO$$),
($$77$$,$$TANHAÇU$$),
($$77$$,$$TABOCAS DO BREJO VELHO$$),
($$77$$,$$SÍTIO DO MATO$$),
($$77$$,$$SERRA DOURADA$$),
($$77$$,$$SERRA DO RAMALHO$$),
($$77$$,$$SEBASTIÃO LARANJEIRAS$$),
($$77$$,$$SÃO FÉLIX DO CORIBE$$),
($$77$$,$$SÃO DESIDÉRIO$$),
($$77$$,$$SANTA RITA DE CÁSSIA$$),
($$77$$,$$SANTANA$$),
($$77$$,$$SANTA MARIA DA VITÓRIA$$),
($$77$$,$$RIO DO PIRES$$),
($$77$$,$$RIO DO ANTÔNIO$$),
($$77$$,$$RIO DE CONTAS$$),
($$77$$,$$RIBEIRÃO DO LARGO$$),
($$77$$,$$RIACHO DE SANTANA$$),
($$77$$,$$RIACHÃO DAS NEVES$$),
($$77$$,$$PRESIDENTE JÂNIO QUADROS$$),
($$77$$,$$POÇÕES$$),
($$77$$,$$PLANALTO$$),
($$77$$,$$PIRIPÁ$$),
($$77$$,$$PINDAÍ$$),
($$77$$,$$PIATÃ$$),
($$77$$,$$PARATINGA$$),
($$77$$,$$PARAMIRIM$$),
($$77$$,$$PALMAS DE MONTE ALTO$$),
($$77$$,$$OLIVEIRA DOS BREJINHOS$$),
($$77$$,$$NOVO HORIZONTE$$),
($$77$$,$$Muquém do São Francisco$$),
($$77$$,$$MORTUGABA$$),
($$77$$,$$MORPARÁ$$),
($$77$$,$$MIRANTE$$),
($$77$$,$$MATINA$$),
($$77$$,$$MANSIDÃO$$),
($$77$$,$$MALHADA DE PEDRAS$$),
($$77$$,$$MALHADA$$),
($$77$$,$$MAIQUINIQUE$$),
($$77$$,$$MAETINGA$$),
($$77$$,$$MACAÚBAS$$),
($$77$$,$$MACARANI$$),
($$77$$,$$LICÍNIO DE ALMEIDA$$),
($$77$$,$$LAGOA REAL$$),
($$77$$,$$JUSSIAPE$$),
($$77$$,$$JACARACI$$),
($$77$$,$$JABORANDI$$),
($$77$$,$$IUIÚ$$),
($$77$$,$$ITUAÇU$$),
($$77$$,$$ITAPETINGA$$),
($$77$$,$$ITAMBÉ$$),
($$77$$,$$IRAMAIA$$),
($$77$$,$$IPUPIARA$$),
($$77$$,$$IGAPORÃ$$),
($$77$$,$$IBOTIRAMA$$),
($$77$$,$$IBITIARA$$),
($$77$$,$$IBIPITANGA$$),
($$77$$,$$IBICOARA$$),
($$77$$,$$IBIASSUCÊ$$),
($$77$$,$$GUANAMBI$$),
($$77$$,$$GUAJERU$$),
($$77$$,$$FORMOSA DO RIO PRETO$$),
($$77$$,$$FEIRA DA MATA$$),
($$77$$,$$ENCRUZILHADA$$),
($$77$$,$$DOM BASÍLIO$$),
($$77$$,$$CRISTÓPOLIS$$),
($$77$$,$$COTEGIPE$$),
($$77$$,$$CORRENTINA$$),
($$77$$,$$CORIBE$$),
($$77$$,$$CORDEIROS$$),
($$77$$,$$CONTENDAS DO SINCORÁ$$),
($$77$$,$$CONDEÚBA$$),
($$77$$,$$COCOS$$),
($$77$$,$$CATURAMA$$),
($$77$$,$$CATOLÂNDIA$$),
($$77$$,$$CARINHANHA$$),
($$77$$,$$CARAÍBAS$$),
($$77$$,$$CÂNDIDO SALES$$),
($$77$$,$$CANDIBA$$),
($$77$$,$$CANÁPOLIS$$),
($$77$$,$$CAETITÉ$$),
($$77$$,$$CAETANOS$$),
($$77$$,$$CACULÉ$$),
($$77$$,$$CAATIBA$$),
($$77$$,$$BURITIRAMA$$),
($$77$$,$$BRUMADO$$),
($$77$$,$$BROTAS DE MACAÚBAS$$),
($$77$$,$$BREJOLÂNDIA$$),
($$77$$,$$BOTUPORÃ$$),
($$77$$,$$BOQUIRA$$),
($$77$$,$$BOM JESUS DA SERRA$$),
($$77$$,$$BOM JESUS DA LAPA$$),
($$77$$,$$BOA NOVA$$),
($$77$$,$$BELO CAMPO$$),
($$77$$,$$BARREIRAS$$),
($$77$$,$$BARRA DO CHOÇA$$),
($$77$$,$$BARRA DA ESTIVA$$),
($$77$$,$$BAIANÓPOLIS$$),
($$77$$,$$ARACATU$$),
($$77$$,$$ANGICAL$$),
($$77$$,$$ANAGÉ$$),
($$77$$,$$ÉRICO CARDOSO$$),
($$77$$,$$ABAÍRA$$)
on conflict do nothing;

-- A primeira execução deste arquivo gravou os três nomes da Anatel antes da
-- troca acima. Este delete tira só esses três — linhas que não casam com
-- nenhum dos 417 oficiais —, e numa instalação nova não encontra nada.
delete from public.ddd_municipio d
 where not exists (select 1 from public.municipios_ba m where m.chave = d.chave);

create or replace function public.mapa_estimativa_ddd()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  -- A base de pessoas uma vez só. Referenciada três vezes abaixo, a view era
  -- recalculada três vezes — classificando as 9 mil fichas em cada uma — e a
  -- função levava 3,9 s.
  with bp as materialized (
    select tel, municipio, local, nome from base_pessoas
  ),
  confirmados as (
    -- Os mesmos "completos" da Base e do mapa: com nome, município da Bahia.
    select mb.nome as municipio, dm.ddd, count(*)::numeric as qtd
      from bp b
      join municipios_ba mb on mb.chave = chave_municipio(b.municipio)
      join ddd_municipio dm on dm.chave = mb.chave
     where b.local = 'bahia' and b.nome is not null
     group by mb.nome, dm.ddd
  ),
  por_ddd as (
    select ddd, sum(qtd) as total from confirmados group by ddd
  ),
  sem_lugar as (
    -- Ficha sem município ou com município a corrigir...
    select tel from bp
     where local in ('vazio', 'a_corrigir') or (local = 'bahia' and nome is null)
    union
    -- ...e quem conversou e nunca virou ficha.
    select distinct right(so_digitos(c.telefone), 11)
      from conversas c
     where length(so_digitos(c.telefone)) between 10 and 13
       and not exists (select 1 from bp b where b.tel = right(so_digitos(c.telefone), 11))
  ),
  com_ddd as (
    select left(tel, 2) as ddd, count(*)::numeric as qtd
      from sem_lugar where length(tel) in (10, 11)
     group by 1
  ),
  estimados as (
    select c.municipio, sum(s.qtd * c.qtd / p.total) as qtd
      from com_ddd s
      join por_ddd p on p.ddd = s.ddd
      join confirmados c on c.ddd = s.ddd
     group by c.municipio
  )
  select case when public.perfil_equipe() then jsonb_build_object(
    'estimados', coalesce((
      select jsonb_agg(jsonb_build_object('municipio', municipio, 'qtd', round(qtd, 1)) order by qtd desc)
        from estimados where qtd >= 0.05
    ), '[]'::jsonb),
    'distribuidas', (select coalesce(sum(qtd), 0)::int from com_ddd where ddd in (select ddd from por_ddd)),
    'porDdd', coalesce((
      select jsonb_agg(jsonb_build_object('ddd', s.ddd, 'pessoas', s.qtd::int) order by s.qtd desc)
        from com_ddd s where s.ddd in (select ddd from por_ddd)
    ), '[]'::jsonb),
    'foraDaBahia', (select coalesce(sum(qtd), 0)::int from com_ddd where ddd not in (select ddd from por_ddd)),
    'semLugar',    (select count(*)::int from sem_lugar)
  ) else null end
$$;

revoke all on function public.mapa_estimativa_ddd() from public, anon;
grant execute on function public.mapa_estimativa_ddd() to authenticated, service_role;

-- ── conferência ─────────────────────────────────────────────────────────────
-- Sem begin/rollback (ver 0022). A função exige usuário logado, então a prova
-- aqui é a tabela de DDD fechar com os 417 e a função existir.

select count(*)::int as municipios_com_ddd,
       count(*) filter (where exists (select 1 from municipios_ba m where m.chave = ddd_municipio.chave))::int as casam_com_os_417,
       string_agg(distinct ddd, ', ' order by ddd) as ddds
  from ddd_municipio;

select proname as funcao_criada from pg_proc
 where proname = 'mapa_estimativa_ddd' and pronamespace = 'public'::regnamespace;
