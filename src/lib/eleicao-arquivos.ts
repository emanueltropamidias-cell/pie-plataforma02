import UFS from "./ufs.json";

// Leitura da votação do TSE do Brasil inteiro, em arquivos prontos no Storage.
//
// ── POR QUE NÃO É O BANCO ───────────────────────────────────────────────────
//
// Só a Bahia ocupava ~330 MB do Postgres, num plano gratuito de 500 MB; o país
// seria 4 a 6 GB. Os mesmos votos, como arquivo pronto por candidato, dão uma
// fração disso e cabem no Storage gratuito. Quem gera e sobe:
// scripts/gerar-eleicao-arquivos.mjs e scripts/subir-eleicao-arquivos.mjs.
//
// ── O CÓDIGO DO CANDIDATO ───────────────────────────────────────────────────
//
// A tela identifica o candidato por um número só (`id`). Aqui ele carrega o
// ano e o estado, para a API achar o arquivo sem tabela de consulta:
//
//   id = (E * 100 + estado) * 10^13 + SQ_CANDIDATO * 10 + turno
//
// E = (ano - 2020) / 2 (2022 → 1, 2024 → 2, 2026 → 3), estado = 0 para BR e
// 1..27 na ordem de ufs.json. O sequencial chega a 12 dígitos (Minas, BR), então
// a chave ocupa 13 — a primeira versão reservava 12 e o código de Minas passava
// por cima do estado. O maior id até 2030 fica em ~5,3 × 10^15, abaixo do
// inteiro exato do JavaScript (9 × 10^15).

const BASE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public`;
const UF_IDX = ["BR", ...UFS.map((u) => u.uf)];
export const ANOS_ELEICAO = [2022, 2024, 2026];
const MUNICIPAIS = new Set(["PREFEITO", "VICE-PREFEITO", "VEREADOR"]);

type LinhaIndice = [
  chave: number,
  turno: number,
  cargo: string,
  numero: number,
  urna: string,
  nome: string,
  partido: string,
  situacao: string,
  ue: string,
  total: number,
  municipios: number,
  /** Unidade eleitoral do TSE: UF, "BR" ou código da cidade (municipal). */
  sgUe?: string,
];

// O id de cada eleição no DivulgaCand (rest/v1/eleicao/ordinarias). É com ele,
// o sequencial e a unidade eleitoral que o TSE serve a foto de urna.
const ID_DIVULGA: Record<number, string> = { 2022: "2040602022", 2024: "2045202024", 2026: "20322002026" };

/**
 * A foto de urna direto do TSE.
 *
 * O servidor do TSE (Akamai) recusa qualquer acesso que não tenha a "digital"
 * de um navegador — curl e a função da Vercel tomam 403, e por isso o proxy
 * antigo nunca funcionou em produção. O navegador de quem abre a tela passa.
 * Medido em 20/10/2026 com a digital do Chrome: 200 e a imagem, em 2022, 2024
 * e 2026, com Referer do nosso domínio. Assim o Brasil inteiro tem foto sem
 * guardar nenhuma — 460 mil só em 2024 não caberiam no Storage gratuito.
 */
function fotoNoTse(ano: number, sq: string, ue: string | undefined) {
  const id = ID_DIVULGA[ano];
  return id && ue ? `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${id}/${sq}/${ue}` : null;
}

export type Manifesto = {
  ano: number;
  gerado_em?: string;
  ufs: Record<string, { candidaturas: number; municipios: number }>;
};

const ESCALA = 1e13;

export function codificarId(ano: number, uf: string, chave: number) {
  return (((ano - 2020) / 2) * 100 + UF_IDX.indexOf(uf)) * ESCALA + chave;
}

export function decodificarId(id: number) {
  const chave = id % ESCALA;
  const resto = Math.floor(id / ESCALA);
  return { ano: 2020 + 2 * Math.floor(resto / 100), uf: UF_IDX[resto % 100], chave };
}

// Índice de um estado chega a ~13 MB (São Paulo, 2024): grande demais para o
// cache de `fetch` do Next (2 MB por item). Fica em memória da função.
const memoria = new Map<string, { em: number; valor: Promise<unknown> }>();
const VALIDADE = 60 * 60 * 1000;

function baixar<T>(caminho: string, validade = VALIDADE): Promise<T | null> {
  const guardado = memoria.get(caminho);
  if (guardado && Date.now() - guardado.em < validade) return guardado.valor as Promise<T | null>;
  const valor = fetch(`${BASE}/${caminho}`, { cache: "no-store" }).then((r) =>
    r.ok ? (r.json() as Promise<T>) : null,
  );
  memoria.set(caminho, { em: Date.now(), valor });
  // Falha não fica guardada: a próxima chamada tenta de novo.
  valor.catch(() => memoria.delete(caminho)).then((v) => v === null && memoria.delete(caminho));
  return valor;
}

// ── VERSÃO NA URL ───────────────────────────────────────────────────────────
//
// A CDN do Storage guarda cada arquivo por até 1 h. Em 20/10/2026 os índices
// foram regerados (com o código da cidade, que a foto de urna precisa) e a
// CDN seguiu entregando a versão antiga: candidatos de 2024 apareceram sem
// foto até a cópia expirar. Agora todo arquivo é pedido com a data de geração
// do manifesto (`?v=`), e o manifesto com uma marca de 5 minutos — dado novo
// chega em no máximo 5 minutos, nunca preso numa cópia velha.
const marcaDe5Min = () => Math.floor(Date.now() / 300_000);

export function lerManifesto(ano: number) {
  return baixar<Manifesto>(`eleicao/${ano}/manifesto.json?m=${marcaDe5Min()}`, 300_000);
}

async function versao(ano: number) {
  const m = await lerManifesto(ano);
  return m?.gerado_em ? encodeURIComponent(m.gerado_em) : "0";
}

async function lerDoAno<T>(ano: number, caminho: string) {
  return baixar<T>(`eleicao/${ano}/${caminho}?v=${await versao(ano)}`);
}

const lerIndice = (ano: number, uf: string) => lerDoAno<LinhaIndice[]>(ano, `indice/${uf}.json`);

/** Quais estados têm foto de urna no Storage, por ano. */
async function ufsComFoto(ano: number): Promise<Set<string>> {
  const chave = `fotos/${ano}`;
  const guardado = memoria.get(chave);
  if (guardado && Date.now() - guardado.em < VALIDADE) return guardado.valor as Promise<Set<string>>;
  const valor = fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/list/urna`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      // Listar o bucket pede a chave de serviço (a pública só baixa). Isto
      // roda só no servidor: a chave nunca chega ao navegador.
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`,
    },
    body: JSON.stringify({ prefix: `${ano}/`, limit: 100 }),
  })
    .then((r) => (r.ok ? (r.json() as Promise<{ name: string }[]>) : []))
    .then((l) => new Set(l.map((o) => o.name)))
    .catch(() => new Set<string>());
  memoria.set(chave, { em: Date.now(), valor });
  return valor;
}

/** O que a tela chama de candidato — o mesmo formato que o banco devolvia. */
// Linhas do índice por chave, para achar a do 2º turno de um candidato sem
// varrer o índice de novo a cada um.
const porChaveDoIndice = new WeakMap<LinhaIndice[], Map<number, LinhaIndice>>();
function linhaPorChave(indice: LinhaIndice[], chave: number) {
  let m = porChaveDoIndice.get(indice);
  if (!m) {
    m = new Map(indice.map((x) => [x[0], x]));
    porChaveDoIndice.set(indice, m);
  }
  return m.get(chave) ?? null;
}

/**
 * O que o candidato fez no 2º turno, para quem disputou um. O selo do 1º turno
 * dizia só "foi ao 2º turno" — o Lula de 2022 aparecia sem o "eleito".
 */
function segundoTurnoDe(ano: number, uf: string, l: LinhaIndice, indice?: LinhaIndice[] | null) {
  if (!indice || l[1] !== 1 || l[7] !== "2º TURNO") return null;
  const x = linhaPorChave(indice, Math.floor(l[0] / 10) * 10 + 2);
  return x ? { id: codificarId(ano, uf, x[0]), situacao: x[7], votos: x[9] } : null;
}

function paraCandidato(ano: number, uf: string, l: LinhaIndice, fotos: Set<string>, indice?: LinhaIndice[] | null) {
  const sq = String(Math.floor(l[0] / 10));
  return {
    id: codificarId(ano, uf, l[0]),
    ano,
    turno: l[1],
    uf,
    nm_ue: l[8],
    cargo: l[2],
    numero: l[3],
    sq_candidato: sq,
    nome_urna: l[4],
    nome_completo: l[5],
    partido_sigla: l[6],
    situacao: l[7],
    // Storage primeiro (Bahia, já guardada); o resto, direto do TSE.
    foto_url: fotos.has(uf) ? `${BASE}/urna/${ano}/${uf}/${sq}.jpg` : fotoNoTse(ano, sq, l[11] ?? uf),
    total_votos: l[9],
    municipios_com_voto: l[10],
    segundo_turno: segundoTurnoDe(ano, uf, l, indice),
  };
}

export type CandidatoArquivo = ReturnType<typeof paraCandidato>;

function normalizar(s: string) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Busca por nome, número, partido ou cidade. Ordena pelo mais votado. */
export async function buscarCandidatos(o: {
  q: string;
  ano: number;
  uf: string;
  cargo?: string | null;
  limite?: number;
}): Promise<CandidatoArquivo[]> {
  const indice = await lerIndice(o.ano, o.uf);
  if (!indice) return [];
  const fotos = await ufsComFoto(o.ano);
  const q = normalizar(o.q);
  const numero = /^\d+$/.test(q) ? parseInt(q, 10) : null;
  const palavras = q.split(" ").filter(Boolean);
  const achados = indice.filter((l) => {
    if (o.cargo && l[2] !== o.cargo) return false;
    if (numero !== null) return l[3] === numero;
    const texto = normalizar(`${l[4]} ${l[5]} ${l[6]} ${l[2]} ${l[8]}`);
    return palavras.every((p) => texto.includes(p));
  });
  return achados
    .sort((a, b) => b[9] - a[9])
    .slice(0, o.limite ?? 40)
    .map((l) => paraCandidato(o.ano, o.uf, l, fotos, indice));
}

/**
 * Os candidatos de um estado numa eleição, do mais votado ao menos, com os
 * cargos e partidos que existem ali (para os filtros saírem do dado, e não de
 * lista escrita à mão).
 */
/** Resultado da candidatura em quatro grupos, para o filtro da lista. */
export type GrupoResultado = "eleito" | "segundo" | "suplente" | "nao";
export function grupoResultado(situacao: string): GrupoResultado | null {
  const s = (situacao || "").toUpperCase();
  if (s.startsWith("ELEITO")) return "eleito";
  if (s === "2º TURNO") return "segundo";
  if (s === "SUPLENTE") return "suplente";
  if (s === "NÃO ELEITO") return "nao";
  return null; // "#NULO": candidatura sem voto válido
}

export async function listarCandidatos(o: {
  ano: number;
  uf: string;
  cargo?: string | null;
  partido?: string | null;
  resultado?: GrupoResultado | null;
  q?: string | null;
  pagina?: number;
  porPagina?: number;
}) {
  // O presidente mora no índice nacional ("BR"), não no do estado: sem isto o
  // cargo nem aparecia na lista de um estado (pedido do Emanuel, 26/10/2026).
  const geral = o.ano % 4 === 2;
  const fonte = o.cargo === "PRESIDENTE" && geral ? "BR" : o.uf;
  const indice = (await lerIndice(o.ano, fonte)) ?? [];
  const fotos = await ufsComFoto(o.ano);
  const primeiroTurno = indice.filter((l) => l[1] === 1);
  const doCargo = primeiroTurno.filter((l) => !o.cargo || l[2] === o.cargo);
  const contar = (ls: LinhaIndice[], i: number) => {
    const m = new Map<string, number>();
    for (const l of ls) m.set(String(l[i]), (m.get(String(l[i])) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1]).map(([valor, n]) => ({ valor, n }));
  };
  const q = o.q ? normalizar(o.q) : "";
  const palavras = q.split(" ").filter(Boolean);
  const doPartido = doCargo.filter((l) => !o.partido || l[6] === o.partido);
  const filtrados = doPartido
    .filter((l) => !o.resultado || grupoResultado(l[7]) === o.resultado)
    .filter((l) => !palavras.length || palavras.every((p) => normalizar(`${l[3]} ${l[4]} ${l[5]} ${l[8]}`).includes(p)))
    .sort((a, b) => b[9] - a[9]);
  const porPagina = o.porPagina ?? 48;
  const pagina = Math.max(0, o.pagina ?? 0);
  // Cargos do estado + presidente (do índice nacional) na eleição geral.
  const doEstado = fonte === o.uf ? primeiroTurno : ((await lerIndice(o.ano, o.uf)) ?? []).filter((l) => l[1] === 1);
  const cargos = contar(doEstado.filter((l) => l[9] > 0), 2);
  if (geral && o.uf !== "BR" && !cargos.some((c) => c.valor === "PRESIDENTE")) {
    const br = ((await lerIndice(o.ano, "BR")) ?? []).filter((l) => l[1] === 1 && l[2] === "PRESIDENTE" && l[9] > 0);
    if (br.length) cargos.push({ valor: "PRESIDENTE", n: br.length });
  }
  const resultados = { eleito: 0, segundo: 0, suplente: 0, nao: 0 };
  for (const l of doPartido) {
    const g = grupoResultado(l[7]);
    if (g) resultados[g]++;
  }
  return {
    total: filtrados.length,
    // Só cargo com voto próprio: vice e suplente não recebem voto (vai para o
    // titular), e escolher um deles dava uma lista inteira de zeros.
    cargos,
    partidos: contar(doCargo, 6),
    resultados,
    candidatos: filtrados
      .slice(pagina * porPagina, (pagina + 1) * porPagina)
      .map((l) => paraCandidato(o.ano, fonte, l, fotos, indice)),
  };
}

/** Um candidato qualquer do estado, entre os que tiveram voto no 1º turno. */
export async function aleatorio(ano: number, uf: string, cargo?: string | null, partido?: string | null) {
  const indice = await lerIndice(ano, uf);
  const pool = (indice ?? []).filter(
    (l) => l[1] === 1 && l[9] > 0 && (!cargo || l[2] === cargo) && (!partido || l[6] === partido),
  );
  if (!pool.length) return null;
  return codificarId(ano, uf, pool[Math.floor(Math.random() * pool.length)][0]);
}

/**
 * O mais votado de uma eleição (1º turno), opcionalmente de um cargo e de um
 * partido. É para onde o painel vai ao trocar de ano, estado, cargo ou partido:
 * antes ia para um candidato sorteado, e quem chegava na tela caía num
 * desconhecido qualquer em vez de ver quem ganhou.
 *
 * Sem cargo, prefere o cargo que decide a eleição ali: governador numa
 * eleição geral, prefeito numa municipal (o mais votado do estado seria
 * sempre o governador ou o prefeito da capital, de qualquer jeito).
 */
export async function destaque(ano: number, uf: string, cargo?: string | null, partido?: string | null) {
  // Presidente pedido de dentro de um estado: o candidato está no índice "BR".
  if (cargo === "PRESIDENTE" && uf !== "BR" && ano % 4 === 2) return destaque(ano, "BR", cargo, partido);
  const indice = await lerIndice(ano, uf);
  if (!indice) return null;
  const preferido = cargo ? null : uf === "BR" ? "PRESIDENTE" : ano % 4 === 0 ? "PREFEITO" : "GOVERNADOR";
  const achar = (c: string | null) => {
    let melhor: LinhaIndice | null = null;
    for (const l of indice)
      if (l[1] === 1 && (!c || l[2] === c) && (!partido || l[6] === partido) && (!melhor || l[9] > melhor[9])) melhor = l;
    return melhor && melhor[9] > 0 ? melhor : null;
  };
  const melhor = (preferido && achar(preferido)) || achar(cargo ?? null);
  return melhor ? codificarId(ano, uf, melhor[0]) : null;
}

type ArquivoCandidato = {
  votos: Record<string, Record<string, number>>;
  zonas: Record<string, Record<string, Record<string, number>>>;
};
type ArquivoCidade = { municipio: string; candidatos: Record<string, { v: number; z: Record<string, number> }> };

/** Votos do candidato: { UF: { município: votos } } e as zonas. */
async function votosDe(ano: number, uf: string, l: LinhaIndice): Promise<ArquivoCandidato | null> {
  if (!MUNICIPAIS.has(l[2])) return lerDoAno<ArquivoCandidato>(ano, `c/${l[0]}.json`);
  // Eleição municipal: o candidato está dentro do arquivo da cidade dele.
  const cidadeDe = await lerDoAno<Record<string, string>>(ano, `cidade-de/${uf}.json`);
  const cod = cidadeDe?.[l[0]];
  if (!cod) return { votos: {}, zonas: {} };
  const cidade = await lerDoAno<ArquivoCidade>(ano, `m/${uf}/${cod}.json`);
  const dele = cidade?.candidatos[l[0]];
  if (!cidade || !dele) return { votos: {}, zonas: {} };
  return { votos: { [uf]: { [cidade.municipio]: dele.v } }, zonas: { [uf]: { [cidade.municipio]: dele.z } } };
}

async function linhaPorId(id: number) {
  const { ano, uf, chave } = decodificarId(id);
  if (!uf) return null;
  const indice = await lerIndice(ano, uf);
  const l = indice ? linhaPorChave(indice, chave) : null;
  return l && indice ? { ano, uf, l, indice } : null;
}

/**
 * O raio-x que o painel desenha. `ufMapa` escolhe o estado do mapa quando o
 * candidato é nacional (presidente): ele tem voto em todos.
 */
export async function raioX(id: number, ufMapa?: string | null) {
  const achado = await linhaPorId(id);
  if (!achado) return null;
  const { ano, uf, l } = achado;
  const arquivo = await votosDe(ano, uf, l);
  const fotos = await ufsComFoto(ano);
  const estado = uf === "BR" ? (ufMapa && ufMapa !== "BR" ? ufMapa : "BA") : uf;
  const porMunicipio = arquivo?.votos[estado] ?? {};
  const votosPorUf = Object.fromEntries(
    Object.entries(arquivo?.votos ?? {}).map(([u, m]) => [u, Object.values(m).reduce((s, v) => s + v, 0)]),
  );
  const top = Object.entries(porMunicipio)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([municipio, votos]) => ({ municipio, votos, codigo_tse: "" }));
  // Eleitores e válidos do cargo em cada município do mapa: é o que deixa o
  // mapa em "% do eleitorado" e o card em "% dos válidos". Sem isso a cor
  // mostrava onde mora mais gente, não onde o candidato é forte.
  const base = await baseDoCargo(ano, estado, l[2], l[1]);
  const unidade = base
    ? MUNICIPAIS.has(l[2])
      ? Object.keys(porMunicipio).map((m) => base[m]).filter(Boolean)
      : Object.values(base)
    : [];
  const somar = (k: keyof BaseMunicipio) => unidade.reduce((s, b) => s + b[k], 0);
  return {
    candidato: paraCandidato(ano, uf, l, fotos, achado.indice),
    votos_por_municipio: porMunicipio,
    votos_por_uf: votosPorUf,
    top_municipios: top,
    base_por_municipio: base,
    // Onde a disputa aconteceu: a cidade (municipal) ou o estado do mapa.
    totais_unidade: base ? { aptos: somar("aptos"), comparecimento: somar("comparecimento"), validos: somar("validos") } : null,
  };
}

/** Zonas do candidato numa cidade, do mesmo arquivo do raio-x. */
export async function zonasNaCidade(id: number, municipio: string) {
  const achado = await linhaPorId(id);
  if (!achado) return [];
  const arquivo = await votosDe(achado.ano, achado.uf, achado.l);
  for (const porMun of Object.values(arquivo?.zonas ?? {})) {
    const z = porMun[municipio];
    if (z)
      return Object.entries(z)
        .map(([zona, votos]) => ({ zona: Number(zona), votos }))
        .sort((a, b) => b.votos - a.votos);
  }
  return [];
}

/** Cobertura no formato que o painel já usa: uma linha por ano e estado. */
export async function cobertura() {
  const manifestos = await Promise.all(ANOS_ELEICAO.map(lerManifesto));
  return manifestos.flatMap((m) =>
    m ? Object.entries(m.ufs).map(([uf, v]) => ({ ano: m.ano, uf, ...v })) : [],
  );
}

/** A candidatura da casa mais recente: mesmo estado e número de urna. */
export async function candidaturaDaCasa(uf: string, numero: number) {
  for (const ano of [...ANOS_ELEICAO].reverse()) {
    const indice = await lerIndice(ano, uf);
    const l = indice?.filter((x) => x[3] === numero).sort((a, b) => b[1] - a[1])[0];
    if (l) return codificarId(ano, uf, l[0]);
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// DADOS ALÉM DO VOTO (22/10/2026)
//
// Gerados por scripts/gerar-eleicao-extras.mjs, no mesmo bucket e com a mesma
// versão do manifesto. Arquivo que ainda não subiu volta `null`, e a tela diz
// "ainda não importado" em vez de mostrar zero.
//
//   <ano>/apuracao/<UF>.json   eleitores aptos (município e zona) e, por cargo
//                              e turno, comparecimento, válidos, brancos, nulos
//   <ano>/quociente/<UF>.json  vagas e votos de cada partido (nominal +
//                              legenda) por unidade e cargo proporcional
//   <ano>/perfil/<UF>.json     eleitorado por gênero, idade e escolaridade
//   <ano>/contas/<UF>.json     receitas e despesas declaradas por candidato
//   <ano>/pessoas/<UF>.json    outras candidaturas da mesma pessoa (título de
//                              eleitor igual), em qualquer ano e estado
//   <ano>/ficha/<UF>.json      gênero, nascimento, instrução, ocupação, chapa
// ════════════════════════════════════════════════════════════════════════════

type Apuracao = {
  aptos: Record<string, number>;
  zonas: Record<string, Record<string, number>>;
  /** "CARGO|turno" → município → [comparecimento, válidos, brancos, nulos] */
  cargos: Record<string, Record<string, [number, number, number, number]>>;
};

export type BaseMunicipio = { aptos: number; comparecimento: number; validos: number };

const lerApuracao = (ano: number, uf: string) => lerDoAno<Apuracao>(ano, `apuracao/${uf}.json`);

/** Eleitores, comparecimento e válidos do cargo em cada município de um estado. */
export async function baseDoCargo(ano: number, uf: string, cargo: string, turno: number) {
  const ap = await lerApuracao(ano, uf);
  if (!ap) return null;
  const doCargo = ap.cargos[`${cargo}|${turno}`] ?? {};
  const porMunicipio: Record<string, BaseMunicipio> = {};
  for (const [m, aptos] of Object.entries(ap.aptos)) {
    const c = doCargo[m];
    porMunicipio[m] = { aptos, comparecimento: c?.[0] ?? 0, validos: c?.[1] ?? 0 };
  }
  return porMunicipio;
}

/** Eleitores aptos por zona numa cidade. */
export async function aptosPorZona(ano: number, uf: string, municipio: string) {
  const ap = await lerApuracao(ano, uf);
  return ap?.zonas[municipio] ?? null;
}

/** A apuração de uma cidade, em todos os cargos (camada municipal). */
export async function apuracaoDaCidade(ano: number, uf: string, municipio: string) {
  const ap = await lerApuracao(ano, uf);
  if (!ap || ap.aptos[municipio] === undefined) return null;
  const cargos = Object.entries(ap.cargos)
    .filter(([, porMun]) => porMun[municipio])
    .map(([k, porMun]) => {
      const [cargo, turno] = k.split("|");
      const [comparecimento, validos, brancos, nulos] = porMun[municipio];
      return { cargo, turno: Number(turno), comparecimento, validos, brancos, nulos };
    });
  return { aptos: ap.aptos[municipio], cargos };
}

// ── PERFIL DO ELEITORADO ────────────────────────────────────────────────────

export const FAIXAS_IDADE = ["16 a 24", "25 a 34", "35 a 44", "45 a 59", "60 a 69", "70 ou mais"];
export const NIVEIS_ESCOLARIDADE = ["Analfabeto", "Lê e escreve", "Fundamental", "Médio", "Superior"];

type PerfilArquivo = Record<string, { t: number; g: Record<string, number>; i: number[]; e: number[] }>;

export async function perfilDoEleitorado(ano: number, uf: string, municipio: string) {
  const p = await lerDoAno<PerfilArquivo>(ano, `perfil/${uf}.json`);
  const m = p?.[municipio];
  if (!m) return null;
  return {
    total: m.t,
    genero: m.g,
    idade: FAIXAS_IDADE.map((rotulo, i) => ({ rotulo, n: m.i[i] ?? 0 })),
    escolaridade: NIVEIS_ESCOLARIDADE.map((rotulo, i) => ({ rotulo, n: m.e[i] ?? 0 })),
  };
}

// ── QUOCIENTE ELEITORAL ─────────────────────────────────────────────────────
//
// Lei 9.504 e Código Eleitoral (art. 106 a 109), como ficaram em 2021:
//
//   QE = válidos ÷ vagas, desprezada a fração até meio e arredondada para
//        cima acima de meio
//   QP = votos da agremiação ÷ QE, desprezada a fração
//   eleito pelo QP precisa de 10% do QE em votos nominais; nas sobras, 20%
//   e a agremiação, 80% do QE
//
// Agremiação é o partido ou a federação (2022 em diante), que conta como um
// partido só. As cadeiras NÃO são simuladas aqui: vêm do resultado oficial
// (situação "ELEITO POR QP" ou "POR MÉDIA" de cada candidato). A distribuição
// das sobras tem três fases e decisão judicial no meio; recalcular daria um
// número parecido com o oficial e às vezes diferente, que é o pior tipo.

type QuocienteArquivo = Record<
  string,
  { ue: string; vagas: number; validos: number; partidos: [sigla: string, federacao: string | null, nominais: number, legenda: number][] }
>;

const ELEITO = /^ELEITO/;

function quocienteEleitoral(validos: number, vagas: number) {
  if (!vagas) return 0;
  const q = validos / vagas;
  return q - Math.floor(q) > 0.5 ? Math.ceil(q) : Math.floor(q);
}

export async function quocienteDe(id: number) {
  const achado = await linhaPorId(id);
  if (!achado) return null;
  const { ano, uf, l } = achado;
  const cargo = l[2];
  const sgUe = l[11] ?? uf;
  const arq = await lerDoAno<QuocienteArquivo>(ano, `quociente/${uf}.json`);
  const ue = arq?.[`${sgUe}|${cargo}`];
  if (!ue) return null;

  const qe = quocienteEleitoral(ue.validos, ue.vagas);
  const agremiacaoDe = new Map<string, string>();
  const ag = new Map<string, { nome: string; partidos: string[]; nominais: number; legenda: number }>();
  for (const [sigla, federacao, nominais, legenda] of ue.partidos) {
    const nome = federacao || sigla;
    agremiacaoDe.set(sigla, nome);
    const a = ag.get(nome) ?? { nome, partidos: [], nominais: 0, legenda: 0 };
    a.partidos.push(sigla);
    a.nominais += nominais;
    a.legenda += legenda;
    ag.set(nome, a);
  }

  // Candidatos da mesma disputa (unidade + cargo), do índice do estado.
  const indice = (await lerIndice(ano, uf)) ?? [];
  const fotos = await ufsComFoto(ano);
  const daDisputa = indice.filter((x) => x[2] === cargo && (x[11] ?? uf) === sgUe && x[1] === 1);
  const cadeiras = new Map<string, number>();
  for (const x of daDisputa)
    if (ELEITO.test(x[7])) {
      const a = agremiacaoDe.get(x[6]) ?? x[6];
      cadeiras.set(a, (cadeiras.get(a) ?? 0) + 1);
    }

  const agremiacoes = [...ag.values()]
    .map((a) => {
      const votos = a.nominais + a.legenda;
      return {
        nome: a.nome,
        partidos: a.partidos,
        votos,
        legenda: a.legenda,
        pct: ue.validos ? (votos / ue.validos) * 100 : 0,
        qp: qe ? Math.floor(votos / qe) : 0,
        cadeiras: cadeiras.get(a.nome) ?? 0,
        // Sem 80% do QE a agremiação fica fora das sobras.
        disputaSobras: votos >= qe * 0.8,
      };
    })
    .sort((a, b) => b.votos - a.votos);

  const minha = agremiacaoDe.get(l[6]) ?? l[6];
  const daChapa = daDisputa
    .filter((x) => (agremiacaoDe.get(x[6]) ?? x[6]) === minha)
    .sort((a, b) => b[9] - a[9]);
  const eleitosDaChapa = daChapa.filter((x) => ELEITO.test(x[7]));
  const ultimoEleito = eleitosDaChapa[eleitosDaChapa.length - 1] ?? null;
  const primeiroSuplente = daChapa.find((x) => x[7] === "SUPLENTE") ?? null;
  const resumo = (x: LinhaIndice) => paraCandidato(ano, uf, x, fotos, indice);

  return {
    ue: ue.ue,
    cargo,
    vagas: ue.vagas,
    validos: ue.validos,
    qe,
    minimoQp: Math.ceil(qe * 0.1),
    minimoSobras: Math.ceil(qe * 0.2),
    agremiacoes,
    chapa: {
      nome: minha,
      posicao: daChapa.findIndex((x) => x[0] === l[0]) + 1,
      candidatos: daChapa.length,
      eleitos: eleitosDaChapa.map(resumo),
      ultimoEleito: ultimoEleito ? resumo(ultimoEleito) : null,
      primeiroSuplente: primeiroSuplente ? resumo(primeiroSuplente) : null,
    },
    // Os eleitos da disputa inteira, do mais ao menos votado.
    eleitos: daDisputa
      .filter((x) => ELEITO.test(x[7]))
      .sort((a, b) => b[9] - a[9])
      .map(resumo),
  };
}

// ── PRESTAÇÃO DE CONTAS ─────────────────────────────────────────────────────

type ContasArquivo = Record<string, [receitas: number, despesas: number]>;

function mediana(ns: number[]) {
  if (!ns.length) return null;
  const o = [...ns].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

export async function contasDe(id: number) {
  const achado = await linhaPorId(id);
  if (!achado) return null;
  const { ano, uf, l } = achado;
  const arq = await lerDoAno<ContasArquivo>(ano, `contas/${uf}.json`);
  if (!arq) return null;
  const sq = (x: LinhaIndice) => String(Math.floor(x[0] / 10));
  const [receitas, despesas] = arq[sq(l)] ?? [0, 0];

  // Comparação com quem disputou o mesmo cargo no mesmo lugar e se elegeu.
  const indice = (await lerIndice(ano, uf)) ?? [];
  const sgUe = l[11] ?? uf;
  const pares = indice.filter((x) => x[2] === l[2] && (x[11] ?? uf) === sgUe && x[1] === 1 && ELEITO.test(x[7]));
  const despEleitos = pares.map((x) => arq[sq(x)]?.[1] ?? 0).filter((v) => v > 0);
  const custoEleitos = pares
    .map((x) => ((arq[sq(x)]?.[1] ?? 0) > 0 && x[9] > 0 ? arq[sq(x)][1] / x[9] : 0))
    .filter((v) => v > 0);

  return {
    receitas,
    despesas,
    declarou: arq[sq(l)] !== undefined,
    custoPorVoto: despesas > 0 && l[9] > 0 ? despesas / l[9] : null,
    eleitosComparados: despEleitos.length,
    medianaDespesaEleitos: mediana(despEleitos),
    medianaCustoEleitos: mediana(custoEleitos),
  };
}

// ── TRAJETÓRIA E FICHA ──────────────────────────────────────────────────────

type PessoasArquivo = Record<string, [ano: number, uf: string, chave: number][]>;

/** Todas as candidaturas da pessoa, a mais antiga primeiro. */
export async function trajetoriaDe(id: number) {
  const achado = await linhaPorId(id);
  if (!achado) return [];
  const { ano, uf, l } = achado;
  const arq = await lerDoAno<PessoasArquivo>(ano, `pessoas/${uf}.json`);
  const outras = arq?.[l[0]] ?? [[ano, uf, l[0]]];
  const lidas = await Promise.all(
    outras.map(async ([a, u, k]) => {
      const indice = await lerIndice(a, u);
      const x = indice ? linhaPorChave(indice, k) : null;
      if (!x) return null;
      return paraCandidato(a, u, x, await ufsComFoto(a), indice);
    }),
  );
  return lidas
    .filter((c): c is CandidatoArquivo => !!c)
    .sort((a, b) => a.ano - b.ano || a.turno - b.turno);
}

type FichaArquivo = Record<string, [genero: string, nascimento: string, instrucao: string, ocupacao: string, chapa: string]>;

export async function fichaDe(id: number) {
  const achado = await linhaPorId(id);
  if (!achado) return null;
  const arq = await lerDoAno<FichaArquivo>(achado.ano, `ficha/${achado.uf}.json`);
  const f = arq?.[achado.l[0]];
  if (!f) return null;
  const [genero, nascimento, instrucao, ocupacao, chapa] = f;
  return { genero, nascimento, instrucao, ocupacao, chapa };
}

/** O candidato pelo id, sem os votos (página pública, metadados). */
export async function candidatoPorId(id: number) {
  const achado = await linhaPorId(id);
  if (!achado) return null;
  return paraCandidato(achado.ano, achado.uf, achado.l, await ufsComFoto(achado.ano), achado.indice);
}

/** Ids de quem teve voto no 1º turno, do mais ao menos votado (sitemap). */
export async function idsComVoto(ano: number, uf: string) {
  const indice = (await lerIndice(ano, uf)) ?? [];
  return indice
    .filter((l) => l[1] === 1 && l[9] > 0)
    .sort((a, b) => b[9] - a[9])
    .map((l) => codificarId(ano, uf, l[0]));
}
