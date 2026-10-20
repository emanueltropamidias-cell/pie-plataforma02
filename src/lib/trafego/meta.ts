// Ler UMA conta de anúncio da Meta e devolver o documento que `trafego_gravar()`
// grava. Não escreve em lugar nenhum: quem grava é o banco.
//
// ── POR QUE ESTE ARQUIVO NÃO IMPORTA NADA ───────────────────────────────────
//
// Ele é usado por dois lados: a rota `/api/trafego/sync` (Next, na Vercel) e o
// `scripts/sync-trafego.mjs` (Node puro, para a carga inicial de três anos). O
// Node lê TypeScript sem compilar desde a versão 23, mas só o que é "apagável" —
// anotação de tipo sim, `enum` e alias `@/` não. Sem import e sem enum, o mesmo
// arquivo serve aos dois, e a regra de "o que é resultado" existe num lugar só.
//
// ── POR QUE TUDO É CASADO POR ID ────────────────────────────────────────────
//
// O sync antigo casava métrica com campanha pelo NOME. Com uma conta só, passava.
// Com cinco, uma "Engajamento" na CA 01 e outra na CA 02 viram uma linha, e o
// custo por lead das duas se mistura sem erro nenhum. ID de campanha, conjunto e
// anúncio é único na Meta inteira.

export const API_VERSION = "v21.0";

type Acao = { action_type: string; value: string };
type LinhaInsight = {
  date_start: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  frequency?: string;
  actions?: Acao[];
};
type LinhaCampanha = {
  id: string;
  name?: string;
  objective?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
};
type LinhaConjunto = LinhaCampanha & { campaign_id?: string; optimization_goal?: string };
type Criativo = {
  thumbnail_url?: string;
  image_url?: string;
  video_id?: string;
  effective_object_story_id?: string;
  object_story_spec?: {
    video_data?: { image_url?: string };
    link_data?: { picture?: string };
    photo_data?: { url?: string };
  };
  asset_feed_spec?: { images?: { url?: string }[]; videos?: { thumbnail_url?: string }[] };
};
type LinhaAnuncio = { id: string; name?: string; effective_status?: string; creative?: Criativo };

export type Conta = {
  id: string; // só os dígitos, sem "act_"
  nome: string;
  status: number | null;
  /**
   * NÃO é saldo, apesar do nome que a coluna herdou: é o `balance` da Meta, o
   * que já foi gasto e ainda não foi cobrado. Mantido por compatibilidade com a
   * coluna `saldo`; use `aCobrar` e `saldoDisponivel`.
   */
  saldo: number | null;
  moeda: string | null;
  pagamento: "pre" | "pos";
  /** Pós-paga: gasto acumulado que ainda vai ser cobrado na fonte de pagamento. */
  aCobrar: number | null;
  /** Pré-paga: o dinheiro que resta para veicular. */
  saldoDisponivel: number | null;
  /** Limite de gastos da conta, quando existe: quanto falta até ele. */
  limiteRestante: number | null;
  /** "VISA *2738", ou nulo quando a conta não tem fonte de pagamento. */
  fontePagamento: string | null;
  /**
   * Qual token enxerga esta conta.
   *
   * Uma BM não vê a conta da outra: o usuário do sistema mora numa BM só. Com
   * contas em duas BMs são dois tokens, e cada conta tem de ser lida com o
   * token que a enxerga — por isso ele viaja junto com ela.
   */
  token?: string;
};

// ── PRÉ-PAGA OU PÓS-PAGA ────────────────────────────────────────────────────
//
// Em 15/09 o Emanuel pediu "quanto ainda temos de saldo nas contas". A Meta
// devolveu, para as cinco: `is_prepay_account: false` e fonte de pagamento
// cartão (VISA *2738). Conta pós-paga não tem saldo que acaba — tem gasto
// acumulado que vai ser cobrado no cartão. O `balance` que o sync antigo gravava
// como "saldo" e a tela chamava de "saldo devedor" é isso.
//
// Conta pré-paga (pagamento manual, Pix ou boleto) guarda o saldo dentro do
// texto da fonte de pagamento — "Saldo disponível (R$ 1.234,56 BRL)" ou, com o
// token em inglês, "Available balance (R$1,234.56 BRL)". Não há campo numérico.
// Então o valor sai do texto, e o separador decimal é decidido pela ÚLTIMA
// pontuação: é o único jeito de ler "1.234,56" e "1,234.56" como o mesmo número.
function valorDoTexto(texto: string | undefined): number | null {
  const m = texto?.match(/(\d[\d.,]*\d|\d)/g);
  if (!m) return null;
  const bruto = m.sort((a, b) => b.length - a.length)[0];
  const ult = Math.max(bruto.lastIndexOf(","), bruto.lastIndexOf("."));
  const temDecimal = ult > -1 && bruto.length - ult - 1 === 2;
  const inteiro = (temDecimal ? bruto.slice(0, ult) : bruto).replace(/[.,]/g, "");
  const dec = temDecimal ? bruto.slice(ult + 1) : "0";
  const n = Number(`${inteiro}.${dec}`);
  return Number.isFinite(n) ? n : null;
}

const nInt = (v?: string) => Math.max(0, Math.round(parseFloat(v ?? "0") || 0));
const nDec = (v?: string) => Math.max(0, parseFloat(v ?? "0") || 0);

// Orçamento vem em centavos.
function orc(diario?: string, vitalicio?: string) {
  const c = (parseFloat(diario ?? "0") || 0) || (parseFloat(vitalicio ?? "0") || 0);
  return c ? c / 100 : null;
}

/** A data de hoje na Bahia (UTC−3, sem horário de verão). */
export function hojeBahia(deslocDias = 0) {
  return new Date(Date.now() - 3 * 3600_000 + deslocDias * 86400_000).toISOString().slice(0, 10);
}

// ── O QUE É "RESULTADO" ─────────────────────────────────────────────────────
//
// Vem do sync antigo, sem mudança de regra: a meta de OTIMIZAÇÃO do conjunto
// diz o que é resultado, não o objetivo da campanha. Usar o objetivo era o que
// fazia engajamento aparecer rotulado como "conversas iniciadas".
const OTIM: Record<string, { acoes: string[]; label: string; alcance?: boolean }> = {
  LINK_CLICKS: { acoes: ["link_click"], label: "Cliques no link" },
  OUTBOUND_CLICKS: { acoes: ["outbound_click", "link_click"], label: "Cliques no link" },
  LANDING_PAGE_VIEWS: { acoes: ["landing_page_view"], label: "Visitas à página" },
  POST_ENGAGEMENT: { acoes: ["post_engagement", "page_engagement"], label: "Engajamentos" },
  PAGE_ENGAGEMENT: { acoes: ["page_engagement", "post_engagement"], label: "Engajamentos" },
  PAGE_LIKES: { acoes: ["like"], label: "Curtidas" },
  PROFILE_VISIT: { acoes: ["link_click"], label: "Visitas ao perfil" },
  PROFILE_AND_PAGE_ENGAGEMENT: { acoes: ["link_click"], label: "Visitas ao perfil e à Página" },
  CONVERSATIONS: { acoes: ["onsite_conversion.messaging_conversation_started_7d"], label: "Conversas iniciadas" },
  LEAD_GENERATION: { acoes: ["lead", "onsite_conversion.lead_grouped"], label: "Cadastros" },
  QUALITY_LEAD: { acoes: ["lead", "onsite_conversion.lead_grouped"], label: "Cadastros" },
  OFFSITE_CONVERSIONS: { acoes: ["offsite_conversion.fb_pixel_purchase", "purchase", "lead"], label: "Conversões" },
  THRUPLAY: { acoes: ["video_view"], label: "Visualizações" },
  VIDEO_VIEWS: { acoes: ["video_view"], label: "Visualizações" },
  REACH: { acoes: [], label: "Alcance", alcance: true },
  IMPRESSIONS: { acoes: [], label: "Impressões", alcance: true },
};
const GENERICA: [string, string][] = [
  ["lead", "Cadastros"],
  ["onsite_conversion.lead_grouped", "Cadastros"],
  ["link_click", "Cliques no link"],
  ["landing_page_view", "Visitas à página"],
  ["post_engagement", "Engajamentos"],
  ["page_engagement", "Engajamentos"],
  ["onsite_conversion.messaging_conversation_started_7d", "Conversas iniciadas"],
];

function resultado(acoes: Acao[] | undefined, otim: string | undefined, objetivo: string | undefined, alcance: number) {
  const conf = otim ? OTIM[otim] : undefined;
  if (conf) {
    if (conf.alcance) return { valor: alcance, tipo: conf.label };
    for (const a of conf.acoes) {
      const m = acoes?.find((x) => x.action_type === a);
      if (m) return { valor: nInt(m.value), tipo: conf.label };
    }
    return { valor: 0, tipo: conf.label };
  }
  if (objetivo === "OUTCOME_AWARENESS" || objetivo === "BRAND_AWARENESS" || objetivo === "REACH")
    return { valor: alcance, tipo: "Alcance" };
  for (const [a, label] of GENERICA) {
    const m = acoes?.find((x) => x.action_type === a);
    if (m) return { valor: nInt(m.value), tipo: label };
  }
  return { valor: 0, tipo: null as string | null };
}

// ── CHAMADAS ────────────────────────────────────────────────────────────────

class ErroMeta extends Error {
  codigo: number | null;
  constructor(msg: string, codigo: number | null) {
    super(msg);
    this.codigo = codigo;
  }
}

async function pedir<T>(caminho: string, token: string): Promise<T> {
  const sep = caminho.includes("?") ? "&" : "?";
  const r = await fetch(`https://graph.facebook.com/${API_VERSION}/${caminho}${sep}access_token=${encodeURIComponent(token)}`, {
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok || j?.error) throw new ErroMeta(j?.error?.message ?? `HTTP ${r.status}`, j?.error?.code ?? null);
  return j as T;
}

// Todas as páginas. O teto de 50 existe para um `paging.next` quebrado nunca
// virar laço infinito dentro de uma função cobrada por segundo.
async function todas<T>(caminho: string, token: string): Promise<T[]> {
  const dados: T[] = [];
  let j = await pedir<{ data?: T[]; paging?: { next?: string } }>(caminho, token);
  for (let p = 0; p < 50; p++) {
    dados.push(...(j.data ?? []));
    const prox = j.paging?.next;
    if (!prox) break;
    const r = await fetch(prox, { cache: "no-store" });
    j = await r.json();
    if (!r.ok || (j as { error?: unknown }).error) throw new ErroMeta("Falha ao paginar a Meta.", null);
  }
  return dados;
}

// ── "PLEASE REDUCE THE AMOUNT OF DATA" ──────────────────────────────────────
//
// Em 15/09 a CA 02 — a conta que mais gasta — foi a única que falhou na carga de
// três anos, com esse erro. A Meta não recusa pelo número de linhas devolvidas:
// recusa pelo trabalho de montar a resposta, e ele cresce com o período e com o
// tamanho da página.
//
// Então duas coisas: página de 100 em vez de 500, e, se ainda assim recusar, a
// mesma consulta de novo com página de 25. É o que a documentação da própria
// Meta recomenda para esse erro.
function pedeMenos(e: unknown) {
  return /reduce the amount of data/i.test((e as Error)?.message ?? "");
}

async function insights<T>(caminho: string, token: string): Promise<T[]> {
  try {
    return await todas<T>(`${caminho}&limit=100`, token);
  } catch (e) {
    if (!pedeMenos(e)) throw e;
    return await todas<T>(`${caminho}&limit=25`, token);
  }
}

/** Divide [desde, ate] em janelas de até `dias`, para série diária longa. */
function janelas(desde: string, ate: string, dias: number) {
  const out: [string, string][] = [];
  let ini = new Date(`${desde}T12:00:00Z`);
  const fim = new Date(`${ate}T12:00:00Z`);
  while (ini <= fim) {
    const f = new Date(Math.min(ini.getTime() + (dias - 1) * 86400_000, fim.getTime()));
    out.push([ini.toISOString().slice(0, 10), f.toISOString().slice(0, 10)]);
    ini = new Date(f.getTime() + 86400_000);
  }
  return out;
}

/** As contas de anúncio que o token enxerga. Conta nova aparece sozinha. */
// ── MAIS DE UMA BM, MAIS DE UM TOKEN ────────────────────────────────────────
//
// 16/09: duas contas novas de anúncio, e elas moram em OUTRA BM. O usuário do
// sistema `pie-sync` pertence a uma BM só, então o token dele simplesmente não
// lista essas contas — não dá erro, elas apenas não aparecem, que é o pior tipo
// de falha.
//
// Compartilhar a conta entre as BMs resolve quando dá (Parceiros, no
// Gerenciador). Quando não dá — conta de terceiro, de agência — o jeito é um
// usuário do sistema em cada BM. `META_ACCESS_TOKEN` passa a aceitar vários,
// separados por vírgula, ponto e vírgula ou quebra de linha.
export function tokensDaMeta(bruto: string | undefined | null): string[] {
  return [...new Set((bruto ?? "").split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean))];
}

/**
 * As contas de todos os tokens, sem repetir.
 *
 * Conta compartilhada entre as duas BMs aparece nas duas listas; fica a
 * primeira, e é o token dela que vai ser usado para ler as métricas.
 */
export async function listarContasDeTodos(bruto: string | undefined | null): Promise<Conta[]> {
  const tokens = tokensDaMeta(bruto);
  const porId = new Map<string, Conta>();
  const erros: string[] = [];
  for (const [i, token] of tokens.entries()) {
    try {
      for (const c of await listarContas(token)) if (!porId.has(c.id)) porId.set(c.id, { ...c, token });
    } catch (e) {
      // Um token vencido não pode derrubar as contas do outro: a campanha que
      // está rodando continua sendo medida, e o erro aparece nomeado.
      erros.push(`token ${i + 1} de ${tokens.length}: ${(e as Error).message}`);
    }
  }
  if (porId.size === 0)
    throw new Error(erros.length ? erros.join(" · ") : "nenhum token da Meta configurado");
  return [...porId.values()];
}

export async function listarContas(token: string): Promise<Conta[]> {
  type C = {
    account_id: string;
    name?: string;
    account_status?: number;
    balance?: string;
    currency?: string;
    is_prepay_account?: boolean;
    amount_spent?: string;
    spend_cap?: string;
    funding_source_details?: { display_string?: string; type?: number };
  };
  const contas = await todas<C>(
    "me/adaccounts?fields=account_id,name,account_status,balance,currency,is_prepay_account,amount_spent,spend_cap,funding_source_details&limit=100",
    token,
  );
  const centavos = (v?: string) => (v ? (parseFloat(v) || 0) / 100 : null);
  return contas.map((c) => {
    // Tipo 20 é "saldo pré-pago" na tabela de fontes da Meta. As duas pistas
    // valem: a flag e o tipo da fonte — contas antigas nem sempre trazem a flag.
    const pre = c.is_prepay_account === true || c.funding_source_details?.type === 20;
    const cap = centavos(c.spend_cap);
    const gasto = centavos(c.amount_spent);
    return {
      id: c.account_id,
      nome: c.name ?? `act_${c.account_id}`,
      status: typeof c.account_status === "number" ? c.account_status : null,
      saldo: centavos(c.balance),
      moeda: c.currency ?? null,
      pagamento: pre ? "pre" : "pos",
      aCobrar: pre ? null : centavos(c.balance),
      saldoDisponivel: pre ? valorDoTexto(c.funding_source_details?.display_string) : null,
      limiteRestante: cap && gasto != null ? Math.max(0, cap - gasto) : null,
      fontePagamento: c.funding_source_details?.display_string ?? null,
    };
  });
}

// ── A ARTE DO CRIATIVO ──────────────────────────────────────────────────────
//
// A miniatura padrão da Meta é 64×64 — no card de 350px, borrão. Em 15/09, 12
// dos 42 criativos da base estavam gravados assim. A arte cheia mora em lugares
// diferentes conforme o tipo de anúncio: no próprio criativo, na capa do vídeo,
// ou na publicação original (anúncio feito a partir de post). Os dois últimos
// exigem uma chamada a mais, e o de publicação exige `pages_read_engagement` —
// que o token antigo não tinha, e é por isso que eles ficavam borrados.
function arteDireta(c?: Criativo) {
  return (
    c?.image_url ||
    c?.object_story_spec?.video_data?.image_url ||
    c?.object_story_spec?.photo_data?.url ||
    c?.object_story_spec?.link_data?.picture ||
    c?.asset_feed_spec?.images?.[0]?.url ||
    c?.asset_feed_spec?.videos?.[0]?.thumbnail_url ||
    null
  );
}

async function resolverArte(anuncios: LinhaAnuncio[], token: string) {
  const arte = new Map<string, string | null>();
  const porVideo = new Map<string, string[]>();
  const porPost = new Map<string, string[]>();
  const conta = { cheia: 0, video: 0, post: 0, miniatura: 0, sem: 0 };
  const erros: string[] = [];

  for (const a of anuncios) {
    const cheia = arteDireta(a.creative);
    if (cheia) {
      arte.set(a.id, cheia);
      conta.cheia++;
      continue;
    }
    arte.set(a.id, a.creative?.thumbnail_url ?? null);
    const v = a.creative?.video_id;
    const post = a.creative?.effective_object_story_id;
    if (v) porVideo.set(v, [...(porVideo.get(v) ?? []), a.id]);
    else if (post) porPost.set(post, [...(porPost.get(post) ?? []), a.id]);
    else if (a.creative?.thumbnail_url) conta.miniatura++;
    else conta.sem++;
  }

  // Lotes de 50 é o máximo de `?ids=` que a Meta aceita numa chamada.
  const lotes = <T,>(xs: T[]) => Array.from({ length: Math.ceil(xs.length / 50) }, (_, i) => xs.slice(i * 50, i * 50 + 50));

  for (const lote of lotes([...porVideo.keys()])) {
    try {
      type V = { thumbnails?: { data?: { uri?: string; is_preferred?: boolean; width?: number }[] }; picture?: string };
      const j = await pedir<Record<string, V>>(`?ids=${lote.join(",")}&fields=thumbnails{uri,is_preferred,width},picture`, token);
      for (const [id, d] of Object.entries(j)) {
        const ops = d?.thumbnails?.data ?? [];
        const melhor = ops.find((t) => t.is_preferred && t.uri) ?? [...ops].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
        const capa = melhor?.uri || d?.picture;
        for (const ad of porVideo.get(id) ?? []) {
          if (capa) { arte.set(ad, capa); conta.video++; } else conta.miniatura++;
        }
      }
    } catch (e) {
      erros.push(`capa de vídeo: ${(e as Error).message}`);
      conta.miniatura += lote.flatMap((id) => porVideo.get(id) ?? []).length;
    }
  }

  for (const lote of lotes([...porPost.keys()])) {
    try {
      const j = await pedir<Record<string, { full_picture?: string; picture?: string }>>(
        `?ids=${lote.join(",")}&fields=full_picture,picture`,
        token,
      );
      for (const [id, d] of Object.entries(j)) {
        const foto = d?.full_picture || d?.picture;
        for (const ad of porPost.get(id) ?? []) {
          if (foto) { arte.set(ad, foto); conta.post++; } else conta.miniatura++;
        }
      }
    } catch (e) {
      erros.push(`foto de publicação: ${(e as Error).message}`);
      conta.miniatura += lote.flatMap((id) => porPost.get(id) ?? []).length;
    }
  }

  return { arte, conta, erros };
}

// ── UMA CONTA ───────────────────────────────────────────────────────────────

export type Modo = "hoje" | "recente" | "completo";

/**
 * hoje      métricas diárias de ontem e hoje. Leve: é o de 5 em 5 minutos.
 *           Ontem entra porque a Meta ainda corrige a atribuição por horas.
 * recente   métricas dos últimos 30 dias + agregados, criativos e pixel.
 *           Uma vez por dia. Mais de 28 dias atrás a atribuição já fechou.
 * completo  três anos. Só na carga inicial ou quando alguém pedir.
 */
export async function lerConta(conta: Conta, token: string, modo: Modo) {
  const ate = hojeBahia();
  const desde = modo === "hoje" ? hojeBahia(-1) : modo === "recente" ? hojeBahia(-30) : hojeBahia(-365 * 3);
  // Agregado é sempre do período máximo — é o que o Gerenciador chama de
  // "Máximo", e o alcance único dele não se reconstrói somando dias.
  const desdeMax = hojeBahia(-365 * 3);
  const comAgregados = modo !== "hoje";
  const act = `act_${conta.id}`;
  const faixa = (s: string) => `time_range[since]=${s}&time_range[until]=${ate}`;

  // A série diária vai em janelas de 90 dias, uma depois da outra. Em paralelo
  // seria mais rápido e seria o mesmo pedido gigante que a CA 02 recusou.
  const serieDiaria = async () => {
    const linhas: LinhaInsight[] = [];
    for (const [s, u] of janelas(desde, ate, 90)) {
      linhas.push(
        ...(await insights<LinhaInsight>(
          `${act}/insights?level=campaign&time_increment=1&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,frequency,actions&time_range[since]=${s}&time_range[until]=${u}`,
          token,
        )),
      );
    }
    return linhas;
  };

  const [campanhas, conjuntos, diario] = await Promise.all([
    todas<LinhaCampanha>(`${act}/campaigns?fields=id,name,objective,effective_status,daily_budget,lifetime_budget&limit=200`, token),
    todas<LinhaConjunto>(`${act}/adsets?fields=id,name,campaign_id,optimization_goal,effective_status,daily_budget,lifetime_budget&limit=200`, token),
    serieDiaria(),
  ]);

  const infoCamp = new Map(campanhas.map((c) => [c.id, { nome: c.name ?? null, objetivo: c.objective ?? null, status: c.effective_status ?? null, orcamento: orc(c.daily_budget, c.lifetime_budget) }]));

  // Otimização por campanha só vale se TODOS os conjuntos otimizam a mesma
  // coisa. Campanha de conjuntos mistos não tem um resultado único.
  const metas = new Map<string, Set<string>>();
  for (const s of conjuntos) {
    if (!s.campaign_id || !s.optimization_goal) continue;
    metas.set(s.campaign_id, (metas.get(s.campaign_id) ?? new Set()).add(s.optimization_goal));
  }
  const otimCamp = new Map([...metas].filter(([, m]) => m.size === 1).map(([id, m]) => [id, [...m][0]]));

  const metricas = diario
    .filter((r) => r.campaign_id)
    .map((r) => {
      const i = infoCamp.get(r.campaign_id!);
      const alcance = nInt(r.reach);
      const { valor, tipo } = resultado(r.actions, otimCamp.get(r.campaign_id!), i?.objetivo ?? undefined, alcance);
      return {
        data: r.date_start,
        campaign_id: r.campaign_id,
        campanha: r.campaign_name ?? i?.nome ?? null,
        alcance,
        impressoes: nInt(r.impressions),
        cliques: nInt(r.clicks),
        gasto: nDec(r.spend),
        frequencia: nDec(r.frequency),
        resultados: valor,
        tipo_resultado: tipo,
        objetivo: i?.objetivo ?? null,
        status: i?.status ?? null,
        orcamento: i?.orcamento ?? null,
      };
    });

  const doc: Record<string, unknown> = {
    conta: {
      id: conta.id, nome: conta.nome, status: conta.status, saldo: conta.saldo, moeda: conta.moeda,
      pagamento: conta.pagamento, a_cobrar: conta.aCobrar, saldo_disponivel: conta.saldoDisponivel,
      limite_restante: conta.limiteRestante, fonte_pagamento: conta.fontePagamento,
    },
    since: desde,
    until: ate,
    metricas,
  };
  const diagnostico: { arte?: Record<string, number>; avisos: string[] } = { avisos: [] };

  if (comAgregados) {
    const infoConj = new Map(conjuntos.map((s) => [s.id, s]));
    // Em série, pelo mesmo motivo da série diária: seis agregados de três anos
    // de uma vez é exatamente o volume que a Meta manda reduzir.
    const campAgg = await insights<LinhaInsight>(`${act}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,frequency,actions&${faixa(desdeMax)}`, token);
    const conjAgg = await insights<LinhaInsight>(`${act}/insights?level=adset&fields=adset_id,adset_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions&${faixa(desdeMax)}`, token);
    const adAgg = await insights<LinhaInsight>(`${act}/insights?level=ad&fields=ad_id,ad_name,campaign_id,campaign_name,spend,impressions,reach,clicks,actions&${faixa(desdeMax)}`, token);
    const anuncios = await todas<LinhaAnuncio>(
      `${act}/ads?fields=id,name,effective_status,creative{thumbnail_url,image_url,video_id,effective_object_story_id,object_story_spec{video_data{image_url},photo_data{url},link_data{picture}},asset_feed_spec{images{url},videos{thumbnail_url}}}&limit=100`,
      token,
    );
    const conta_agg = await insights<LinhaInsight>(`${act}/insights?fields=reach,frequency,impressions,clicks,spend&${faixa(desdeMax)}`, token);
    const pixels = await todas<{ name?: string; last_fired_time?: string }>(`${act}/adspixels?fields=name,last_fired_time&limit=5`, token).catch(() => []);

    doc.campanhas = campAgg
      .filter((r) => r.campaign_id)
      .map((r) => {
        const i = infoCamp.get(r.campaign_id!);
        const alcance = nInt(r.reach);
        const { valor, tipo } = resultado(r.actions, otimCamp.get(r.campaign_id!), i?.objetivo ?? undefined, alcance);
        return {
          campaign_id: r.campaign_id, campanha: r.campaign_name ?? i?.nome ?? null,
          objetivo: i?.objetivo ?? null, status: i?.status ?? null, orcamento: i?.orcamento ?? null,
          gasto: nDec(r.spend), alcance, frequencia: nDec(r.frequency),
          impressoes: nInt(r.impressions), cliques: nInt(r.clicks), resultados: valor, tipo_resultado: tipo,
        };
      });

    doc.conjuntos = conjAgg
      .filter((r) => r.adset_id)
      .map((r) => {
        const s = infoConj.get(r.adset_id!);
        const alcance = nInt(r.reach);
        const objetivo = r.campaign_id ? infoCamp.get(r.campaign_id)?.objetivo : undefined;
        const { valor, tipo } = resultado(r.actions, s?.optimization_goal, objetivo ?? undefined, alcance);
        return {
          adset_id: r.adset_id, nome: r.adset_name ?? s?.name ?? null, campanha: r.campaign_name ?? null,
          status: s?.effective_status ?? null, otimizacao: s?.optimization_goal ?? null,
          orcamento: orc(s?.daily_budget, s?.lifetime_budget),
          gasto: nDec(r.spend), alcance, impressoes: nInt(r.impressions), cliques: nInt(r.clicks),
          resultados: valor, tipo_resultado: tipo,
        };
      });

    const { arte, conta: contaArte, erros } = await resolverArte(anuncios, token);
    diagnostico.arte = contaArte;
    diagnostico.avisos.push(...erros);
    const statusAd = new Map(anuncios.map((a) => [a.id, a.effective_status ?? null]));

    doc.criativos = adAgg
      .filter((r) => r.ad_id)
      .map((r) => {
        const i = r.campaign_id ? infoCamp.get(r.campaign_id) : undefined;
        const alcance = nInt(r.reach);
        const { valor, tipo } = resultado(r.actions, r.campaign_id ? otimCamp.get(r.campaign_id) : undefined, i?.objetivo ?? undefined, alcance);
        return {
          ad_id: r.ad_id, ad_name: r.ad_name ?? null, campanha: r.campaign_name ?? null,
          thumbnail_url: arte.get(r.ad_id!) ?? null, status: statusAd.get(r.ad_id!) ?? null,
          objetivo: i?.objetivo ?? null, gasto: nDec(r.spend), impressoes: nInt(r.impressions),
          cliques: nInt(r.clicks), resultados: valor, tipo_resultado: tipo,
        };
      });

    const c = conta_agg[0];
    if (c) doc.agregado = { alcance: nInt(c.reach), frequencia: nDec(c.frequency), impressoes: nInt(c.impressions), cliques: nInt(c.clicks), gasto: nDec(c.spend) };
    if (pixels[0]) doc.pixel = { nome: pixels[0].name ?? "Pixel", ultimo: pixels[0].last_fired_time ?? null };
  }

  return { doc, diagnostico };
}
