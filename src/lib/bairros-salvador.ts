import { bairrosDe, chave } from "./eleicao";

// O desenho dos bairros de Salvador.
//
// Aqui o mapa deixa de ser bolha e vira fronteira de verdade: 163 polígonos com
// o contorno de cada bairro, servidos do próprio domínio como a malha da Bahia.
//
// O nome que veio na apuração nem sempre é o nome do bairro no desenho. São
// três desencontros diferentes, e cada um tem tratamento próprio:
//
//  1. Grafia — "CAIXA DÁGUA" e "Caixa D´Água" são o mesmo lugar com apóstrofo
//     diferente. Resolve na normalização.
//  2. Recorte — a apuração separa "MUSSURUNGA I" de "MUSSURUNGA II", ou conta
//     Castelo Branco em três etapas, onde o desenho tem um bairro só. Resolve
//     somando no polígono que os contém, e a soma é declarada na tela.
//  3. Ausência — "CAJAZEIRAS" sem número, "CAMPO GRANDE", "ITAPAGIPE": lugares
//     que a apuração nomeia e a malha oficial não reconhece como bairro. Esses
//     NÃO entram no desenho. Escolher um polígono vizinho para eles seria pintar
//     voto onde ele não foi dado, que é exatamente o erro que este mapa existe
//     para não cometer. Ficam de fora, com nome e número à vista.
//
// E o desencontro na outra direção, que é o mais grave dos quatro:
//
//  4. A APURAÇÃO NÃO COBRE A CIDADE TODA. São 146 nomes para 163 bairros, e 48
//     do desenho não aparecem em linha nenhuma. Por muito tempo esta plataforma
//     leu isso como "zero voto". Não é o que o dado sustenta, e dá para mostrar
//     por que: Caminho das Árvores não consta, e faz divisa com cinco bairros
//     cuja média é 185 votos, entre eles a Pituba, que é o maior de Salvador.
//     Candeal não consta, cercado por média 153. Amaralina não consta, cercada
//     por média 132. Zero exatamente ali, no corredor onde ela é mais forte, não
//     se sustenta.
//
//     A soma dos 146 fecha com o total do município, então voto nenhum sumiu — o
//     que não fecha é a ATRIBUIÇÃO. O mais provável é que a fonte trabalhe com um
//     vocabulário de bairro mais grosso que a malha, e que o voto de quem não
//     está no vocabulário caia no vizinho que está. Isso infla quem consta e zera
//     quem não consta.
//
//     Enquanto não vier a apuração com o nome do local de votação por bairro, o
//     mapa para de dizer "zero" e passa a dizer "não consta", que é o que se
//     sabe. A conta de vizinhança fica no código para a tela poder ordenar por
//     suspeita e mostrar os piores casos primeiro.

export type ParteBairro = { nome: string; cx: number; cy: number; area: number; partes: string[] };
export type MalhaSalvador = { w: number; h: number; bairros: ParteBairro[] };

const URL_MALHA = "/salvador-bairros.json";

/**
 * De nome da apuração para nome do polígono.
 *
 * Só entra aqui o que é o mesmo lugar com outro nome, ou lugar contido dentro
 * do polígono. Vizinhança não basta.
 */
const APELIDOS: Record<string, string> = {
  // Mesmo lugar, outro nome
  "TANCREDO NEVES": "Beiru/Tancredo Neves",
  "VILA RUI BARBOSA": "Vila Ruy Barbosa/Jardim Cruzeiro",
  ARMAÇÃO: "Jardim Armação",
  "SUSSUARANA NOVA": "Nova Sussuarana",
  PELOURINHO: "Centro Histórico",
  "SÃO TOMÉ DE PARIPE": "São Tomé",
  "SÃO GONÇALO DO RETIRO": "São Gonçalo",
  "CAPELINHA DE SÃO CAETANO": "Capelinha",
  "BOM JESUS DOS PASSOS": "Ilha de Bom Jesus dos Passos",
  "JARDIM CAJAZEIRA": "Jardim Cajazeiras",
  CAMPINAS: "Campinas de Pirajá",
  // Nova Brasília do desenho fica no leste, colada em Mussurunga — é a de
  // Itapuã. A de Valéria cai dentro do polígono de Valéria.
  "NOVA BRASÍLIA DE ITAPUÃ": "Nova Brasília",
  "NOVA BRASÍLIA DE VALÉRIA": "Valéria",

  // Recorte mais fino que o desenho: soma no bairro que contém
  "MUSSURUNGA I": "Mussurunga",
  "MUSSURUNGA II": "Mussurunga",
  "CASTELO BRANCO (1A ETAPA)": "Castelo Branco",
  "CASTELO BRANCO (2A ETAPA)": "Castelo Branco",
  "CASTELO BRANCO (3A ETAPA)": "Castelo Branco",
  "CAMPINAS DE BROTAS": "Brotas",
  "BOA VISTA DO LOBATO": "Lobato",
  "ALTO DE COUTOS": "Coutos",
  "MIRANTES DE PERIPERI": "Periperi",
  "PARQUE SÃO CRISTÓVÃO": "São Cristóvão",
};

/**
 * Normalização mais dura que a `chave` geral: come também o espaço.
 *
 * "CAIXA DÁGUA" vira "caixa dagua" e "Caixa D´Água" vira "caixa d agua" — a
 * chave comum os separa por causa do apóstrofo virar espaço. Aqui os dois viram
 * "caixadagua" e se encontram.
 */
function chaveBairro(s: string) {
  return chave(s).replace(/\s+/g, "");
}

export type BairroPintado = {
  nome: string;
  nomeApuracao: string[];
  votos: number;
  cx: number;
  cy: number;
  area: number;
  partes: string[];
};

/** Bairro do desenho que não aparece em nenhuma linha da apuração. */
export type BairroAusente = ParteBairro & {
  /** Média de votos dos bairros que encostam nele. */
  vizinhanca: number;
  /** O vizinho mais votado. */
  maiorVizinho: number;
};

export type MapaBairros = {
  pintados: BairroPintado[];
  /** Bairros do desenho que a apuração não cita, do mais cercado de voto ao menos. */
  naoConsta: BairroAusente[];
  /** Nomes da apuração que o desenho não tem — ficam fora do mapa, à mostra. */
  foraDoMapa: { nome: string; votos: number }[];
  votosNoMapa: number;
  votosFora: number;
  maior: number;
};

/**
 * Quem encosta em quem, pelo vértice compartilhado.
 *
 * Dois bairros vizinhos dividem os pontos da fronteira, porque o traçado veio de
 * uma malha só. Então basta agrupar os polígonos por ponto: quem cai no mesmo
 * ponto faz divisa.
 */
function vizinhos(malha: MalhaSalvador) {
  const porPonto = new Map<string, string[]>();
  for (const b of malha.bairros) {
    for (const parte of b.partes) {
      for (const pt of parte.split(" ")) {
        const lista = porPonto.get(pt);
        if (lista) lista.push(b.nome);
        else porPonto.set(pt, [b.nome]);
      }
    }
  }
  const mapa = new Map<string, Set<string>>();
  for (const lista of porPonto.values()) {
    if (lista.length < 2) continue;
    for (const a of lista) {
      let s = mapa.get(a);
      if (!s) mapa.set(a, (s = new Set()));
      for (const c of lista) if (c !== a) s.add(c);
    }
  }
  return mapa;
}

/** Junta a apuração com o desenho e devolve o que casou e o que sobrou. */
export function cruzarBairros(malha: MalhaSalvador): MapaBairros {
  const porChave = new Map(malha.bairros.map((b) => [chaveBairro(b.nome), b]));
  const acumulado = new Map<string, { poly: ParteBairro; votos: number; nomes: string[] }>();
  const foraDoMapa: { nome: string; votos: number }[] = [];

  for (const { nome, votos } of bairrosDe("Salvador")) {
    const alvo = APELIDOS[nome] ?? nome;
    const poly = porChave.get(chaveBairro(alvo));
    if (!poly) {
      foraDoMapa.push({ nome, votos });
      continue;
    }
    const item = acumulado.get(poly.nome) ?? { poly, votos: 0, nomes: [] };
    item.votos += votos;
    item.nomes.push(nome);
    acumulado.set(poly.nome, item);
  }

  const pintados = [...acumulado.values()]
    .map(({ poly, votos, nomes }) => ({ ...poly, votos, nomeApuracao: nomes }))
    .sort((a, b) => b.votos - a.votos);

  const votosPorPoly = new Map(pintados.map((p) => [p.nome, p.votos]));
  const divisa = vizinhos(malha);

  // Bairro que a apuração não cita mas que está cercado de voto é o sinal de que
  // a lista de 146 nomes não é o retrato completo da cidade. Guarda a média da
  // vizinhança para a tela poder ordenar por suspeita.
  const naoConsta: BairroAusente[] = malha.bairros
    .filter((b) => !votosPorPoly.has(b.nome))
    .map((b) => {
      const perto = [...(divisa.get(b.nome) ?? [])].map((v) => votosPorPoly.get(v) ?? 0);
      return {
        ...b,
        vizinhanca: perto.length ? perto.reduce((s, v) => s + v, 0) / perto.length : 0,
        maiorVizinho: perto.length ? Math.max(...perto) : 0,
      };
    })
    .sort((a, b) => b.vizinhanca - a.vizinhanca);

  return {
    pintados,
    naoConsta,
    foraDoMapa: foraDoMapa.sort((a, b) => b.votos - a.votos),
    votosNoMapa: pintados.reduce((s, p) => s + p.votos, 0),
    votosFora: foraDoMapa.reduce((s, p) => s + p.votos, 0),
    maior: pintados[0]?.votos ?? 0,
  };
}

let cache: Promise<MalhaSalvador> | null = null;

/** Carrega a malha uma vez por sessão. */
export function carregarMalhaSalvador(): Promise<MalhaSalvador> {
  if (!cache) {
    cache = fetch(URL_MALHA).then((r) => {
      if (!r.ok) throw new Error(`malha de Salvador: HTTP ${r.status}`);
      return r.json() as Promise<MalhaSalvador>;
    });
  }
  return cache;
}
