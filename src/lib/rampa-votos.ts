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

/** A cor de um número de votos. Zero é cinza, e cinza aqui quer dizer zero. */
export function corDoVoto(votos: number) {
  if (votos <= 0) return SEM_VOTO;
  return (FAIXAS.find((f) => votos <= f.ate) ?? FAIXAS[FAIXAS.length - 1]).cor;
}
