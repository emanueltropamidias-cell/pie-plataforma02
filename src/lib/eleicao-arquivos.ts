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
function paraCandidato(ano: number, uf: string, l: LinhaIndice, fotos: Set<string>) {
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
    .map((l) => paraCandidato(o.ano, o.uf, l, fotos));
}

/**
 * Os candidatos de um estado numa eleição, do mais votado ao menos, com os
 * cargos e partidos que existem ali (para os filtros saírem do dado, e não de
 * lista escrita à mão).
 */
export async function listarCandidatos(o: {
  ano: number;
  uf: string;
  cargo?: string | null;
  partido?: string | null;
  q?: string | null;
  pagina?: number;
  porPagina?: number;
}) {
  const indice = (await lerIndice(o.ano, o.uf)) ?? [];
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
  const filtrados = doCargo
    .filter((l) => !o.partido || l[6] === o.partido)
    .filter((l) => !palavras.length || palavras.every((p) => normalizar(`${l[3]} ${l[4]} ${l[5]} ${l[8]}`).includes(p)))
    .sort((a, b) => b[9] - a[9]);
  const porPagina = o.porPagina ?? 48;
  const pagina = Math.max(0, o.pagina ?? 0);
  return {
    total: filtrados.length,
    // Só cargo com voto próprio: vice e suplente não recebem voto (vai para o
    // titular), e escolher um deles dava uma lista inteira de zeros.
    cargos: contar(primeiroTurno.filter((l) => l[9] > 0), 2),
    partidos: contar(doCargo, 6),
    candidatos: filtrados
      .slice(pagina * porPagina, (pagina + 1) * porPagina)
      .map((l) => paraCandidato(o.ano, o.uf, l, fotos)),
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

/** O mais votado de uma eleição (1º turno), opcionalmente de um cargo. */
export async function destaque(ano: number, uf: string, cargo?: string | null) {
  const indice = await lerIndice(ano, uf);
  if (!indice) return null;
  let melhor: LinhaIndice | null = null;
  for (const l of indice) if (l[1] === 1 && (!cargo || l[2] === cargo) && (!melhor || l[9] > melhor[9])) melhor = l;
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
  const l = indice?.find((x) => x[0] === chave);
  return l ? { ano, uf, l } : null;
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
  return {
    candidato: paraCandidato(ano, uf, l, fotos),
    votos_por_municipio: porMunicipio,
    votos_por_uf: votosPorUf,
    top_municipios: top,
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
