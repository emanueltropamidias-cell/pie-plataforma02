import { chave, votosDe, TOTAL_VOTOS } from "@/lib/eleicao";

// A dobradinha: a votação da parceira ao lado da votação da Talita.
//
// Os votos da Talita vêm de `votos-talita.ts`, arquivo fixo — dado do TSE de
// 2022 não muda mais. Os da parceira vêm do banco, porque são DIGITADOS e
// corrigidos à mão. A diferença de origem para aqui e nada mais: daqui para
// baixo os dois são a mesma coisa.

export type CandidatoDobradinha = {
  id: number;
  nome: string;
  cargo: "estadual" | "federal";
  numero: string | null;
  partido: string | null;
  eleicao: number;
  ativo: boolean;
  observacoes: string | null;
};

export type VotoDigitado = { municipio: string; votos: number };

/** O que o mapa pinta. */
export type Modo = "parceira" | "talita" | "soma" | "contraste";

export type LinhaComparada = {
  chave: string;
  municipio: string;
  /** Votos da parceira. `null` = ainda não digitado, que NÃO é zero. */
  dela: number | null;
  talita: number;
  soma: number;
  /**
   * Quanto o município pesa para cada uma, em pontos percentuais da votação
   * total dela — positivo quando pesa mais para a Talita.
   *
   * ── POR QUE PESO, E NÃO DIFERENÇA DE VOTOS ────────────────────────────────
   *
   * Uma estadual e uma federal jogam em escalas diferentes: a estadual costuma
   * ter muito mais voto, e a subtração crua pintaria o estado inteiro da cor
   * dela sem dizer nada. O que decide dobradinha não é quem tem mais voto — é
   * onde CADA UMA concentra o voto que tem.
   *
   * `null` enquanto o município não foi digitado.
   */
  contraste: number | null;
};

/**
 * Cruza as duas votações.
 *
 * `digitados` são só os municípios que já foram preenchidos. Município ausente
 * fica com `dela: null` — e a tela mostra isso como "não digitado", nunca como
 * zero voto. É a mesma distinção que o mapa de bairros teve que aprender: o
 * silêncio da planilha não é ausência de voto.
 */
export function compararVotacoes(
  digitados: VotoDigitado[],
  municipios: string[],
): { linhas: LinhaComparada[]; totalDela: number; digitadosCount: number } {
  const dela = new Map(digitados.map((d) => [chave(d.municipio), d.votos]));
  const totalDela = digitados.reduce((s, d) => s + d.votos, 0);

  const linhas = municipios.map((municipio): LinhaComparada => {
    const k = chave(municipio);
    const v = dela.get(k) ?? null;
    const t = votosDe(municipio);

    // Peso do município na votação de cada uma. Se uma delas ainda não tem
    // total nenhum, não há peso a calcular — e inventar um seria estimar.
    const pesoDela = v !== null && totalDela > 0 ? (v / totalDela) * 100 : null;
    const pesoTalita = TOTAL_VOTOS > 0 ? (t / TOTAL_VOTOS) * 100 : 0;

    return {
      chave: k,
      municipio,
      dela: v,
      talita: t,
      soma: t + (v ?? 0),
      contraste: pesoDela === null ? null : pesoTalita - pesoDela,
    };
  });

  return { linhas, totalDela, digitadosCount: digitados.length };
}

/** O valor que cada modo pinta. `null` = sem dado, e o mapa declara. */
export function valorDoModo(l: LinhaComparada, modo: Modo): number | null {
  if (modo === "talita") return l.talita;
  if (modo === "parceira") return l.dela;
  if (modo === "soma") return l.dela === null ? null : l.soma;
  return l.contraste;
}

/**
 * Quatro faixas calculadas em cima dos dados que existem, não fixas.
 *
 * O mapa da Talita usava corte fixo (49 / 199 / 999) porque a votação dela é
 * conhecida e não muda. A da parceira é digitada e pode ser de outra ordem de
 * grandeza — uma estadual com 40 mil votos deixaria todo o estado na faixa mais
 * escura, e o mapa viraria uma mancha só.
 */
export function faixasDe(valores: number[]): number[] {
  const positivos = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (!positivos.length) return [0, 0, 0];
  const q = (p: number) => positivos[Math.min(positivos.length - 1, Math.floor(positivos.length * p))];
  const cortes = [q(0.5), q(0.8), q(0.95)];
  // Faixa repetida vira legenda com dois rótulos iguais. Quando os dados são
  // poucos ou muito parecidos, é melhor ter menos faixas do que faixas falsas.
  return cortes.filter((c, i) => i === 0 || c > cortes[i - 1]);
}
