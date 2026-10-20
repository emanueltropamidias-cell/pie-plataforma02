import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { enviarAudio, enviarMidia, idDaResposta } from "@/lib/wa";
import { arquivoEmBase64 } from "@/lib/midia";

// Mandar a foto ou o vídeo que já está no balde.
//
// O arquivo subiu direto do navegador (ver /api/atendimento/anexo). Aqui só se
// assina um endereço de leitura, entrega-se à Evolution e grava-se a mensagem.
//
// ── A MESMA REGRA DO TEXTO, DE PROPÓSITO ────────────────────────────────────
//
// Assumir a conversa ao responder, fechar o SLA na primeira resposta, gravar
// quem mandou: tudo isso vale para foto igual vale para frase. Uma atendente
// que responde só com foto não pode sair do relatório nem deixar a conversa
// sem dono.

export const dynamic = "force-dynamic";

/** Dez minutos. A Evolution baixa em segundos; a folga é para a fila dela num
 *  momento de pico, não para o arquivo circular. */
const VALIDADE = 600;

const MIME_PADRAO = {
  imagem: "image/jpeg",
  video: "video/mp4",
  audio: "audio/ogg",
} as const;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: {
    conversaId?: number;
    caminho?: string;
    tipo?: "imagem" | "video" | "audio";
    legenda?: string;
    mime?: string;
    nomeArquivo?: string;
    /** Miniatura em base64, feita no navegador. Só para a foto aparecer na
     *  hora, sem esperar o link assinado. */
    previa?: string;
  };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const conversaId = Number(corpo.conversaId);
  const caminho = (corpo.caminho ?? "").trim();
  const tipo =
    corpo.tipo === "video" ? "video" : corpo.tipo === "audio" ? "audio" : "imagem";
  const legenda = (corpo.legenda ?? "").trim().slice(0, 1000);

  if (!conversaId || !caminho) {
    return NextResponse.json(
      { erro: "Falta a conversa ou o arquivo." },
      { status: 400 },
    );
  }

  const { data: conversa } = await supabase
    .from("conversas")
    .select(
      "id, telefone, primeira_resp_at, atendente_id, instancia, numeros(instancia)",
    )
    .eq("id", conversaId)
    .maybeSingle();
  if (!conversa)
    return NextResponse.json(
      { erro: "Conversa não encontrada." },
      { status: 404 },
    );

  // O CAMINHO TEM DE SER DESTA CONVERSA.
  //
  // Sem esta linha, quem chamasse a rota à mão passaria o caminho do áudio de
  // OUTRA conversa e o faria sair pelo WhatsApp da campanha. A RLS acima prova
  // que a pessoa enxerga ESTA conversa; ela não diz nada sobre o arquivo.
  if (!caminho.startsWith(`${conversa.id}/`)) {
    return NextResponse.json(
      { erro: "Esse arquivo não é desta conversa." },
      { status: 403 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    return NextResponse.json({ erro: "Sem chave de serviço." }, { status: 500 });

  const db = criarServico(url, chave, { auth: { persistSession: false } });

  // Base64 pelo mesmo motivo do kit: a Evolution não busca a URL do Supabase.
  const bruto = await arquivoEmBase64("conversas", caminho);
  if ("erro" in bruto)
    return NextResponse.json(
      { erro: `O arquivo não chegou ao balde: ${bruto.erro}` },
      { status: 500 },
    );

  const mime = (corpo.mime ?? "").split(";")[0].trim() || MIME_PADRAO[tipo];

  // Sai pelo MESMO número por onde a pessoa escreveu. Ver a rota de texto.
  const numeroDaConversa = conversa.numeros as { instancia?: string } | null;

  // ── ÁUDIO NÃO É "MÍDIA COM TIPO ÁUDIO" ──────────────────────────────────
  //
  // A Evolution tem dois caminhos, e a diferença aparece na tela de quem
  // recebe: `sendMedia` entrega um ARQUIVO anexado, com nome e botão de
  // baixar; `sendWhatsAppAudio` entrega uma MENSAGEM DE VOZ, aquela bolha com
  // onda e play, que toca no toque e conta como recado.
  //
  // A atendente que grava um recado espera o segundo. Mandar pelo primeiro
  // funciona — e chega como anexo estranho que o eleitor não abre.
  //
  // `enviarAudio` também não leva legenda: mensagem de voz do WhatsApp não tem
  // esse campo, e o que a atendente escrever junto some sem aviso. Por isso a
  // tela não oferece legenda ao gravar.
  const envio =
    tipo === "audio"
      ? await enviarAudio(
          conversa.telefone,
          bruto.base64,
          numeroDaConversa?.instancia ?? conversa.instancia ?? null,
        )
      : await enviarMidia(
          conversa.telefone,
          tipo === "video" ? "video" : "image",
          bruto.base64,
          {
            legenda,
            mime,
            nomeArquivo: corpo.nomeArquivo,
            instancia: numeroDaConversa?.instancia ?? conversa.instancia ?? null,
          },
        );

  if (!envio.ok) {
    // O arquivo fica no balde mesmo com o envio falhando. É de propósito: se a
    // falha foi passageira, a atendente tenta de novo sem subir 15 MB outra
    // vez. Arquivo órfão custa centavos; reenvio pela rede móvel custa a manhã.
    return NextResponse.json({ erro: envio.erro }, { status: 502 });
  }

  const waId = idDaResposta(envio.dados);
  const agora = new Date().toISOString();

  const gravarMensagem = db.from("mensagens").upsert(
    {
      conversa_id: conversa.id,
      wa_id: waId,
      telefone: conversa.telefone,
      direcao: "outbound",
      tipo,
      texto: legenda || null,
      midia_arquivo: caminho,
      midia_mime: mime,
      // A miniatura chega junto para a bolha desenhar na hora. É a mesma razão
      // pela qual o WhatsApp parece instantâneo: ele mostra o borrão antes de
      // o arquivo existir do outro lado.
      midia_previa: corpo.previa ?? null,
      enviada_por: user.id,
      status: "SENT",
      momento: agora,
    },
    { onConflict: "wa_id", ignoreDuplicates: true },
  );

  const resumo =
    tipo === "audio"
      ? "🎤 Áudio"
      : legenda || (tipo === "video" ? "🎥 Vídeo" : "📷 Foto");

  const patch: Record<string, unknown> = {
    ultima_msg: resumo.slice(0, 240),
    ultima_msg_at: agora,
    ultima_direcao: "outbound",
    atualizado_em: agora,
  };
  if (!conversa.primeira_resp_at) patch.primeira_resp_at = agora;
  if (!conversa.atendente_id) {
    patch.atendente_id = user.id;
    patch.atribuido_em = agora;
  }

  await Promise.all([
    gravarMensagem,
    db.from("conversas").update(patch).eq("id", conversa.id),
  ]);

  if (!conversa.atendente_id) {
    await db.from("atribuicoes").insert({
      conversa_id: conversa.id,
      telefone: conversa.telefone,
      para_atendente: user.id,
      feita_por: user.id,
      motivo: "manual",
      regra: "respondeu primeiro",
    });
  }

  return NextResponse.json({ ok: true, waId, caminho });
}
