import { NextResponse, after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ambienteMeta,
  assinaturaConfere,
  lerPayloadMeta,
  marcarLidaMeta,
  type PayloadMeta,
} from "@/lib/meta-wa";
import { lerSugestoes } from "@/lib/cadastro-automatico";
import { guardarMidiaMeta } from "@/lib/midia";

// Onde a conversa entra no PIE, pela porta OFICIAL.
//
// A Meta chama aqui a cada mensagem recebida e a cada mudança de status do que
// saiu. É o gêmeo de /api/whatsapp/evolution, com três diferenças que importam:
//
//   · A ASSINATURA É CONFERIDA. A Meta assina o corpo com o segredo do
//     aplicativo, então dá para PROVAR que a chamada veio dela. O endereço pode
//     ser público sem medo — ao contrário da Evolution, onde a própria URL
//     tinha de ser o segredo porque não havia o que conferir.
//
//   · UM PAYLOAD TRAZ VÁRIAS MENSAGENS. A Meta agrupa. Tratar só a primeira
//     perderia as outras em silêncio, justo no pico de tráfego.
//
//   · A MÍDIA NÃO VEM JUNTO, NEM A MINIATURA. Vem só um id. Em compensação a
//     Meta guarda o arquivo por 14 dias — na Evolution, o que não foi baixado
//     no instante podia sumir para sempre.
//
// Variáveis na Vercel:
//   META_WA_TOKEN          -> token permanente do usuário de sistema
//   META_WA_PHONE_ID       -> o id do número (não é o telefone)
//   META_WA_APP_SECRET     -> segredo do app, para conferir a assinatura
//   META_WA_VERIFY_TOKEN   -> invente; a Meta devolve na hora de cadastrar
//   WA_PROVEDOR=meta       -> manda o envio pela Cloud API

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function resumo(m: { tipo: string; texto: string | null }): string {
  if (m.texto) return m.texto.slice(0, 240);
  const rotulos: Record<string, string> = {
    audio: "🎤 Áudio",
    imagem: "📷 Imagem",
    video: "🎬 Vídeo",
    documento: "📎 Documento",
    figurinha: "Figurinha",
    local: "📍 Localização",
    contato: "👤 Contato",
  };
  return rotulos[m.tipo] ?? "Mensagem";
}

// ─────────────────────────────────────────────────────────────────────────────
// O APERTO DE MÃO
// ─────────────────────────────────────────────────────────────────────────────
//
// Ao cadastrar o webhook, a Meta chama com GET e um desafio. Devolver o desafio
// CRU — sem JSON, sem aspas — é o que prova que o endereço é nosso. Qualquer
// enfeite aqui faz o cadastro falhar com uma mensagem que não explica nada.
export async function GET(req: Request) {
  const env = ambienteMeta();
  const p = new URL(req.url).searchParams;

  const modo = p.get("hub.mode");
  const token = p.get("hub.verify_token");
  const desafio = p.get("hub.challenge");

  if (modo === "subscribe" && env?.verificacao && token === env.verificacao) {
    return new Response(desafio ?? "", {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  // Sem os parâmetros do aperto de mão, serve de teste de vida — sem revelar
  // nada de útil a quem só encontrou o endereço.
  if (!modo) {
    return NextResponse.json({
      ok: true,
      provedor: "meta",
      configurado: !!env,
      confereAssinatura: !!env?.segredoApp,
    });
  }

  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  const env = ambienteMeta();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // 200 mesmo em erro nosso. A Meta desativa webhook que devolve erro com
  // frequência — e aí a campanha para de receber sem ninguém perceber.
  const ok = (extra: Record<string, unknown> = {}) =>
    NextResponse.json({ ok: true, ...extra });

  if (!env || !url || !servico) {
    console.error("meta: faltam META_WA_TOKEN/PHONE_ID ou as chaves do Supabase");
    return ok();
  }

  // O CORPO CRU, ANTES DE VIRAR OBJETO.
  //
  // A assinatura é do texto exatamente como chegou. `JSON.parse` seguido de
  // `JSON.stringify` reordena chaves e muda espaços — e aí a assinatura NUNCA
  // confere, com um sintoma que parece "a Meta está mandando errado".
  const cru = await req.text();

  if (env.segredoApp) {
    if (!assinaturaConfere(cru, req.headers.get("x-hub-signature-256"))) {
      console.error("meta: assinatura não confere, descartada");
      return ok({ ignorada: true });
    }
  } else {
    // Sem segredo, qualquer um que descubra o endereço inventa mensagem de
    // qualquer telefone. Grita no log em vez de aceitar em silêncio.
    console.error(
      "meta: META_WA_APP_SECRET não configurado — o webhook está ACEITANDO SEM CONFERIR",
    );
  }

  let corpo: PayloadMeta;
  try {
    corpo = JSON.parse(cru) as PayloadMeta;
  } catch {
    return ok();
  }

  const leitura = lerPayloadMeta(corpo);
  if (!leitura.mensagens.length && !leitura.status.length)
    return ok({ ignorada: true });

  const supabase = createClient(url, servico, {
    auth: { persistSession: false },
  });

  // ── AS CONFIRMAÇÕES DE ENTREGA ────────────────────────────────────────────
  //
  // "entregue" e "lido" do que a campanha mandou. Não criam conversa nem
  // mensagem: só carimbam o que já existe. Se a mensagem ainda não foi gravada
  // — o status às vezes chega antes — o update não acha nada e segue em frente,
  // que é o certo.
  if (leitura.status.length) {
    await Promise.all(
      leitura.status.map((s) =>
        supabase
          .from("mensagens")
          .update({ status: s.status, midia_erro: s.erro })
          .eq("wa_id", s.waId),
      ),
    );
  }

  let gravadas = 0;

  for (const msg of leitura.mensagens) {
    try {
      const sug = msg.texto
        ? lerSugestoes(msg.texto)
        : { municipio: null, bairro: null, indicou: null };

      const { data: r, error } = await supabase.rpc("receber_mensagem", {
        p_telefone: msg.telefone,
        p_nome: msg.nome,
        p_instancia: "meta",
        p_wa_id: msg.waId,
        p_direcao: msg.direcao,
        p_tipo: msg.tipo,
        p_texto: msg.texto,
        p_resumo: resumo(msg),
        p_midia_url: null,
        p_midia_mime: msg.midiaMime,
        p_duracao: msg.duracaoSeg,
        p_status: msg.status,
        p_momento: msg.momento,
        p_bruto: corpo as unknown as Record<string, unknown>,
        p_municipio_sug: sug.municipio,
        p_bairro_sug: sug.bairro,
        p_indicou: sug.indicou,
      });

      if (error) {
        console.error("meta: falha na ingestão:", error.message);
        continue;
      }

      const res = r as {
        conversa_id: number;
        repetida: boolean;
      } | null;
      if (!res || res.repetida) continue;
      gravadas++;

      // ── DE QUAL ANÚNCIO ELE VEIO ────────────────────────────────────────
      //
      // O não-oficial nunca soube disto. A Meta diz, quando o lead chega por um
      // anúncio de clique-para-WhatsApp — e é o que faz o filtro "origem da
      // campanha" nas métricas deixar de ser uma caixa sempre vazia.
      //
      // Só na PRIMEIRA vez: a segunda mensagem da mesma pessoa não vem com
      // referral, e sobrescrever com nulo apagaria o dado.
      if (msg.origem) {
        await supabase
          .from("conversas")
          .update({ origem: msg.origem })
          .eq("id", res.conversa_id)
          .is("origem", null);
      }

      // ── A MÍDIA, DEPOIS DA RESPOSTA ─────────────────────────────────────
      if (
        ["audio", "imagem", "documento", "video", "figurinha"].includes(msg.tipo)
      ) {
        const midiaId = msg.midiaId;
        const waId = msg.waId;
        const conversaId = res.conversa_id;
        const tipo = msg.tipo;
        after(async () => {
          const tm = Date.now();
          const g = await guardarMidiaMeta(midiaId, waId, conversaId, tipo);
          await supabase
            .from("mensagens")
            .update({ midia_arquivo: g.arquivo, midia_erro: g.erro })
            .eq("wa_id", waId);
          console.log(
            `meta midia ${tipo} ${g.arquivo ? "ok" : "FALHOU"} ${Date.now() - tm}ms bytes=${g.bytes}${g.erro ? ` erro=${g.erro}` : ""}`,
          );
        });
      }

      // As duas tiquinhas azuis. Depois da resposta, porque é cortesia e não
      // pode atrasar a ingestão — mas muda a percepção de quem espera: sem
      // isso a pessoa vê "entregue" por horas e reescreve.
      if (msg.waId) {
        const waId = msg.waId;
        // `void` de propósito: `after` tipa a tarefa pelo que ela devolve, e
        // devolver o resultado da chamada faz o TypeScript exigir que os dois
        // formatos de resposta batam. Aqui o retorno não interessa a ninguém.
        after(async () => {
          await marcarLidaMeta(waId);
        });
      }
    } catch (e) {
      console.error("meta:", e);
    }
  }

  console.log(
    `meta webhook msgs=${leitura.mensagens.length} gravadas=${gravadas} status=${leitura.status.length} ${Date.now() - t0}ms`,
  );
  return ok({ gravadas });
}
