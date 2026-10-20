import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// O endereço temporário de um arquivo.
//
// ── POR QUE NÃO ENTREGAR O LINK DIRETO ──────────────────────────────────────
//
// O balde é privado. Se ele fosse público, bastaria alguém saber o endereço
// para ouvir o áudio de qualquer eleitor — e endereço vaza em print, em log de
// servidor, no histórico do navegador de um computador compartilhado.
//
// Aqui a permissão é conferida a cada pedido, contra a conversa: quem não
// enxerga a conversa pela RLS não recebe o link do áudio dela. E o link vale
// alguns minutos, o suficiente para tocar e não o bastante para virar arquivo
// circulando por aí.

export const dynamic = "force-dynamic";

/** Cinco minutos. Dá para ouvir e rever; não dá para guardar e distribuir. */
const VALIDADE = 300;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get("m"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ erro: "Falta a mensagem." }, { status: 400 });
  }

  // A leitura passa pela RLS de propósito: é ela quem decide se esta conta
  // enxerga a conversa. Sem isso, qualquer conta logada pediria o áudio de
  // qualquer pessoa só variando o número.
  const { data: msg } = await supabase
    .from("mensagens")
    .select("id, midia_arquivo, midia_mime, midia_erro")
    .eq("id", id)
    .maybeSingle();

  if (!msg)
    return NextResponse.json(
      { erro: "Mensagem não encontrada." },
      { status: 404 },
    );
  if (!msg.midia_arquivo) {
    return NextResponse.json(
      { erro: msg.midia_erro ?? "Esta mensagem não tem arquivo guardado." },
      { status: 404 },
    );
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return NextResponse.json(
      { erro: "Sem chave de serviço." },
      { status: 500 },
    );
  }

  // ── DE QUAL BALDE ─────────────────────────────────────────────────────────
  //
  // Quase tudo mora em `conversas`. A exceção é o áudio da Talita: ele é
  // material de campanha, reusado em mil conversas, e mora em `audios` — copiar
  // o arquivo para dentro de cada conversa encheria o balde com mil cópias do
  // mesmo minuto de voz.
  //
  // O prefixo `audios:` no caminho é quem diz isso. Sem ele, a busca cairia no
  // balde errado e a bolha viria quebrada, sem nada apontando o motivo.
  const daBiblioteca = msg.midia_arquivo.startsWith("audios:");
  const balde = daBiblioteca ? "audios" : "conversas";
  const caminho = daBiblioteca
    ? msg.midia_arquivo.slice("audios:".length)
    : msg.midia_arquivo;

  const admin = criarServico(url, chave, { auth: { persistSession: false } });
  const { data, error } = await admin.storage
    .from(balde)
    .createSignedUrl(caminho, VALIDADE);

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { erro: error?.message ?? "Não consegui gerar o link." },
      { status: 500 },
    );
  }

  return NextResponse.json({ url: data.signedUrl, mime: msg.midia_mime });
}
