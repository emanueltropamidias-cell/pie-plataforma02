# Mapa da dobradinha — o que ficou decidido (01/09/2026)

**Nada disto foi implementado.** Este arquivo existe para a conversa não recomeçar do zero
na outra máquina.

## O que o Emanuel precisa

Um **mapa da Bahia com a votação de 2022 da candidata a deputada estadual** com quem a
campanha vai fazer dobradinha — para enxergar onde ela é forte, onde a Talita é forte, e
onde a dobradinha soma de verdade.

Não é tela de acordo, não é multi-cliente, não é subdomínio por candidato. Isso foi
proposto e recusado — errei o alvo na primeira leitura.

## Decidido

- **Os números entram DIGITADOS NA MÃO**, município a município, pela própria tela do PIE.
  Sem CSV, sem arquivo do TSE, sem depender de mim para carregar dado.
- Precisa, portanto, de tabela no banco (não dá para ser arquivo fixo como o
  `votos-talita.ts`, que só muda com deploy).

## EM ABERTO — perguntar antes de programar

**O que o mapa mostra.** A pergunta foi feita e a resposta não chegou. As opções na mesa:

1. um mapa só, com chave para trocar entre: votos dela · votos da Talita · soma da
   dobradinha · onde uma é forte e a outra não;
2. só o mapa dela, separado;
3. os dois lado a lado.

Sem essa resposta, não escrever a tela.

## O terreno (já conferido)

| Onde | O que é |
|---|---|
| `src/components/estrategia/mapa-votos.tsx` | O mapa dos 417 municípios, pintado por voto. É ele que ganha o segundo candidato. |
| `src/lib/votos-talita.ts` | Votos da Talita em 2022, arquivo fixo. Serve de referência de formato — e é o motivo de os dados dela precisarem de tabela, não de arquivo. |
| `src/lib/eleicao.ts` | `chave()` normaliza a grafia do município. **Usar sempre** — o mapa já somou errado uma vez por uma cidade com duas grafias (commit e7494ea). |
| `municipios_ba` (Supabase) | A lista oficial de municípios. A grafia certa vem daqui, não de votação (commit 84b111c). |
| `src/app/(app)/estrategia/page.tsx` | A aba onde isso mora. |

## Proposta recusada, guardada só como registro

A primeira leitura virou uma proposta de aba de Dobradinhas (acordo por município, parceiro
como entidade, RLS de parceiro):
https://claude.ai/code/artifact/fe694e32-fd77-49bd-9617-7ee9a23b3da4

Dentro dela há **um achado que continua valendo**, independente do mapa: a leitura do QR é
anônima e o destino é o WhatsApp, então hoje é impossível dizer que uma pessoa chegou por
um material específico. O rastro morre entre `/l/[slug]` e o `wa.me`. Se um dia a campanha
quiser atribuir lead a impresso, o conserto é o mesmo gesto do `/c/[code]`: o código viaja
no texto da mensagem.
