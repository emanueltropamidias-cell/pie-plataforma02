// Quem recebe a próxima conversa.
//
// A regra vive aqui, separada do banco e da rota, por um motivo prático: é a
// decisão mais política do sistema. Quando alguém reclamar que está recebendo
// mais que as outras, a resposta tem que caber numa leitura — e mudar o
// critério não pode exigir mexer em consulta SQL.
//
// São funções puras: recebem a carga atual e devolvem uma escolha. Não abrem
// conexão, não gravam nada. Assim dá para conferir a distribuição com números
// na mão antes de soltar na operação.

import type { Demanda } from "@/lib/atendimento";

export type Carga = {
  id: string;
  nome: string;
  disponivel: boolean;
  capacidade: number;
  /** Vazio = generalista, atende qualquer demanda. */
  demandas: Demanda[];
  /** Conversas não encerradas. É o que ocupa a cabeça de quem atende. */
  abertas: number;
  /** Das abertas, quantas estão com a bola do nosso lado. É a fila real. */
  esperando: number;
};

export type Escolha = {
  atendenteId: string;
  nome: string;
  /** Qual regra decidiu. Vai para `atribuicoes.regra` e aparece na tela. */
  regra: Regra;
};

export type Regra = "continuidade" | "especialista" | "menor-carga";

export const REGRAS: Record<Regra, string> = {
  continuidade: "Já falou com esta pessoa antes",
  especialista: "Atende esta demanda",
  "menor-carga": "Tinha mais espaço na fila",
};

/** Quem pode receber agora: disponível e abaixo do teto. */
function elegiveis(cargas: Carga[]): Carga[] {
  return cargas.filter((c) => c.disponivel && c.abertas < c.capacidade);
}

/**
 * Quão cheia está a fila de alguém, de 0 a 1.
 *
 * É proporção, e não contagem, porque as capacidades são diferentes: quem
 * atende 40 com 20 abertas está pela metade; quem atende 10 com 20 abertas
 * estourou. Comparar o número cru mandaria conversa para quem já não dá conta.
 */
function ocupacao(c: Carga): number {
  return c.abertas / c.capacidade;
}

/**
 * Escolhe entre os candidatos que já passaram pelo filtro.
 *
 * Desempate em três níveis, e cada um resolve um problema que apareceu no
 * anterior:
 *
 *   1. menor ocupação  — o critério principal
 *   2. menos esperando — duas pessoas com 5 de 20 abertas não estão iguais se
 *                        uma tem 5 conversas aguardando resposta e a outra
 *                        nenhuma. A que está devendo resposta recebe por último.
 *   3. nome            — desempate estável. Sem ele, a ordem que o banco
 *                        devolver decide, e a mesma situação dá resultado
 *                        diferente a cada carga — o que torna a distribuição
 *                        impossível de explicar para quem reclamou.
 */
function melhor(candidatos: Carga[]): Carga | null {
  if (!candidatos.length) return null;
  return [...candidatos].sort(
    (a, b) =>
      ocupacao(a) - ocupacao(b) ||
      a.esperando - b.esperando ||
      a.nome.localeCompare(b.nome, "pt-BR"),
  )[0];
}

/**
 * A quem entregar esta conversa.
 *
 * Ordem das regras, da mais forte para a mais fraca:
 *
 * 1. CONTINUIDADE. Se a pessoa já foi atendida antes por alguém que está
 *    disponível e com espaço, volta para a mesma atendente. Numa campanha a
 *    conversa é uma relação, não um chamado: quem já sabe que a Dona Maria é do
 *    Tomba e que o filho dela procura emprego não faz a pergunta de novo. É a
 *    regra que mais economiza tempo da pessoa do outro lado.
 *
 *    Ela cede quando a atendente saiu ou está cheia — continuidade não vale
 *    deixar alguém esperando.
 *
 * 2. ESPECIALISTA. Se a conversa já tem demanda identificada e existe quem
 *    atenda aquilo, prefere. Generalista continua elegível, mas em segundo
 *    lugar: é melhor ser atendido por alguém do jurídico do que por ninguém.
 *
 * 3. MENOR CARGA. O caso comum, e o único que roda quando ninguém tem histórico
 *    com a pessoa.
 *
 * Devolve null quando não há ninguém disponível. Null é resposta legítima e
 * significa "fica na fila sem dono" — que é exatamente o que o painel já conta
 * como `nao_atendido`. Inventar um destinatário aqui esconderia da coordenação
 * o momento em que a equipe ficou pequena demais.
 */
export function escolherAtendente(
  cargas: Carga[],
  opcoes: { anterior?: string | null; demandas?: Demanda[] } = {},
): Escolha | null {
  const livres = elegiveis(cargas);
  if (!livres.length) return null;

  const anterior = opcoes.anterior
    ? livres.find((c) => c.id === opcoes.anterior)
    : undefined;
  if (anterior) {
    return { atendenteId: anterior.id, nome: anterior.nome, regra: "continuidade" };
  }

  const demandas = opcoes.demandas ?? [];
  if (demandas.length) {
    const especialistas = livres.filter(
      (c) => c.demandas.length > 0 && c.demandas.some((d) => demandas.includes(d)),
    );
    const alvo = melhor(especialistas);
    if (alvo) return { atendenteId: alvo.id, nome: alvo.nome, regra: "especialista" };
  }

  // Generalista primeiro: especialista sem demanda casada é reserva, para não
  // entupir o jurídico com conversa que qualquer uma resolveria.
  const generalistas = livres.filter((c) => c.demandas.length === 0);
  const alvo = melhor(generalistas) ?? melhor(livres);
  return alvo ? { atendenteId: alvo.id, nome: alvo.nome, regra: "menor-carga" } : null;
}

/**
 * Reparte as conversas de quem saiu do ar.
 *
 * Quando uma atendente fica indisponível — fim de turno, ou simplesmente
 * fechou o computador — o que estava com ela precisa voltar para a roda. Sem
 * isso, as conversas ficam com dono ausente e não aparecem em fila nenhuma: não
 * estão sem atendente, então o painel não acusa; e não estão sendo atendidas,
 * então a pessoa espera até desistir. É o pior estado possível, porque é o
 * único invisível.
 *
 * Devolve a lista de para quem vai cada uma. Conversa que não achou destino sai
 * como null e volta para a fila sem dono, que ao menos é visível.
 */
export function redistribuir(
  conversas: { id: number; demandas?: Demanda[] }[],
  cargas: Carga[],
): { id: number; para: Escolha | null }[] {
  // Cópia local da carga: cada entrega aumenta a fila de quem recebeu, e sem
  // atualizar isso a cada passo o lote inteiro cairia na mesma pessoa — a de
  // menor ocupação no início da conta.
  const estado = cargas.map((c) => ({ ...c }));
  return conversas.map((conversa) => {
    const para = escolherAtendente(estado, { demandas: conversa.demandas });
    if (para) {
      const alvo = estado.find((c) => c.id === para.atendenteId);
      if (alvo) {
        alvo.abertas += 1;
        alvo.esperando += 1;
      }
    }
    return { id: conversa.id, para };
  });
}

/**
 * O quanto a distribuição está equilibrada, de 0 a 1.
 *
 * 1 é todo mundo com a mesma proporção de fila; 0 é uma pessoa com tudo. Serve
 * para a coordenação olhar um número em vez de comparar dez barras — e para
 * perceber desequilíbrio que a média esconde.
 *
 * É o complemento do índice de Gini das ocupações. Gini porque a pergunta aqui
 * é de desigualdade, não de dispersão: o que importa não é o quanto as filas
 * variam, e sim se alguém está carregando o time nas costas.
 */
export function equilibrio(cargas: Carga[]): number {
  const ativos = cargas.filter((c) => c.disponivel);
  const n = ativos.length;
  if (n < 2) return 1;

  const v = ativos.map(ocupacao).sort((a, b) => a - b);
  const soma = v.reduce((s, x) => s + x, 0);
  if (soma === 0) return 1; // ninguém com fila: equilibrado por definição

  let acumulado = 0;
  for (let i = 0; i < n; i++) acumulado += (2 * (i + 1) - n - 1) * v[i];
  const gini = acumulado / (n * soma);
  return Math.max(0, Math.min(1, 1 - gini));
}
