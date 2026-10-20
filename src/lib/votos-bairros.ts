// Votos da Talita por bairro (2022).
//
// Recebido da apuração da campanha e conferido contra o total por município: a
// soma dos 146 bairros de Salvador dá 5720, exatamente o que
// VOTOS_TALITA["Salvador"] já registrava. Bate voto a voto, então voto nenhum
// sumiu e nenhum foi contado duas vezes.
//
// O QUE ESSA CONFERÊNCIA NÃO PROVA: que a cidade toda está aqui. Salvador tem
// 163 bairros na malha oficial e esta lista cita 146 nomes — 48 polígonos não
// aparecem em linha nenhuma. E não dá para ler isso como zero: Caminho das
// Árvores não consta e faz divisa com cinco bairros de média 185 votos, entre
// eles a Pituba, que é o maior desta lista. Candeal não consta, cercado por
// média 153. Amaralina não consta, cercada por média 132.
//
// A leitura que sobra: a fonte usa um vocabulário de bairro mais grosso que a
// malha — o mesmo que produz "CAJAZEIRAS" sem número e "CASTELO BRANCO (1A
// ETAPA)" — e o voto de quem não está no vocabulário cai no vizinho que está.
// Isso mantém o total certo e erra a atribuição, inflando quem consta.
//
// Fecha de vez quando vier a apuração com o local de votação por bairro.
//
// Estrutura por município para as próximas cidades entrarem ao lado, sem mexer
// em quem já está aqui. Nome do bairro em caixa alta, como veio da apuração —
// a normalização para comparar acontece na leitura, não no dado guardado.

// ── OS BAIRROS VÊM DO BANCO DE CADA INSTALAÇÃO ─────────────────────────────
//
// Estavam escritos aqui, com os 146 bairros da Talita. Como as duas instalações
// compartilham o repositório, a tela de estratégia do Manassés mostrava os
// bairros DELA.
//
// Agora saem de `votos_bairro`, congelados por candidato em
// `src/dados/<candidato>/bairros-2022.json` — mesmo caminho dos votos por
// município, e pelo mesmo motivo: o mapa é componente de navegador e lê na hora
// de desenhar.
//
// A CONFERÊNCIA que valida este dado: a soma dos bairros bate com o total do
// município, voto a voto. Talita 146 -> 5.720; Manassés 145 -> 5.314. O
// gerador recusa gravar se não fechar.
import bairrosTalita from "@/dados/talita/bairros-2022.json";
import bairrosManasses from "@/dados/manasses/bairros-2022.json";

const BAIRROS_POR_CANDIDATO: Record<string, Record<string, Record<string, number>>> = {
  talita: bairrosTalita,
  manasses: bairrosManasses,
};

const QUAL_BAIRRO = process.env.NEXT_PUBLIC_CANDIDATO_DADOS?.trim() || "talita";

export const VOTOS_BAIRRO: Record<string, Record<string, number>> =
  BAIRROS_POR_CANDIDATO[QUAL_BAIRRO] ?? bairrosTalita;


/** Total de votos de um município somando os bairros conhecidos. */
export function totalPorBairros(municipio: string) {
  return Object.values(VOTOS_BAIRRO[municipio] ?? {}).reduce((s, v) => s + v, 0);
}
