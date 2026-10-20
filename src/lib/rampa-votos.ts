// A rampa de cor do voto, usada igual no mapa de bairros e na lista de locais.
//
// UMA COR SÓ, clareada. A versão anterior caminhava de matiz — creme, salmão,
// rosa, azul — e ficava puxando a atenção para a cor em vez do voto. Agora segue
// o mesmo registro do mapa da Bahia: parte do azul da marca (#0525f7) e clareia
// em direção ao branco conforme o voto cai. Mais votos, azul mais cheio; menos
// votos, azul mais lavado. Fica claro, calmo e dentro da marca, e como é matiz
// único a leitura por intensidade é imediata — e também mais segura para quem
// enxerga cor de forma diferente, porque o que separa as faixas é a claridade,
// não o tom.
//
// "não consta" fica num cinza neutro de propósito: não é azul lavado nenhum, é
// ausência de dado. Assim não se confunde com a faixa mais baixa de voto.
//
// A escala é ABSOLUTA e a mesma nas duas telas: 40 votos pintam da mesma cor num
// bairro e num local de votação. Faixa por quantil daria mais contraste dentro de
// cada tela, mas a cor mudaria de significado entre elas — e aí a comparação que
// o olho faz sozinho estaria errada.

const AZUL = "#0525f7";

/** Mistura uma cor em direção ao branco. t=0 é a cor cheia, t=1 é branco. */
function clarear(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c: number) => Math.round(c + (255 - c) * t);
  return `rgb(${m((n >> 16) & 255)}, ${m((n >> 8) & 255)}, ${m(n & 255)})`;
}

export const SEM_VOTO = "#e9ebef";

export const FAIXAS = [
  { ate: 9, cor: clarear(AZUL, 0.86), rotulo: "1 a 9" },
  { ate: 29, cor: clarear(AZUL, 0.7), rotulo: "10 a 29" },
  { ate: 79, cor: clarear(AZUL, 0.52), rotulo: "30 a 79" },
  { ate: Infinity, cor: clarear(AZUL, 0.34), rotulo: "80+" },
];

export type Faixa = { ate: number; cor: string; rotulo: string };

/** Arredonda para um número "de legenda": 1, 2 ou 5 vezes uma potência de 10. */
function redondo(n: number) {
  const p = 10 ** Math.floor(Math.log10(Math.max(n, 1)));
  return [1, 2, 5, 10].map((m) => m * p).find((v) => v >= n) ?? n;
}

/**
 * As faixas para uma tela cujo maior número é `maior`.
 *
 * A escala absoluta acima foi feita para a Talita, que tem dezenas de votos
 * por bairro. Com a camada municipal aberta para qualquer candidato, o
 * prefeito de Salvador tem milhares por bairro, e tudo cairia em "80+": um
 * mapa de uma cor só. Até 160 a escala continua a absoluta; acima, os cortes
 * acompanham o maior número, e a legenda diz quais são.
 */
export function faixasPara(maior: number): Faixa[] {
  if (maior <= 160) return FAIXAS;
  const [a, b, c] = [0.08, 0.25, 0.5].map((f) => redondo(maior * f));
  const n = (v: number) => v.toLocaleString("pt-BR");
  return [
    { ate: a, cor: FAIXAS[0].cor, rotulo: `até ${n(a)}` },
    { ate: b, cor: FAIXAS[1].cor, rotulo: `${n(a + 1)} a ${n(b)}` },
    { ate: c, cor: FAIXAS[2].cor, rotulo: `${n(b + 1)} a ${n(c)}` },
    { ate: Infinity, cor: FAIXAS[3].cor, rotulo: `${n(c + 1)}+` },
  ];
}

/** A cor de um número de votos. Zero é cinza, e cinza aqui quer dizer zero. */
export function corDoVoto(votos: number, faixas: Faixa[] = FAIXAS) {
  if (votos <= 0) return SEM_VOTO;
  return (faixas.find((f) => votos <= f.ate) ?? faixas[faixas.length - 1]).cor;
}
