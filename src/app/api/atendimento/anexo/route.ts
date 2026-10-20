import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// A permissão para subir um arquivo — e só ela.
//
// ── O ARQUIVO NÃO PASSA POR AQUI ────────────────────────────────────────────
//
// O caminho óbvio seria a atendente mandar a foto para esta rota e esta rota
// repassar. Não funciona, e a falha é dura de diagnosticar depois:
//
//   · a Vercel RECUSA corpo acima de 4,5 MB, com um 413 que a tela mostraria
//     como "falha de rede". Foto de celular tem 3 a 8 MB; vídeo, 10 a 50 MB;
//   · e a função tem 10 segundos no plano atual. Subir 20 MB pela rede móvel de
//     uma atendente em Feira de Santana estoura isso sozinho.
//
// Então esta rota só CONFERE e ASSINA. O navegador recebe um endereço de
// escrita válido por poucos minutos e manda o arquivo direto para o balde do
// Supabase — que existe para isso e não tem esses tetos. A Vercel carrega um
// texto de duzentos caracteres.
//
// O que a assinatura garante: o endereço serve para UM caminho, dentro da
// pasta DAQUELA conversa, e some sozinho. Ninguém escreve fora dele.

export const dynamic = "force-dynamic";

/** Tetos por tipo. O do WhatsApp é 16 MB para vídeo; abaixo dele de propósito,
 *  porque acima disso o próprio WhatsApp recusa e a atendente só descobre
 *  depois de esperar o envio inteiro. */
// Áudio de recado é curto por natureza. 8 MB dá uns 15 minutos em opus — bem
// mais do que qualquer recado de atendimento, e pouco o bastante para subir
// rápido na rede móvel de quem está na rua.
const TETO = {
  imagem: 10 * 1024 * 1024,
  video: 16 * 1024 * 1024,
  audio: 8 * 1024 * 1024,
};

// Lista fechada. Aceitar o que o navegador mandar é como se enche balde de
// arquivo estranho — e `mediatype` da Evolution só entende estes.
const ACEITOS: Record<string, { tipo: "imagem" | "video" | "audio"; ext: string }> = {
  "image/jpeg": { tipo: "imagem", ext: "jpg" },
  "image/png": { tipo: "imagem", ext: "png" },
  "image/webp": { tipo: "imagem", ext: "webp" },
  "video/mp4": { tipo: "video", ext: "mp4" },
  "video/quicktime": { tipo: "video", ext: "mov" },
  "video/3gpp": { tipo: "video", ext: "3gp" },
  // ── O QUE O NAVEGADOR GRAVA ───────────────────────────────────────────────
  //
  // Cada navegador entrega um formato: o Chrome no Android grava `webm` com
  // opus, o Safari no iPhone grava `mp4`. Aceitar os dois é o que faz a
  // gravação funcionar no aparelho que a menina tem na mão, e não só no que
  // testamos aqui.
  //
  // A Evolution converte para o formato de mensagem de voz do WhatsApp — por
  // isso não convertemos nada deste lado.
  "audio/webm": { tipo: "audio", ext: "webm" },
  "audio/ogg": { tipo: "audio", ext: "ogg" },
  "audio/mp4": { tipo: "audio", ext: "m4a" },
  "audio/mpeg": { tipo: "audio", ext: "mp3" },
};

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: { conversaId?: number; mime?: string; bytes?: number };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const conversaId = Number(corpo.conversaId);
  const mime = (corpo.mime ?? "").split(";")[0].trim().toLowerCase();
  const bytes = Number(corpo.bytes);

  const aceito = ACEITOS[mime];
  if (!aceito) {
    return NextResponse.json(
      { erro: "Só dá para mandar foto (JPG, PNG) ou vídeo (MP4, MOV)." },
      { status: 400 },
    );
  }

  const teto = TETO[aceito.tipo];
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return NextResponse.json({ erro: "Arquivo vazio." }, { status: 400 });
  }
  if (bytes > teto) {
    return NextResponse.json(
      {
        erro: `${aceito.tipo === "imagem" ? "A foto" : aceito.tipo === "audio" ? "O áudio" : "O vídeo"} tem ${(bytes / 1024 / 1024).toFixed(1)} MB e o limite é ${teto / 1024 / 1024} MB.`,
      },
      { status: 400 },
    );
  }

  // A RLS decide. Se esta conta não enxerga a conversa, ela também não anexa
  // arquivo nela — e a conferência é a mesma do envio de texto de propósito:
  // duas regras diferentes para o mesmo direito acabam divergindo.
  const { data: conversa } = await supabase
    .from("conversas")
    .select("id, encerrada_em")
    .eq("id", conversaId)
    .maybeSingle();

  if (!conversa)
    return NextResponse.json(
      { erro: "Conversa não encontrada." },
      { status: 404 },
    );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    return NextResponse.json({ erro: "Sem chave de serviço." }, { status: 500 });

  // `env-` na frente separa o que SAIU do que CHEGOU: o recebido é nomeado pelo
  // identificador do WhatsApp, e no dia de investigar uma conversa a olho o
  // prefixo responde "quem mandou isto?" sem abrir o banco.
  const caminho = `${conversa.id}/env-${crypto.randomUUID()}.${aceito.ext}`;

  const admin = criarServico(url, chave, { auth: { persistSession: false } });
  const { data, error } = await admin.storage
    .from("conversas")
    .createSignedUploadUrl(caminho);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { erro: error?.message ?? "Não consegui liberar o envio." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    caminho,
    tipo: aceito.tipo,
    url: data.signedUrl,
    token: data.token,
  });
}
