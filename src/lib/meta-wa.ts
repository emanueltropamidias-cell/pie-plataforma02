import crypto from "node:crypto";
import type { MensagemLida } from "@/lib/evolution";

// O WhatsApp OFICIAL — a Cloud API da Meta.
//
// ── POR QUE VIEMOS PARAR AQUI ───────────────────────────────────────────────
//
// O número não-oficial foi banido às 15:01 do dia 26/08, com 34.855 mensagens e
// 5.141 contatos em dez horas. O motivo estava no log da instância: código 401.
// Não foi queda de servidor nem erro de código — foi o WhatsApp cortando um
// número que se comportava como robô, porque era um robô.
//
// A Evolution fala com o WhatsApp fingindo ser um celular. Funciona, é barata,
// e o banimento é questão de quando. A Cloud API é a porta que a Meta abriu de
// propósito: não há o que fingir, e volume não bane.
//
// ── O QUE ISTO CUSTA, DE VERDADE ────────────────────────────────────────────
//
// Quase nada, para o que a campanha faz. A Meta cobra por CONVERSA INICIADA
// PELA EMPRESA. Quando é a PESSOA que fala primeiro — que é o caso de todo lead
// que vem do anúncio — a resposta dentro de 24 horas é de graça e SEM TETO DE
// VOLUME.
//
// O que custa é falar com quem não falou com você, ou responder depois das 24
// horas. Aí é obrigatório um TEMPLATE aprovado antes, e é aí que aparecem os
// R$ 0,04 (utilidade) ou R$ 0,38 (marketing) por mensagem.
//
// Isso muda o desenho do atendimento: a conversa tem RELÓGIO. Passou de 24
// horas sem a pessoa escrever, a menina não consegue mandar um "oi" simples —
// precisa de template. Está em `dentroDaJanela` mais abaixo.

const VERSAO = "v21.0";
const BASE = `https://graph.facebook.com/${VERSAO}`;

export type AmbienteMeta = {
  token: string;
  telefoneId: string;
  segredoApp: string | null;
  verificacao: string | null;
};

export function ambienteMeta(): AmbienteMeta | null {
  const token = process.env.META_WA_TOKEN?.trim();
  const telefoneId = process.env.META_WA_PHONE_ID?.trim();
  if (!token || !telefoneId) return null;
  return {
    token,
    telefoneId,
    segredoApp: process.env.META_WA_APP_SECRET?.trim() || null,
    verificacao:
      process.env.META_WA_VERIFY_TOKEN?.trim() ||
      process.env.WHATSAPP_VERIFY_TOKEN?.trim() ||
      null,
  };
}

export function configuradaMeta() {
  return ambienteMeta() !== null;
}

export type Resposta<T> =
  | { ok: true; dados: T }
  | { ok: false; erro: string; status?: number };

async function chamar<T>(
  caminho: string,
  corpo: unknown,
): Promise<Resposta<T>> {
  const env = ambienteMeta();
  if (!env) return { ok: false, erro: "Cloud API não configurada." };

  try {
    const r = await fetch(`${BASE}/${caminho}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.token}`,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(25_000),
    });

    const texto = await r.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      /* a Meta às vezes devolve HTML em erro de gateway */
    }

    if (!r.ok) {
      // A Meta descreve o erro com precisão, e a mensagem dela é MUITO melhor
      // do que "falhou": diz se o número não tem template aprovado, se a janela
      // de 24h fechou, se o token venceu. Vai inteira para a tela.
      const e = (json as { error?: { message?: string; code?: number } })?.error;
      return {
        ok: false,
        status: r.status,
        erro: e?.message
          ? `${e.message}${e.code ? ` (código ${e.code})` : ""}`
          : `HTTP ${r.status}: ${texto.slice(0, 200)}`,
      };
    }

    return { ok: true, dados: (json ?? {}) as T };
  } catch (e) {
    const abortou = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      erro: abortou ? "A Meta demorou demais para responder." : String(e),
    };
  }
}

/** O formato que a Meta devolve ao aceitar um envio. */
type EnvioMeta = {
  messages?: { id?: string }[];
  contacts?: { wa_id?: string }[];
};

/**
 * Só dígitos, com o 55 na frente.
 *
 * A Meta NÃO quer o nono dígito removido nem adicionado — ela aceita o número
 * como o WhatsApp o conhece e devolve o `wa_id` canônico na resposta. Mexer
 * aqui é o erro clássico: some o 9 de um celular de São Paulo e a mensagem vai
 * para outra pessoa.
 */
export function paraMeta(telefone: string): string {
  const so = telefone.replace(/\D/g, "");
  return so.startsWith("55") ? so : `55${so}`;
}

export function enviarTextoMeta(telefone: string, texto: string) {
  const env = ambienteMeta();
  if (!env) return Promise.resolve({ ok: false as const, erro: "sem Meta" });
  return chamar<EnvioMeta>(`${env.telefoneId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: paraMeta(telefone),
    type: "text",
    // `preview_url` desligado: link de campanha vira cartão grande com imagem
    // puxada de fora, e isso atrasa a entrega sem ajudar ninguém.
    text: { body: texto, preview_url: false },
  });
}

/**
 * Foto ou vídeo POR ENDEREÇO.
 *
 * A Meta aceita subir o arquivo antes e mandar por id, ou passar um link que
 * ELA busca. O link é o caminho certo aqui: o arquivo já está no balde do
 * Supabase, e subir de novo para a Meta seria carregar 15 MB por uma função da
 * Vercel que recusa 4,5 MB.
 *
 * O link precisa ser alcançável pela internet e viver o bastante para a Meta
 * buscar — o assinado de dez minutos cobre com folga.
 */
export function enviarMidiaMeta(
  telefone: string,
  tipo: "image" | "video" | "document",
  url: string,
  opcoes?: { legenda?: string; nomeArquivo?: string },
) {
  const env = ambienteMeta();
  if (!env) return Promise.resolve({ ok: false as const, erro: "sem Meta" });

  const midia: Record<string, unknown> = { link: url };
  if (opcoes?.legenda) midia.caption = opcoes.legenda;
  // Só documento aceita nome. Mandar em foto faz a Meta recusar o envio inteiro.
  if (tipo === "document" && opcoes?.nomeArquivo)
    midia.filename = opcoes.nomeArquivo;

  return chamar<EnvioMeta>(`${env.telefoneId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: paraMeta(telefone),
    type: tipo,
    [tipo]: midia,
  });
}

/**
 * Áudio como MENSAGEM DE VOZ.
 *
 * A Meta decide voz-ou-anexo pelo FORMATO, e não por um campo: OGG/Opus chega
 * como voz; MP3 e M4A chegam como arquivo para baixar. Não há parâmetro para
 * forçar — é por isso que a biblioteca insiste em .ogg em vez de aceitar
 * qualquer coisa e torcer.
 *
 * `caption` não existe para áudio aqui. Mandar junto faz a Meta recusar o envio
 * inteiro, e a mensagem de erro não diz que a culpa é da legenda.
 */
export function enviarAudioMeta(telefone: string, url: string) {
  const env = ambienteMeta();
  if (!env) return Promise.resolve({ ok: false as const, erro: "sem Meta" });
  return chamar<EnvioMeta>(`${env.telefoneId}/messages`, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: paraMeta(telefone),
    type: "audio",
    audio: { link: url },
  });
}

/** Marca como lida — as duas tiquinhas azuis. Cortesia que muda a percepção de
 *  quem espera: sem isso a pessoa vê "entregue" por horas e reescreve. */
export function marcarLidaMeta(waId: string) {
  const env = ambienteMeta();
  if (!env) return Promise.resolve({ ok: false as const, erro: "sem Meta" });
  return chamar(`${env.telefoneId}/messages`, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: waId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// BAIXAR O QUE CHEGOU
// ─────────────────────────────────────────────────────────────────────────────
//
// São DOIS passos, e não um: a mensagem traz só o `id` da mídia. Pede-se o
// endereço à Meta, e o endereço só entrega os bytes com o token junto — é uma
// URL da própria Meta, mas não é pública.

export type MidiaMeta = { bytes: Buffer; mime: string | null };

export async function baixarMidiaMeta(
  mediaId: string,
): Promise<Resposta<MidiaMeta>> {
  const env = ambienteMeta();
  if (!env) return { ok: false, erro: "Cloud API não configurada." };

  try {
    const r1 = await fetch(`${BASE}/${mediaId}`, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (!r1.ok)
      return { ok: false, erro: `endereço da mídia: HTTP ${r1.status}` };

    const meta = (await r1.json()) as { url?: string; mime_type?: string };
    if (!meta.url) return { ok: false, erro: "a Meta não devolveu o endereço" };

    const r2 = await fetch(meta.url, {
      headers: { Authorization: `Bearer ${env.token}` },
      signal: AbortSignal.timeout(45_000),
    });
    if (!r2.ok) return { ok: false, erro: `baixar a mídia: HTTP ${r2.status}` };

    const bytes = Buffer.from(await r2.arrayBuffer());
    if (bytes.byteLength === 0)
      return { ok: false, erro: "a mídia veio vazia" };

    return { ok: true, dados: { bytes, mime: meta.mime_type ?? null } };
  } catch (e) {
    return { ok: false, erro: String(e).slice(0, 200) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// A ASSINATURA DO WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// O endereço do webhook é público — tem de ser, a Meta precisa alcançá-lo. Sem
// conferir a assinatura, QUALQUER UM que descubra a URL inventa mensagens de
// qualquer telefone dentro do atendimento da campanha.
//
// A Meta assina o corpo cru com o segredo do aplicativo. Comparar com
// `timingSafeEqual`, e não com `===`: a comparação normal para na primeira letra
// diferente, e essa diferença de tempo é o bastante para adivinhar a assinatura
// byte a byte.
export function assinaturaConfere(corpoCru: string, cabecalho: string | null) {
  const env = ambienteMeta();
  // Sem segredo configurado não há o que conferir. Devolve `false` de propósito:
  // a rota decide se isso tranca ou só avisa, e assim a decisão fica visível
  // num lugar só.
  if (!env?.segredoApp || !cabecalho) return false;

  const esperado =
    "sha256=" +
    crypto
      .createHmac("sha256", env.segredoApp)
      .update(corpoCru, "utf8")
      .digest("hex");

  const a = Buffer.from(cabecalho);
  const b = Buffer.from(esperado);
  if (a.byteLength !== b.byteLength) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// O QUE CHEGA NO WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────
//
// O formato da Meta é bem mais organizado que o do Baileys: existe um campo
// `type` dizendo o que é, em vez de descobrir olhando qual chave existe.
//
//   entry[].changes[].value.messages[]   as mensagens que CHEGARAM
//   entry[].changes[].value.statuses[]   entregue / lido do que SAIU
//   entry[].changes[].value.contacts[]   o nome do perfil de quem mandou

type MidiaPayload = {
  id?: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
};

export type PayloadMeta = {
  object?: string;
  entry?: {
    id?: string;
    changes?: {
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { phone_number_id?: string };
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: {
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          image?: MidiaPayload;
          video?: MidiaPayload;
          audio?: MidiaPayload;
          document?: MidiaPayload;
          sticker?: MidiaPayload;
          location?: { latitude?: number; longitude?: number; name?: string };
          contacts?: unknown[];
          button?: { text?: string };
          interactive?: {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
          // O ANÚNCIO DE ONDE A PESSOA VEIO.
          //
          // Isto é ouro e o não-oficial nunca entregou direito: quando o lead
          // chega por um anúncio de clique-para-WhatsApp, a Meta diz QUAL. É o
          // que preenche `conversas.origem` e faz o filtro de campanha nas
          // métricas deixar de ser uma caixa vazia.
          referral?: {
            source_url?: string;
            source_type?: string;
            source_id?: string;
            headline?: string;
            body?: string;
            ctwa_clid?: string;
          };
          context?: { id?: string; from?: string };
        }[];
        statuses?: {
          id?: string;
          status?: string;
          timestamp?: string;
          recipient_id?: string;
          errors?: { code?: number; title?: string; message?: string }[];
        }[];
      };
    }[];
  }[];
};

const TIPOS: Record<string, MensagemLida["tipo"]> = {
  text: "texto",
  image: "imagem",
  video: "video",
  audio: "audio",
  document: "documento",
  sticker: "figurinha",
  location: "local",
  contacts: "contato",
};

/** O que a rota precisa saber de um payload da Meta, já traduzido. */
export type LeituraMeta = {
  mensagens: (MensagemLida & {
    /** O id da mídia na Meta. É com ele que se baixa depois. */
    midiaId: string | null;
    /** De qual anúncio veio, quando veio de um. */
    origem: string | null;
  })[];
  /** Confirmações de entrega do que a campanha mandou. */
  status: { waId: string; status: string; erro: string | null }[];
};

/**
 * Traduz o payload da Meta para o que o banco já guarda.
 *
 * Um payload pode trazer VÁRIAS mensagens — a Meta agrupa por eficiência.
 * Devolver lista, e não uma só, é o que evita perder as demais silenciosamente
 * num pico de tráfego.
 */
export function lerPayloadMeta(p: PayloadMeta): LeituraMeta {
  const saida: LeituraMeta = { mensagens: [], status: [] };
  if (p?.object !== "whatsapp_business_account") return saida;

  for (const entrada of p.entry ?? []) {
    for (const mudanca of entrada.changes ?? []) {
      const v = mudanca.value;
      if (!v) continue;

      // o nome do perfil, por telefone
      const nomes = new Map<string, string>();
      for (const c of v.contacts ?? []) {
        if (c.wa_id && c.profile?.name) nomes.set(c.wa_id, c.profile.name);
      }

      for (const m of v.messages ?? []) {
        const de = (m.from ?? "").replace(/\D/g, "");
        if (!de || de.length < 10 || de.length > 15) continue;

        const tipo = TIPOS[m.type ?? ""] ?? "outro";
        const anexo =
          m.image ?? m.video ?? m.audio ?? m.document ?? m.sticker ?? null;

        // O texto de cada formato mora num lugar diferente. Botão e lista viram
        // texto porque, para quem atende, é o que a pessoa respondeu.
        const texto =
          m.text?.body ??
          anexo?.caption ??
          m.button?.text ??
          m.interactive?.button_reply?.title ??
          m.interactive?.list_reply?.title ??
          (m.location
            ? `📍 ${m.location.name ?? `${m.location.latitude}, ${m.location.longitude}`}`
            : null) ??
          null;

        // O carimbo vem em SEGUNDOS, como texto.
        const seg = Number(m.timestamp);
        const momento = Number.isFinite(seg)
          ? new Date(seg * 1000).toISOString()
          : new Date().toISOString();

        const r = m.referral;
        const origem = r
          ? (r.headline ?? r.source_id ?? r.source_url ?? "anúncio")
          : null;

        saida.mensagens.push({
          waId: m.id ?? null,
          telefone: de,
          // A API oficial sempre identifica por telefone. O identificador
          // anônimo é coisa do WhatsApp Web, que é onde a Evolution vive.
          lid: null,
          direcao: "inbound",
          tipo,
          texto,
          // A Meta NÃO manda o arquivo no webhook, nem miniatura. Só o id.
          midiaUrl: null,
          previa: null,
          midiaMime: anexo?.mime_type ?? null,
          duracaoSeg: null,
          momento,
          status: null,
          nome: nomes.get(de) ?? null,
          midiaId: anexo?.id ?? null,
          origem,
        });
      }

      for (const s of v.statuses ?? []) {
        if (!s.id) continue;
        saida.status.push({
          waId: s.id,
          status: (s.status ?? "").toUpperCase(),
          erro: s.errors?.[0]?.message ?? s.errors?.[0]?.title ?? null,
        });
      }
    }
  }

  return saida;
}
