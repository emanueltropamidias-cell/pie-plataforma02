// Placar das lideranças: quantas pessoas cada uma indicou.
//
// Já se chamou "trouxe pelo QR". O número vem de `tipo = 'contato'` com
// `parent_id` — 1.716 fichas de campo. Ninguém aqui chegou por QR: a tabela
// `link_leituras` tem cinco leituras, nenhuma delas atribuída a liderança.
//
// Uma métrica só, sem fórmula: um contato é sempre filho direto da liderança
// cujo código foi usado, então basta contar. O que enriquece o placar é o
// movimento recente — quem cresceu nesta semana —, não peso por tipo.

// O placar só precisa de dois recortes, não da tabela inteira:
// quem são as lideranças, e a que liderança cada contato pertence.
export type LiderancaNo = { id: string; nome: string; municipio: string | null };
export type ContatoNo = { parent_id: string | null; created_at?: string | null };

export type Entrada = {
  id: string;
  nome: string;
  municipio: string | null;
  posicao: number;
  pessoas: number;
  novosSemana: number;
  /** 0–100: tamanho relativo ao 1º colocado, para a barra da lista */
  proporcao: number;
};

const DIA = 86_400_000;

export function montarRanking(
  liderancas: LiderancaNo[],
  contatos: ContatoNo[],
  agora: number = Date.now(),
): Entrada[] {
  const corte = agora - 7 * DIA;
  const total = new Map<string, number>();
  const semana = new Map<string, number>();

  for (const n of contatos) {
    if (!n.parent_id) continue;
    total.set(n.parent_id, (total.get(n.parent_id) ?? 0) + 1);
    const nasceu = n.created_at ? Date.parse(n.created_at) : NaN;
    if (!Number.isNaN(nasceu) && nasceu >= corte) {
      semana.set(n.parent_id, (semana.get(n.parent_id) ?? 0) + 1);
    }
  }

  const ordenadas = liderancas
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      municipio: l.municipio,
      pessoas: total.get(l.id) ?? 0,
      novosSemana: semana.get(l.id) ?? 0,
    }))
    // Empate desempata por movimento recente: quem está trabalhando fica à frente.
    .sort((a, b) => b.pessoas - a.pessoas || b.novosSemana - a.novosSemana || a.nome.localeCompare(b.nome));

  const lider = ordenadas[0]?.pessoas ?? 0;

  return ordenadas.map((e, i) => ({
    ...e,
    posicao: i + 1,
    proporcao: lider > 0 ? Math.round((e.pessoas / lider) * 100) : 0,
  }));
}

/**
 * Ordena e numera o placar que o banco já contou.
 *
 * `montarRanking` continua existindo para quem tem as LINHAS na mão. Esta
 * recebe a contagem pronta de `placar_liderancas` — a regra de ordenação e a
 * proporção da barra ficam aqui, num lugar só, para as duas entradas darem o
 * mesmo resultado.
 */
export function ordenarPlacar(
  linhas: {
    id: string;
    nome: string;
    municipio: string | null;
    pessoas: number;
    semana: number;
  }[],
): Entrada[] {
  const ordenadas = linhas
    .map((l) => ({
      id: l.id,
      nome: l.nome,
      municipio: l.municipio,
      pessoas: l.pessoas,
      novosSemana: l.semana,
    }))
    // Empate desempata por movimento recente: quem está trabalhando fica à
    // frente. Mesma regra de `montarRanking`.
    .sort(
      (a, b) =>
        b.pessoas - a.pessoas ||
        b.novosSemana - a.novosSemana ||
        a.nome.localeCompare(b.nome),
    );

  const lider = ordenadas[0]?.pessoas ?? 0;

  return ordenadas.map((e, i) => ({
    ...e,
    posicao: i + 1,
    proporcao: lider > 0 ? Math.round((e.pessoas / lider) * 100) : 0,
  }));
}
