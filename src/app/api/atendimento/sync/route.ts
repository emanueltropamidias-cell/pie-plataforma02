import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";
import { chave } from "@/lib/eleicao";
import { lerConversa, type Mensagem } from "@/lib/atendimento";
import { classificarComIA } from "@/lib/classificar-ia";

// Traz as conversas do GabiFlow para dentro do PIE.
//
// Roda em DUAS FASES, e a separação não é capricho:
//
//   ?fase=conversas  — 4 chamadas trazem as ~400 conversas com status,
//                      departamento, atendente e horários. Rápido.
//   ?fase=mensagens  — uma chamada POR CONVERSA para ler o conteúdo e
//                      classificar. É o caro: a chave tem limite por minuto e
//                      a Vercel corta a requisição em 60s.
//
// Fazer tudo de uma vez estouraria os dois limites e não terminaria nunca. Em
// fases, a primeira já enche o painel com fila e SLA, e a segunda vai
// completando a classificação em lotes, sem pressa.
//
// Variáveis na Vercel:
//   GABIFLOW_API_KEY   -> a chave gerada em Integrações API (só leitura)
//   GABIFLOW_BASE_URL  -> https://talita.gabiflow.com.br/api/external/whatsapp

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const LOTE_PADRAO = 25;

const POR_CHAVE = new Map(MUNICIPIOS_BA.map((m) => [chave(m), m]));

/** Acha o município citado, preferindo o nome mais comprido — "Feira de
 *  Santana" ganha de "Feira", que não existe mas poderia. */
function acharMunicipio(texto: string): string | null {
  const t = chave(texto);
  if (!t) return null;
  let achado: string | null = null;
  for (const [k, nome] of POR_CHAVE) {
    if (k.length < 4) continue;
    if (t.includes(k) && (!achado || nome.length > achado.length))
      achado = nome;
  }
  return achado;
}

/** O código que o anúncio deixa na mensagem pronta, quando existe. */
function acharOrigem(texto: string): string | null {
  const m = texto.match(
    /\b(?:cod|codigo|ref|origem)[\s:=-]*([a-z0-9_-]{2,20})\b/i,
  );
  return m ? m[1].toUpperCase() : null;
}

type ConversaAPI = {
  id: number;
  phone: string;
  contactName: string | null;
  status: string | null;
  department: string | null;
  assignedTo: string | null;
  unreadCount: number;
  totalMessages: number;
  lastMessage: string | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

function ambiente() {
  const chaveApi = process.env.GABIFLOW_API_KEY;
  const base = process.env.GABIFLOW_BASE_URL;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chaveApi || !base || !url || !servico) return null;
  // .trim() porque chave colada de editor de texto vem com espaço ou quebra de
  // linha grudada, e o servidor devolve "chave inválida" sem dizer o motivo.
  return {
    chaveApi: chaveApi.trim(),
    base: base.trim().replace(/\/$/, ""),
    url,
    servico,
  };
}

async function buscar(
  env: { base: string; chaveApi: string },
  caminho: string,
) {
  const r = await fetch(`${env.base}${caminho}`, {
    headers: { "X-API-Key": env.chaveApi },
    cache: "no-store",
  });
  // A API devolve HTTP 200 mesmo quando falha, com success:false no corpo.
  // Conferir só o status daria falso positivo — foi o que me enganou na
  // primeira leitura desta API.
  const j = await r.json().catch(() => null);
  if (!j?.success) throw new Error(j?.error ?? `HTTP ${r.status}`);
  return j;
}

/**
 * Diagnóstico. Diz se falta configurar algo, e testa a chave de verdade —
 * "variável existe" não é o mesmo que "variável funciona".
 */
export async function GET() {
  const sessao = await createClient();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const env = ambiente();
  if (!env) {
    return NextResponse.json({
      pronto: false,
      falta: [
        !process.env.GABIFLOW_API_KEY && "GABIFLOW_API_KEY",
        !process.env.GABIFLOW_BASE_URL && "GABIFLOW_BASE_URL",
        !process.env.SUPABASE_SERVICE_ROLE_KEY && "SUPABASE_SERVICE_ROLE_KEY",
      ].filter(Boolean),
    });
  }
  // Assinatura da chave: tamanho e os 4 últimos caracteres. Não dá para
  // reconstruir a chave com isso, e é o suficiente para responder a pergunta
  // que trava todo mundo — "o que está na Vercel é mesmo o que eu colei?".
  const assinatura = {
    chave_tamanho: env.chaveApi.length,
    chave_termina_em: env.chaveApi.slice(-4),
    base_url: env.base,
  };

  try {
    const j = await buscar(env, "/conversations?limit=1");
    return NextResponse.json({
      pronto: true,
      conversas_no_gabiflow: j.pagination?.total ?? null,
      ...assinatura,
    });
  } catch (e) {
    return NextResponse.json({
      pronto: false,
      erro: e instanceof Error ? e.message : "A chave não autenticou.",
      ...assinatura,
    });
  }
}

export async function POST(req: Request) {
  try {
    return await sincronizar(req);
  } catch (e) {
    // Sem isto, a exceção sobe, a Vercel responde 500 com corpo VAZIO e o
    // navegador diz apenas "Unexpected end of JSON input" — que esconde
    // justamente a mensagem do GabiFlow, a única útil.
    return NextResponse.json(
      {
        erro:
          e instanceof Error ? e.message : "Falha inesperada na sincronização.",
      },
      { status: 502 },
    );
  }
}

async function sincronizar(req: Request) {
  const env = ambiente();
  if (!env) {
    return NextResponse.json(
      {
        erro: "Faltam GABIFLOW_API_KEY, GABIFLOW_BASE_URL ou as credenciais do Supabase.",
      },
      { status: 400 },
    );
  }

  // Só quem está logado e aprovado dispara sincronização: ela consome o limite
  // por minuto da chave, e chave estourada derruba o painel para todo mundo.
  const sessao = await createClient();
  const {
    data: { user },
  } = await sessao.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Sem sessão." }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const fase = params.get("fase") ?? "conversas";
  const lote = Math.min(Number(params.get("lote")) || LOTE_PADRAO, 60);

  const banco = criarServico(env.url, env.servico, {
    auth: { persistSession: false },
  });

  // ── FASE 1 ────────────────────────────────────────────────────────────────
  if (fase === "conversas") {
    const linhas: Record<string, unknown>[] = [];
    let offset = 0;
    let total = Infinity;

    while (offset < total && offset < 5000) {
      const j = await buscar(env, `/conversations?limit=100&offset=${offset}`);
      total = j.pagination?.total ?? 0;
      const pagina: ConversaAPI[] = j.data ?? [];
      if (pagina.length === 0) break;

      for (const c of pagina) {
        linhas.push({
          id: c.id,
          phone: c.phone,
          contact_name: c.contactName,
          status_conversa: c.status,
          department: c.department,
          assigned_to: c.assignedTo,
          unread_count: c.unreadCount ?? 0,
          total_messages: c.totalMessages ?? 0,
          last_message: c.lastMessage,
          last_message_at: c.lastMessageAt,
          criado_em: c.createdAt,
          atualizado_em: c.updatedAt,
          sincronizado_em: new Date().toISOString(),
        });
      }
      offset += pagina.length;
    }

    // Grava em blocos: um upsert de 400 linhas de uma vez costuma estourar o
    // tamanho do corpo aceito pelo PostgREST.
    for (let i = 0; i < linhas.length; i += 200) {
      const { error } = await banco
        .from("atendimentos")
        .upsert(linhas.slice(i, i + 200), { onConflict: "id" });
      if (error)
        return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    return NextResponse.json({ fase, conversas: linhas.length, total });
  }

  // ── FASE 2 ────────────────────────────────────────────────────────────────
  // Classifica quem ainda não foi lido, ou quem recebeu mensagem nova depois da
  // última leitura. Ordem: mais recente primeiro, porque é o que o painel de
  // hoje mostra.
  const { data: pendentes, error: erroLista } = await banco
    .from("atendimentos")
    .select("id, phone, total_messages, mensagens_lidas, tipo")
    .order("atualizado_em", { ascending: false })
    .limit(500);
  if (erroLista)
    return NextResponse.json({ erro: erroLista.message }, { status: 500 });

  // Relê quem tem mensagem nova E quem ainda não tem `tipo`. A segunda metade
  // parece redundante e não é: quando uma regra de classificação nasce depois
  // da primeira leitura, a conversa já lida nunca mais seria tocada e ficaria
  // com o campo vazio para sempre. Campo novo entra sozinho na fila.
  const precisa = (c: {
    total_messages: number | null;
    mensagens_lidas: number | null;
    tipo: string | null;
  }) => (c.total_messages ?? 0) > (c.mensagens_lidas ?? 0) || !c.tipo;

  const fila = (pendentes ?? []).filter(precisa).slice(0, lote);

  const falhas: string[] = [];

  // ── passo A: baixar as mensagens do lote ──────────────────────────────────
  type Baixada = {
    id: number;
    msgs: Mensagem[];
    leitura: ReturnType<typeof lerConversa>;
  };
  const baixadas: Baixada[] = [];

  for (const c of fila) {
    try {
      const j = await buscar(
        env,
        `/messages?phone=${encodeURIComponent(c.phone)}&limit=200`,
      );
      const msgs: Mensagem[] = (j.data?.messages ?? []).map(
        (m: {
          direction: string;
          text: string | null;
          sentBy: string | null;
          createdAt: string;
        }) => ({
          direction: m.direction === "outbound" ? "outbound" : "inbound",
          text: m.text,
          sentBy: m.sentBy,
          createdAt: m.createdAt,
        }),
      );
      baixadas.push({ id: c.id, msgs, leitura: lerConversa(msgs) });
    } catch (e) {
      falhas.push(`${c.id}: ${e instanceof Error ? e.message : "erro"}`);
    }
  }

  // ── passo B: a IA opina, mas só onde há o que interpretar ─────────────────
  //
  // Conversa sem resposta nossa, ou sem mensagem da pessoa, já está decidida
  // pela estrutura — mandar para o modelo seria pagar por um palpite sobre algo
  // que a gente sabe com certeza, e correr o risco dele discordar do fato.
  const paraIA = baixadas.filter(
    (b) =>
      b.msgs.some((m) => m.direction === "inbound") &&
      b.leitura.primeiraResposta,
  );
  const daIA = await classificarComIA(
    paraIA.map((b) => ({
      id: b.id,
      msgs: b.msgs.map((m) => ({ direction: m.direction, text: m.text })),
    })),
  );

  // ── passo C: gravar ───────────────────────────────────────────────────────
  let lidas = 0;
  for (const b of baixadas) {
    // A IA só entra onde a estrutura não decidiu. Onde ela não respondeu — API
    // fora, chave ausente, lote que falhou —, vale a palavra-chave.
    const opiniao = daIA.get(b.id);
    const status = opiniao?.status ?? b.leitura.status;
    const demandas = opiniao?.demandas ?? b.leitura.demandas;

    const textoDela = b.msgs
      .filter((m) => m.direction === "inbound")
      .map((m) => m.text ?? "")
      .join(" ");

    const { error } = await banco
      .from("atendimentos")
      .update({
        tipo: b.leitura.tipo,
        status_lead: status,
        demandas,
        municipio: acharMunicipio(textoDela),
        origem: acharOrigem(textoDela),
        primeira_msg_at: b.leitura.primeiraMsg,
        primeira_resp_at: b.leitura.primeiraResposta,
        ultima_direcao: b.leitura.ultimaDirecao,
        respondida_por: b.leitura.respondidaPor,
        mensagens_lidas: b.msgs.length,
        sincronizado_em: new Date().toISOString(),
      })
      .eq("id", b.id);
    if (error) falhas.push(`${b.id}: ${error.message}`);
    else lidas++;
  }

  const restam = (pendentes ?? []).filter(precisa).length;

  return NextResponse.json({
    fase,
    classificadas: lidas,
    faltam: Math.max(0, restam - lidas),
    falhas: falhas.slice(0, 5),
  });
}
