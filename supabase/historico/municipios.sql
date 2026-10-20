-- Os 417 municípios da Bahia como tabela de referência.
--
-- O painel contava "465 de 417" porque contava GRAFIAS distintas da coluna
-- municipio, não municípios: acento faltando, caixa diferente, abreviação e
-- cidade de fora do estado entravam cada uma como se fosse um município novo.

-- Sem acento, sem pontuação, minúsculo — a mesma normalização do aplicativo.
-- Resolve as letras que aparecem em nome de cidade brasileira sem depender da
-- extensão unaccent, que nem todo projeto tem habilitada.
create or replace function public.unaccent_simples(t text)
returns text language sql immutable as $$
  select translate(coalesce(t, ''),
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')
$$;

create or replace function public.chave_municipio(t text)
returns text language sql immutable as $$
  select btrim(regexp_replace(lower(public.unaccent_simples(coalesce(t, ''))), '[^a-z0-9]+', ' ', 'g'))
$$;

create table if not exists public.municipios_ba (
  nome  text primary key,
  chave text not null unique
);

alter table public.municipios_ba enable row level security;
drop policy if exists "municipios_leitura" on public.municipios_ba;
create policy "municipios_leitura" on public.municipios_ba
  for select to authenticated, anon using (true);

insert into public.municipios_ba (nome, chave)
select n, public.chave_municipio(n) from unnest(array[
  'Abaíra', 'Abaré', 'Acajutiba', 'Adustina', 'Água Fria',
  'Aiquara', 'Alagoinhas', 'Alcobaça', 'Almadina', 'Amargosa',
  'Amélia Rodrigues', 'América Dourada', 'Anagé', 'Andaraí', 'Andorinha',
  'Angical', 'Anguera', 'Antas', 'Antônio Cardoso', 'Antônio Gonçalves',
  'Aporá', 'Apuarema', 'Araçás', 'Aracatu', 'Araci',
  'Aramari', 'Arataca', 'Aratuípe', 'Aurelino Leal', 'Baianópolis',
  'Baixa Grande', 'Banzaê', 'Barra', 'Barra da Estiva', 'Barra do Choça',
  'Barra do Mendes', 'Barra do Rocha', 'Barreiras', 'Barro Alto', 'Barro Preto',
  'Barrocas', 'Belmonte', 'Belo Campo', 'Biritinga', 'Boa Nova',
  'Boa Vista do Tupim', 'Bom Jesus da Lapa', 'Bom Jesus da Serra', 'Boninal', 'Bonito',
  'Boquira', 'Botuporã', 'Brejões', 'Brejolândia', 'Brotas de Macaúbas',
  'Brumado', 'Buerarema', 'Buritirama', 'Caatiba', 'Cabaceiras do Paraguaçu',
  'Cachoeira', 'Caculé', 'Caém', 'Caetanos', 'Caetité',
  'Cafarnaum', 'Cairu', 'Caldeirão Grande', 'Camacan', 'Camaçari',
  'Camamu', 'Campo Alegre de Lourdes', 'Campo Formoso', 'Canápolis', 'Canarana',
  'Canavieiras', 'Candeal', 'Candeias', 'Candiba', 'Cândido Sales',
  'Cansanção', 'Canudos', 'Capela do Alto Alegre', 'Capim Grosso', 'Caraíbas',
  'Caravelas', 'Cardeal da Silva', 'Carinhanha', 'Casa Nova', 'Castro Alves',
  'Catolândia', 'Catu', 'Caturama', 'Central', 'Chorrochó',
  'Cícero Dantas', 'Cipó', 'Coaraci', 'Cocos', 'Conceição da Feira',
  'Conceição do Almeida', 'Conceição do Coité', 'Conceição do Jacuípe', 'Conde', 'Condeúba',
  'Contendas do Sincorá', 'Coração de Maria', 'Cordeiros', 'Coribe', 'Coronel João Sá',
  'Correntina', 'Cotegipe', 'Cravolândia', 'Crisópolis', 'Cristópolis',
  'Cruz das Almas', 'Curaçá', 'Dário Meira', 'Dias d''Ávila', 'Dom Basílio',
  'Dom Macedo Costa', 'Elísio Medrado', 'Encruzilhada', 'Entre Rios', 'Érico Cardoso',
  'Esplanada', 'Euclides da Cunha', 'Eunápolis', 'Fátima', 'Feira da Mata',
  'Feira de Santana', 'Filadélfia', 'Firmino Alves', 'Floresta Azul', 'Formosa do Rio Preto',
  'Gandu', 'Gavião', 'Gentio do Ouro', 'Glória', 'Gongogi',
  'Governador Mangabeira', 'Guajeru', 'Guanambi', 'Guaratinga', 'Heliópolis',
  'Iaçu', 'Ibiassucê', 'Ibicaraí', 'Ibicoara', 'Ibicuí',
  'Ibipeba', 'Ibipitanga', 'Ibiquera', 'Ibirapitanga', 'Ibirapuã',
  'Ibirataia', 'Ibitiara', 'Ibititá', 'Ibotirama', 'Ichu',
  'Igaporã', 'Igrapiúna', 'Iguaí', 'Ilhéus', 'Inhambupe',
  'Ipecaetá', 'Ipiaú', 'Ipirá', 'Ipupiara', 'Irajuba',
  'Iramaia', 'Iraquara', 'Irará', 'Irecê', 'Itabela',
  'Itaberaba', 'Itabuna', 'Itacaré', 'Itaeté', 'Itagi',
  'Itagibá', 'Itagimirim', 'Itaguaçu da Bahia', 'Itaju do Colônia', 'Itajuípe',
  'Itamaraju', 'Itamari', 'Itambé', 'Itanagra', 'Itanhém',
  'Itaparica', 'Itapé', 'Itapebi', 'Itapetinga', 'Itapicuru',
  'Itapitanga', 'Itaquara', 'Itarantim', 'Itatim', 'Itiruçu',
  'Itiúba', 'Itororó', 'Ituaçu', 'Ituberá', 'Iuiu',
  'Jaborandi', 'Jacaraci', 'Jacobina', 'Jaguaquara', 'Jaguarari',
  'Jaguaripe', 'Jandaíra', 'Jequié', 'Jeremoabo', 'Jiquiriçá',
  'Jitaúna', 'João Dourado', 'Juazeiro', 'Jucuruçu', 'Jussara',
  'Jussari', 'Jussiape', 'Lafaiete Coutinho', 'Lagoa Real', 'Laje',
  'Lajedão', 'Lajedinho', 'Lajedo do Tabocal', 'Lamarão', 'Lapão',
  'Lauro de Freitas', 'Lençóis', 'Licínio de Almeida', 'Livramento de Nossa Senhora', 'Luís Eduardo Magalhães',
  'Macajuba', 'Macarani', 'Macaúbas', 'Macururé', 'Madre de Deus',
  'Maetinga', 'Maiquinique', 'Mairi', 'Malhada', 'Malhada de Pedras',
  'Manoel Vitorino', 'Mansidão', 'Maracás', 'Maragogipe', 'Maraú',
  'Marcionílio Souza', 'Mascote', 'Mata de São João', 'Matina', 'Medeiros Neto',
  'Miguel Calmon', 'Milagres', 'Mirangaba', 'Mirante', 'Monte Santo',
  'Morpará', 'Morro do Chapéu', 'Mortugaba', 'Mucugê', 'Mucuri',
  'Mulungu do Morro', 'Mundo Novo', 'Muniz Ferreira', 'Muquém do São Francisco', 'Muritiba',
  'Mutuípe', 'Nazaré', 'Nilo Peçanha', 'Nordestina', 'Nova Canaã',
  'Nova Fátima', 'Nova Ibiá', 'Nova Itarana', 'Nova Redenção', 'Nova Soure',
  'Nova Viçosa', 'Novo Horizonte', 'Novo Triunfo', 'Olindina', 'Oliveira dos Brejinhos',
  'Ouriçangas', 'Ourolândia', 'Palmas de Monte Alto', 'Palmeiras', 'Paramirim',
  'Paratinga', 'Paripiranga', 'Pau Brasil', 'Paulo Afonso', 'Pé de Serra',
  'Pedrão', 'Pedro Alexandre', 'Piatã', 'Pilão Arcado', 'Pindaí',
  'Pindobaçu', 'Pintadas', 'Piraí do Norte', 'Piripá', 'Piritiba',
  'Planaltino', 'Planalto', 'Poções', 'Pojuca', 'Ponto Novo',
  'Porto Seguro', 'Potiraguá', 'Prado', 'Presidente Dutra', 'Presidente Jânio Quadros',
  'Presidente Tancredo Neves', 'Queimadas', 'Quijingue', 'Quixabeira', 'Rafael Jambeiro',
  'Remanso', 'Retirolândia', 'Riachão das Neves', 'Riachão do Jacuípe', 'Riacho de Santana',
  'Ribeira do Amparo', 'Ribeira do Pombal', 'Ribeirão do Largo', 'Rio de Contas', 'Rio do Antônio',
  'Rio do Pires', 'Rio Real', 'Rodelas', 'Ruy Barbosa', 'Salinas da Margarida',
  'Salvador', 'Santa Bárbara', 'Santa Brígida', 'Santa Cruz Cabrália', 'Santa Cruz da Vitória',
  'Santa Inês', 'Santa Luzia', 'Santa Maria da Vitória', 'Santa Rita de Cássia', 'Santa Terezinha',
  'Santaluz', 'Santana', 'Santanópolis', 'Santo Amaro', 'Santo Antônio de Jesus',
  'Santo Estêvão', 'São Desidério', 'São Domingos', 'São Felipe', 'São Félix',
  'São Félix do Coribe', 'São Francisco do Conde', 'São Gabriel', 'São Gonçalo dos Campos', 'São José da Vitória',
  'São José do Jacuípe', 'São Miguel das Matas', 'São Sebastião do Passé', 'Sapeaçu', 'Sátiro Dias',
  'Saubara', 'Saúde', 'Seabra', 'Sebastião Laranjeiras', 'Senhor do Bonfim',
  'Sento Sé', 'Serra do Ramalho', 'Serra Dourada', 'Serra Preta', 'Serrinha',
  'Serrolândia', 'Simões Filho', 'Sítio do Mato', 'Sítio do Quinto', 'Sobradinho',
  'Souto Soares', 'Tabocas do Brejo Velho', 'Tanhaçu', 'Tanque Novo', 'Tanquinho',
  'Taperoá', 'Tapiramutá', 'Teixeira de Freitas', 'Teodoro Sampaio', 'Teofilândia',
  'Teolândia', 'Terra Nova', 'Tremedal', 'Tucano', 'Uauá',
  'Ubaíra', 'Ubaitaba', 'Ubatã', 'Uibaí', 'Umburanas',
  'Una', 'Urandi', 'Uruçuca', 'Utinga', 'Valença',
  'Valente', 'Várzea da Roça', 'Várzea do Poço', 'Várzea Nova', 'Varzedo',
  'Vera Cruz', 'Vereda', 'Vitória da Conquista', 'Wagner', 'Wanderley',
  'Wenceslau Guimarães', 'Xique-Xique'
]) as n
on conflict (nome) do nothing;

create index if not exists municipios_ba_chave_idx on public.municipios_ba (chave);

-- Contagem certa: municípios reconhecidos, não grafias distintas.
create or replace function public.resumo_geral()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'liderancas', (select count(*) from public.liderancas where tipo = 'lideranca'),
    'leads',      (select count(*) from public.liderancas where tipo = 'lead'),
    'votos',      (select coalesce(sum(votos_comprometidos), 0) from public.liderancas),
    'municipios', (select count(distinct m.nome) from public.liderancas l
                     join public.municipios_ba m on m.chave = public.chave_municipio(l.municipio)),
    'municipios_total', (select count(*) from public.municipios_ba),
    'grafias_soltas', (select count(distinct btrim(l.municipio)) from public.liderancas l
                        where nullif(btrim(l.municipio), '') is not null
                          and not exists (select 1 from public.municipios_ba m
                                          where m.chave = public.chave_municipio(l.municipio)))
  );
$$;

-- O que não foi reconhecido, para dar para arrumar em vez de só saber que existe.
create or replace function public.municipios_nao_reconhecidos()
returns table (valor text, pessoas bigint)
language sql stable security invoker set search_path = public as $$
  select btrim(l.municipio) as valor, count(*) as pessoas
  from public.liderancas l
  where nullif(btrim(l.municipio), '') is not null
    and not exists (select 1 from public.municipios_ba m
                    where m.chave = public.chave_municipio(l.municipio))
  group by btrim(l.municipio)
  order by count(*) desc;
$$;

grant execute on function public.unaccent_simples(text) to authenticated, anon;
grant execute on function public.chave_municipio(text) to authenticated, anon;
grant execute on function public.resumo_geral() to authenticated, anon;
grant execute on function public.municipios_nao_reconhecidos() to authenticated, anon;
