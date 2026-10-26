// Distribuição das cadeiras do sistema proporcional (deputado e vereador),
// para o simulador de chapa da aba Quociente: "e se estes partidos tivessem
// concorrido juntos, numa federação?".
//
// Código Eleitoral, art. 106 a 109, como ficou com a Lei 14.211/2021, e a
// decisão do STF de fev/2024 (ADIs 7228, 7263 e 7325) sobre a última fase:
//
//   1. QE = válidos ÷ vagas (fração até meio desprezada, acima arredonda).
//   2. Cada agremiação elege QP = votos ÷ QE (parte inteira) cadeiras, mas só
//      com candidatos que tenham pelo menos 10% do QE em votos nominais.
//   3. Sobras, uma a uma, pela maior média (votos ÷ (cadeiras + 1)), entre as
//      agremiações com pelo menos 80% do QE e que ainda tenham candidato com
//      20% do QE.
//   4. Quando ninguém mais cumpre o passo 3, as cadeiras que faltam vão pela
//      maior média entre TODAS as agremiações. Assim decidiu o STF, e a decisão
//      alcançou 2022: o TSE recontou as sobras (o Amapá trocou deputados) e o
//      resultado oficial publicado já é o recontado. A regra antiga (só quem
//      passou dos 80%) não reproduz o Amapá de 2022 — conferido em 26/10/2026.
//
// Fora daqui: empate (decidido pelo candidato mais velho) e o caso raro de
// nenhuma agremiação alcançar o QE (art. 111). A tela confere a simulação
// contra o resultado oficial antes de mostrar qualquer "e se".

export type AgremiacaoSim = {
  nome: string;
  votos: number;
  /** Votos nominais de cada candidato da agremiação. */
  candidatos: number[];
};

export function quocienteEleitoral(validos: number, vagas: number) {
  if (!vagas) return 0;
  const q = validos / vagas;
  return q - Math.floor(q) > 0.5 ? Math.ceil(q) : Math.floor(q);
}

export function distribuirCadeiras(o: { vagas: number; validos: number; agremiacoes: AgremiacaoSim[] }) {
  const qe = quocienteEleitoral(o.validos, o.vagas);
  const cadeiras = new Map<string, number>(o.agremiacoes.map((a) => [a.nome, 0]));
  if (!qe) return cadeiras;
  const ordenados = new Map(o.agremiacoes.map((a) => [a.nome, [...a.candidatos].sort((x, y) => y - x)]));
  // Quantos candidatos ainda não eleitos têm pelo menos `minimo` votos.
  const elegiveis = (a: AgremiacaoSim, minimo: number) =>
    (ordenados.get(a.nome) ?? []).slice(cadeiras.get(a.nome) ?? 0).filter((v) => v >= minimo).length;

  // 1ª fase: quociente partidário.
  let ocupadas = 0;
  for (const a of o.agremiacoes) {
    const qp = Math.floor(a.votos / qe);
    const n = Math.min(qp, elegiveis(a, qe * 0.1), o.vagas - ocupadas);
    cadeiras.set(a.nome, n);
    ocupadas += n;
  }

  const media = (a: AgremiacaoSim) => a.votos / ((cadeiras.get(a.nome) ?? 0) + 1);
  const maiorMedia = (lista: AgremiacaoSim[]) => lista.reduce<AgremiacaoSim | null>((m, a) => (!m || media(a) > media(m) ? a : m), null);

  // 2ª fase: sobras com 80% / 20%.
  while (ocupadas < o.vagas) {
    const aptas = o.agremiacoes.filter((a) => a.votos >= qe * 0.8 && elegiveis(a, qe * 0.2) > 0);
    const a = maiorMedia(aptas);
    if (!a) break;
    cadeiras.set(a.nome, (cadeiras.get(a.nome) ?? 0) + 1);
    ocupadas++;
  }

  // 3ª fase: o que sobrou, pela maior média.
  while (ocupadas < o.vagas) {
    const base = o.agremiacoes;
    const comCandidato = base.filter((a) => (ordenados.get(a.nome) ?? []).length > (cadeiras.get(a.nome) ?? 0));
    const a = maiorMedia(comCandidato.length ? comCandidato : base);
    if (!a) break;
    cadeiras.set(a.nome, (cadeiras.get(a.nome) ?? 0) + 1);
    ocupadas++;
  }
  return cadeiras;
}
