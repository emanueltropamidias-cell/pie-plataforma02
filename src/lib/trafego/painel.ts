import { hojeBahia } from "@/lib/trafego/meta";

// As contas do painel de tráfego: o que a tela mostra, calculado num lugar só.
//
// Os componentes só desenham. A regra de "custo subindo", a projeção do dia e o
// custo por cadastro moram aqui, para que o selo no cartão da conta, a tabela e
// a análise da IA nunca discordem entre si.

export const CONVERSA = "Conversas iniciadas";

/**
 * A meta diária de conversas. 3.000 é a da Talita; outra instalação define a
 * sua em NEXT_PUBLIC_META_CONVERSAS_DIA.
 */
export const META_CONVERSAS_DIA = Number(process.env.NEXT_PUBLIC_META_CONVERSAS_DIA) || 3000;

export type LinhaDia = {
  data: string;
  gasto: number;
  resultados: number;
  tipo_resultado: string | null;
  conta_id?: string | null;
};

export type DiaFunil = { dia: string; chegaram: number; respondidas: number; cadastros: number };
export type Funil = { dias: DiaFunil[]; ritmo: number[] } | null;

export function diaMenos(n: number) {
  return hojeBahia(-n);
}

/** Soma um conjunto de linhas diárias. */
export function somar(linhas: LinhaDia[]) {
  let gasto = 0, gastoConversa = 0, conversas = 0;
  for (const l of linhas) {
    gasto += l.gasto;
    if (l.tipo_resultado === CONVERSA) {
      gastoConversa += l.gasto;
      conversas += l.resultados;
    }
  }
  return {
    gasto,
    conversas,
    gastoConversa,
    // Custo por conversa usa SÓ o gasto de campanha de conversa. Em 11 e 12/09
    // a verba extra foi para engajamento, que não inicia conversa nenhuma — no
    // gasto total, o custo por conversa sairia inventado.
    custoConversa: conversas ? gastoConversa / conversas : null,
  };
}

const entre = (linhas: LinhaDia[], de: string, ate: string) => linhas.filter((l) => l.data >= de && l.data <= ate);

/** Série diária dos últimos `n` dias fechados (sem hoje). */
export function serie(linhas: LinhaDia[], n: number) {
  const out: { dia: string; gasto: number; conversas: number; custo: number | null; gastoConversa: number }[] = [];
  for (let i = n; i >= 1; i--) {
    const dia = diaMenos(i);
    const s = somar(linhas.filter((l) => l.data === dia));
    out.push({ dia, gasto: s.gasto, conversas: s.conversas, custo: s.custoConversa, gastoConversa: s.gastoConversa });
  }
  return out;
}

// ── A LEITURA DE CADA CONTA ─────────────────────────────────────────────────
//
// "Custo subindo" é o sinal de cansaço, e cansaço só se separa de aumento de
// verba olhando o gasto junto: custo dos últimos 3 dias fechados pelo menos 25%
// acima dos 7 anteriores, COM o gasto médio por dia parecido (±30%). Foi o que a
// CA 01 fez entre 05 e 14/09: mesmos ~R$ 1.300 por dia, custo de R$ 2,27 para
// R$ 4,03.
//
// Os mínimos de conversa existem para não pintar selo em conta que teve 12
// conversas num dia e 9 no outro — ali qualquer diferença é ruído.
export type Leitura = "subindo" | "barata" | "cara";

export type ResumoConta = {
  conta_id: string;
  nome: string;
  sete: ReturnType<typeof somar> & { gastoDia: number };
  tres: ReturnType<typeof somar>;
  anteriores: ReturnType<typeof somar>;
  hoje: ReturnType<typeof somar>;
  serie: ReturnType<typeof serie>;
  leituras: Leitura[];
  variacao: number | null; // custo 3 dias vs 7 anteriores
};

export const nomeCurto = (nome: string | null | undefined, id: string) =>
  String(nome ?? id).split("|")[0].replace(/\s+/g, " ").trim();

export function resumirContas(linhas: LinhaDia[], contas: { conta_id: string; conta_nome: string | null }[]): ResumoConta[] {
  const hoje = hojeBahia();
  const res = contas.map((c): ResumoConta => {
    const da = linhas.filter((l) => l.conta_id === c.conta_id);
    const sete = somar(entre(da, diaMenos(7), diaMenos(1)));
    const tres = somar(entre(da, diaMenos(3), diaMenos(1)));
    const anteriores = somar(entre(da, diaMenos(10), diaMenos(4)));
    const leituras: Leitura[] = [];
    let variacao: number | null = null;
    if (tres.custoConversa && anteriores.custoConversa && tres.conversas >= 30 && anteriores.conversas >= 50) {
      variacao = tres.custoConversa / anteriores.custoConversa - 1;
      const gastoDiaTres = tres.gastoConversa / 3;
      const gastoDiaAnt = anteriores.gastoConversa / 7;
      const gastoParecido = gastoDiaAnt > 0 && gastoDiaTres / gastoDiaAnt >= 0.7 && gastoDiaTres / gastoDiaAnt <= 1.3;
      if (variacao >= 0.25 && gastoParecido) leituras.push("subindo");
    }
    return {
      conta_id: c.conta_id,
      nome: nomeCurto(c.conta_nome, c.conta_id),
      sete: { ...sete, gastoDia: sete.gasto / 7 },
      tres,
      anteriores,
      hoje: somar(da.filter((l) => l.data === hoje)),
      serie: serie(da, 14),
      leituras,
      variacao,
    };
  });

  // Mais barata e mais cara: só entre contas com volume de verdade na semana.
  const comVolume = res.filter((r) => r.sete.conversas >= 100 && r.sete.custoConversa != null);
  if (comVolume.length >= 2) {
    const ord = [...comVolume].sort((a, b) => a.sete.custoConversa! - b.sete.custoConversa!);
    ord[0].leituras.unshift("barata");
    ord[ord.length - 1].leituras.push("cara");
  }
  return res.sort((a, b) => b.sete.gasto - a.sete.gasto);
}

// ── A PROJEÇÃO DO DIA ───────────────────────────────────────────────────────
//
// O que já chegou dividido pela fração do dia que COSTUMA ter chegado até agora,
// medida nas chegadas reais dos últimos 14 dias. Antes de 15% do dia ela não é
// mostrada: às 7h da manhã uma projeção multiplica por dez qualquer desvio, e um
// número grande e errado no topo da aba é pior do que nenhum.
export function projetarDia(conversasHoje: number, ritmo: number[] | undefined, agora = new Date()) {
  if (!ritmo?.length) return null;
  const bahia = new Date(agora.getTime() - 3 * 3600_000);
  const h = bahia.getUTCHours();
  const min = bahia.getUTCMinutes();
  const antes = h > 0 ? ritmo[h - 1] ?? 0 : 0;
  const fim = ritmo[h] ?? antes;
  const fracao = antes + (fim - antes) * (min / 60);
  if (fracao < 0.15) return null;
  return { valor: Math.round(conversasHoje / fracao), fracao };
}

/** O funil de um dia: Meta → chegaram → respondidas → cadastros. */
export function funilDoDia(linhas: LinhaDia[], funil: Funil, dia: string) {
  const meta = somar(linhas.filter((l) => l.data === dia));
  const pie = funil?.dias.find((d) => d.dia === dia);
  return {
    dia,
    gasto: meta.gasto,
    conversasMeta: meta.conversas,
    chegaram: pie?.chegaram ?? null,
    respondidas: pie?.respondidas ?? null,
    cadastros: pie?.cadastros ?? null,
    // Custo por cadastro usa o gasto TOTAL do dia: é quanto a campanha pagou,
    // em tudo, por cada pessoa que virou cadastro.
    custoCadastro: pie?.cadastros ? meta.gasto / pie.cadastros : null,
  };
}
