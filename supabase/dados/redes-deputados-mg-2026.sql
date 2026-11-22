-- Os 77 deputados estaduais eleitos em MG em 2026 e o Instagram de cada um.
--
-- Gerado em 22/11/2026 cruzando três fontes:
--   TSE (indice/pessoas em .cache/eleicao-arquivos)  quem foi eleito, e quem já era deputado em 2022
--   ALMG  dadosabertos.almg.gov.br/api/v2/deputados   @ declarado pelos 53 em exercício
--   TSE   DivulgaCand (candidatura/buscar/.../sites)  @ que o candidato declarou no registro
--         (a API recusa chamada fora do navegador: foi lida pelo Chrome)
--
-- conferido = true só quando ALMG e TSE dão o MESMO @. Onde divergem, entram os
-- dois — a coleta diz qual existe. Os de "texto livre" o candidato escreveu fora
-- do formato de link ("INSTAGRAM: @FULANO") e foram lidos à mão.
-- Rodar de novo não duplica: atualiza nome, partido e grupo e preserva o resto.

insert into public.redes_perfis (usuario, candidato, ano, uf, nome, partido, grupo, conferido) values
  ('ricardocamposdeputado', '1300025353761', 2026, 'MG', 'Ricardo Campos', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('ludfalcao', '1300025399101', 2026, 'MG', 'Lud Falcão', 'REPUBLICANOS', 'reeleito', true),  -- ALMG+TSE
  ('marliribeiromg', '1300025420621', 2026, 'MG', 'Marli Ribeiro', 'PL', 'reeleito', false),  -- ALMG
  ('aleportelaoficial', '1300025420811', 2026, 'MG', 'Alê Portela', 'PL', 'reeleito', false),  -- ALMG
  ('sargentorodriguesoficial', '1300025421091', 2026, 'MG', 'Sargento Rodrigues', 'PL', 'reeleito', false),  -- ALMG
  ('valadaresgustavo', '1300025499401', 2026, 'MG', 'Gustavo Valadares', 'PSD', 'reeleito', true),  -- ALMG+TSE
  ('gilpereira.mg', '1300025499601', 2026, 'MG', 'Gil Pereira', 'PSD', 'reeleito', true),  -- ALMG+TSE
  ('izalourenca', '1300025394901', 2026, 'MG', 'Iza Lourença', 'PSOL', 'novato', false),  -- TSE
  ('drmauricio', '1300025345691', 2026, 'MG', 'Dr. Maurício', 'NOVO', 'reeleito', true),  -- ALMG+TSE
  ('flaviaborjaoficial', '1300025487161', 2026, 'MG', 'Flávia Borja', 'PODE', 'novato (suplente em 2022)', false),  -- TSE
  ('macaeevaristo', '1300025353291', 2026, 'MG', 'Macaé Evaristo', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('luizinho.minas', '1300025353621', 2026, 'MG', 'Luizinho', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('robertalopesdm', '1300025420961', 2026, 'MG', 'Roberta Lopes', 'PL', 'novato', false),  -- TSE (texto livre)
  ('antoniocarlosarantes', '1300025420601', 2026, 'MG', 'Antonio Carlos Arantes', 'PL', 'reeleito', true),  -- ALMG+TSE
  ('amandateixeiradias', '1300025420801', 2026, 'MG', 'Amanda Teixeira Dias', 'PL', 'suplente em exercício', false),  -- ALMG
  ('eduardoazevedomg', '1300025420821', 2026, 'MG', 'Eduardo Azevedo', 'PL', 'reeleito', true),  -- ALMG+TSE
  ('andersonlima.mg', '1300025420791', 2026, 'MG', 'Anderson Lima', 'PL', 'novato (suplente em 2022)', false),  -- TSE
  ('deputadojoaomagalhaes', '1300025499591', 2026, 'MG', 'João Magalhães', 'PSD', 'reeleito', false),  -- TSE
  ('laisantiago', '1300025400541', 2026, 'MG', 'Dra Laís Santiago', 'PDT', 'novato', false),  -- TSE
  ('drjeanfreire', '1300025353741', 2026, 'MG', 'Dr. Jean Freire', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('marquinhodeputado', '1300025353251', 2026, 'MG', 'Marquinho Lemos', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('anapaulasiqueiraoficial', '1300025353211', 2026, 'MG', 'Ana Paula Siqueira', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('beatriz__cerqueira', '1300025353471', 2026, 'MG', 'Beatriz Cerqueira', 'PT', 'reeleito', false),  -- ALMG (diverge do TSE)
  ('beatriz_cerqueira', '1300025353471', 2026, 'MG', 'Beatriz Cerqueira', 'PT', 'reeleito', false),  -- TSE (diverge da ALMG)
  ('cristianosilveiramg', '1300025353301', 2026, 'MG', 'Cristiano Silveira', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('carloshenrique.mg', '1300025399051', 2026, 'MG', 'Carlos Henrique', 'REPUBLICANOS', 'reeleito', true),  -- ALMG+TSE
  ('deputadoneilando', '1300025398851', 2026, 'MG', 'Neilando Pimenta', 'REPUBLICANOS', 'reeleito', true),  -- ALMG+TSE
  ('vittorio.medioli', '1300025420581', 2026, 'MG', 'Vittorio Medioli', 'PL', 'novato', false),  -- TSE
  ('denerval.germano', '1300025420681', 2026, 'MG', 'Denerval Germano', 'PL', 'novato', false),  -- TSE (texto livre)
  ('enescandido', '1300025499541', 2026, 'MG', 'Enes Candido', 'PSD', 'reeleito', false),  -- ALMG
  ('lucaslasmarmg', '1300025395221', 2026, 'MG', 'Lucas Lasmar', 'REDE', 'reeleito', true),  -- ALMG+TSE
  ('noraldinojr', '1300025436641', 2026, 'MG', 'Noraldino Junior', 'PSB', 'reeleito', true),  -- ALMG+TSE
  ('doorgalandradamg', '1300025427481', 2026, 'MG', 'Doorgal Andrada', 'PP', 'reeleito', true),  -- ALMG+TSE
  ('adriano_aalvarenga', '1300025428121', 2026, 'MG', 'Adriano Alvarenga', 'PP', 'reeleito', true),  -- ALMG+TSE
  ('rodrigocadeirante', '1300025487691', 2026, 'MG', 'Rodrigo Cadeirante', 'PODE', 'novato', false),  -- TSE
  ('tonycarlosuberaba', '1300025399321', 2026, 'MG', 'Tony Carlos', 'PSDB', 'novato (suplente em 2022)', false),  -- TSE
  ('danielsucupira', '1300025353461', 2026, 'MG', 'Daniel Sucupira', 'PT', 'novato', false),  -- TSE
  ('leninhamoc13', '1300025353631', 2026, 'MG', 'Leninha', 'PT', 'reeleito', false),  -- ALMG (diverge do TSE)
  ('timeleninha', '1300025353631', 2026, 'MG', 'Leninha', 'PT', 'reeleito', false),  -- TSE (diverge da ALMG)
  ('cabogregoriocruzazul', '1300025335171', 2026, 'MG', 'Cabo Gregorio Silva', 'DEMOCRATA', 'novato', false),  -- TSE (texto livre)
  ('maurotramontereal', '1300025398841', 2026, 'MG', 'Mauro Tramonte', 'REPUBLICANOS', 'reeleito', true),  -- ALMG+TSE
  ('pabloalmeidadm', '1300025421071', 2026, 'MG', 'Pablo Almeida', 'PL', 'novato', false),  -- TSE
  ('gustavosantanaplmg', '1300025420471', 2026, 'MG', 'Gustavo Santana', 'PL', 'reeleito', true),  -- ALMG+TSE
  ('luizpaulocurvelo', '1300025436501', 2026, 'MG', 'Luiz Paulo', 'PSB', 'novato', false),  -- TSE
  ('deputadozeguilherme', '1300025427531', 2026, 'MG', 'Zé Guilherme', 'PP', 'reeleito', true),  -- ALMG+TSE
  ('fernandobrenocoro', '1300025329411', 2026, 'MG', 'Fernando Breno', 'PRD', 'novato', false),  -- TSE (texto livre)
  ('betaopt', '1300025353271', 2026, 'MG', 'Betão', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('dep_lelecopimentel', '1300025353341', 2026, 'MG', 'Leleco Pimentel', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('coronel_henrique', '1300025420721', 2026, 'MG', 'Coronel Henrique', 'PL', 'reeleito', false),  -- ALMG
  ('brunoenglerdm', '1300025421131', 2026, 'MG', 'Bruno Engler', 'PL', 'reeleito', false),  -- ALMG
  ('delegadasheila', '1300025421101', 2026, 'MG', 'Delegada Sheila', 'PL', 'reeleito', false),  -- ALMG
  ('samuelcairesmg', '1300025420481', 2026, 'MG', 'Samuel Caires', 'PL', 'novato', false),  -- TSE (texto livre)
  ('elismar.prado', '1300025499521', 2026, 'MG', 'Elismar Prado', 'PSD', 'reeleito', false),  -- TSE
  ('joaosantosdosocial', '1300025444031', 2026, 'MG', 'João Do Social', 'AVANTE', 'novato', false),  -- TSE
  ('helenodohospital', '1300025406091', 2026, 'MG', 'Heleno Do Hospital', 'PSDB', 'novato (suplente em 2022)', false),  -- TSE
  ('mariocaixaoficial', '1300025353781', 2026, 'MG', 'Mário Henrique Caixa', 'PV', 'reeleito', true),  -- ALMG+TSE
  ('adrianasouza.13', '1300025353201', 2026, 'MG', 'Adriana Souza', 'PT', 'novato (suplente em 2022)', false),  -- TSE
  ('andreiadejesuus', '1300025353711', 2026, 'MG', 'Andréia De Jesus', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('pedroluizdm', '1300025420931', 2026, 'MG', 'Pedro Luiz', 'PL', 'novato', false),  -- TSE (texto livre)
  ('mariliaamaral999', '1300025420541', 2026, 'MG', 'Marilia Amaral', 'PL', 'novato', false),  -- TSE (texto livre)
  ('marceloheitor.oficial', '1300025420661', 2026, 'MG', 'Marcelo Heitor', 'PL', 'novato (suplente em 2022)', false),  -- TSE (texto livre)
  ('titotorresmg', '1300025499571', 2026, 'MG', 'Tito Torres', 'PSD', 'reeleito', true),  -- ALMG+TSE
  ('gregodafundacao', '1300025428041', 2026, 'MG', 'Grego Da Fundação', 'UNIÃO', 'reeleito', true),  -- ALMG+TSE
  ('deprobertoandrade', '1300025329511', 2026, 'MG', 'Roberto Andrade', 'PRD', 'reeleito', false),  -- ALMG
  ('mariaclaramarramg', '1300025399311', 2026, 'MG', 'Maria Clara', 'PSDB', 'reeleito', true),  -- ALMG+TSE
  ('sos_uberlandia', '1300025353881', 2026, 'MG', 'Fabão', 'PV', 'novato (suplente em 2022)', false),  -- TSE
  ('ulyssesgomes', '1300025353481', 2026, 'MG', 'Ulysses Gomes', 'PT', 'reeleito', true),  -- ALMG+TSE
  ('uglenoalves', '1300025420941', 2026, 'MG', 'Ugleno Alves', 'PL', 'novato', false),  -- TSE (texto livre)
  ('chiarabiondinit', '1300025420711', 2026, 'MG', 'Chiara Biondini', 'PL', 'reeleito', false),  -- ALMG (diverge do TSE)
  ('erosechiarabiondininoroeste', '1300025420711', 2026, 'MG', 'Chiara Biondini', 'PL', 'reeleito', false),  -- TSE (diverge da ALMG)
  ('betinhopintocoelho', '1300025427541', 2026, 'MG', 'Betinho Pinto Coelho', 'UNIÃO', 'reeleito', false),  -- ALMG
  ('nayararochamg', '1300025427821', 2026, 'MG', 'Nayara Rocha', 'PP', 'reeleito', true),  -- ALMG+TSE
  ('raulbelemoficial', '1300025499381', 2026, 'MG', 'Raul Belem', 'PSD', 'reeleito', true),  -- ALMG+TSE
  ('duartebechir', '1300025499491', 2026, 'MG', 'Duarte', 'PSD', 'reeleito', true),  -- ALMG+TSE
  ('chrisdelega', '1300025499481', 2026, 'MG', 'Delegado Christiano Xavier', 'PSD', 'reeleito', true),  -- ALMG+TSE
  ('depcarolcaram', '1300025441271', 2026, 'MG', 'Carol Caram', 'AVANTE', 'suplente em exercício', true),  -- ALMG+TSE
  ('rodrigolopes.mg', '1300025427471', 2026, 'MG', 'Rodrigo Lopes', 'UNIÃO', 'reeleito', true),  -- ALMG+TSE
  ('vitoriojuniormg', '1300025427641', 2026, 'MG', 'Vitório', 'PP', 'reeleito', true),  -- ALMG+TSE
  ('jucabahiaoficial', '1300025332291', 2026, 'MG', 'Juca Bahia', 'PRD', 'novato', false),  -- TSE
  ('joselaviola', '1300025345101', 2026, 'MG', 'Zé Laviola', 'NOVO', 'reeleito', true)  -- ALMG+TSE
on conflict (usuario) do update set
  candidato = excluded.candidato, ano = excluded.ano, uf = excluded.uf, nome = excluded.nome,
  partido = excluded.partido, grupo = excluded.grupo,
  conferido = redes_perfis.conferido or excluded.conferido;

select grupo, count(distinct candidato) as deputados, count(*) as perfis, count(*) filter (where conferido) as conferidos
from public.redes_perfis where ano = 2026 and uf = 'MG' group by grupo order by 2 desc;
