# A fila de atendimento — o que os números disseram em 14/09/2026

**Levantado e não executado.** Fica para a etapa seguinte ao tráfego, por decisão
do Emanuel. Este arquivo existe para a análise não precisar ser refeita.

## O que motivou

"A conversão do lead está ruim, é um problema com a equipe — eles não estão dando
o gás. As conversas, quando pegamos, são pessoas boas mesmo."

A leitura dele está certa, e os números dizem onde.

## Os sete dias (08/09 a 14/09)

- **6.437** conversas
- **4.906** respondidas — 76%
- **1.531 nunca receberam resposta**

**O furo é atender, não converter.** Quem é atendido vira cadastro em 40% a 69%
dos casos, e isso vale para toda a equipe. A perda acontece antes.

## Não é horário — conferido

A taxa de resposta é plana nas 24 horas: 3h da manhã responde 94%, 19h responde
64%, meio-dia 78%. Não há colapso noturno. A hipótese estrutural mais provável
está descartada, e a conferência importa porque a regra deste projeto é não
tratar como problema de pessoa o que é de sistema.

## Por atendente

| Atendente | Conversas | Respondeu | Média até a 1ª resposta | Sem resposta |
|---|---|---|---|---|
| Patricia Barbosa | 723 | 96% | 6h | 28 |
| boneca | 393 | 98% | 11h | 9 |
| Patricia Sacramento | 575 | 85% | 18h | 87 |
| Maiana | 556 | 85% | 57h | 81 |
| Matheus | 435 | 86% | 34h | 61 |
| Ariane | 545 | 78% | 44h | 118 |
| Lutiane | 427 | 72% | 16h | 118 |
| Deise | 468 | 62% | 22h | 179 |
| thiago | 575 | 60% | 25h | 232 |
| Talita Batista | 551 | 34% | 9h | 364 |

Carga comparável — 400 a 723 conversas. A diferença não se explica por volume.

**Três leituras:**

- **Talita Batista responde por 364 dos 1.531** — um quarto do buraco. E converte
  68% do que atende, o melhor da equipe junto com a boneca. Está escolhendo
  poucas e trabalhando bem essas: não é falta de capacidade, é seleção.
- **Maiana responde 85%, mas a pessoa espera 57 horas.** Ela trabalha; trabalha
  tarde. Lead de tráfego respondido em dois dias e meio já esfriou.
- **Patricia Barbosa fez 723 com 96% em 6 horas.** A carga é atendível, e alguém
  já cumpre o padrão.

## O defeito de sistema no meio disso

**Conversa atribuída e não respondida fica presa.** Ninguém mais pega. As 364 da
Talita Batista não voltaram para a fila — ficaram lá. É isso que transforma falta
de gás individual em perda coletiva, e é a parte que não se resolve cobrando.

## Andamento (15/09)

- **Item 2 feito:** "A equipe agora" na Supervisão (`supervisao_equipe`, migração
  0032), contado no banco, com a coordenadora em mente.
- **Redistribuir manual feito:** por atendente ("tirar as paradas há mais de X h")
  e por conversa, na gaveta de leitura (`supervisao_mover`). Fica registrado em
  `atribuicoes` com motivo `supervisao`.
- **Item 1 (devolver sozinho) e item 3 (teto) continuam pendentes** — são regra de
  operação, e pedem decisão do Emanuel sobre o prazo e o teto.

## O que fazer, na ordem proposta

1. **Devolver para a fila** o que não foi respondido em X horas. Já existe `prazo`
   em `departamentos` e nada age sobre ele. É o conserto que não depende de
   cobrança de ninguém.
2. **Painel de cobrança por atendente, ao vivo** — quantas na mão, quantas sem
   resposta, há quanto tempo está a mais antiga. Hoje esse número só existe indo
   ao banco buscar.
3. **Teto de conversas na mão** — quem acumula N sem responder para de receber, e
   a distribuição vai para quem está vazando.

## Como refazer as contas

As consultas estão no formato dos scripts do repositório e rodam com
`node scripts/rodar-sql.mjs`. As três são: por atendente (conversas, respondidas,
média até `primeira_resp_at`, cadastros), por hora do dia, e por dia. O corte de
tempo usa `coalesce(primeira_msg_at, criado_em)` e o fuso `America/Bahia`, como o
resto das métricas.
