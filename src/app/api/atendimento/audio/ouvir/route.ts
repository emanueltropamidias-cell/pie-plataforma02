import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Ouvir um áudio da biblioteca ANTES de mandar.
//
// Existe porque áudio errado não se recolhe. Mandar o de agradecimento para
// quem acabou de reclamar do posto de saúde é pior do que não mandar nada — e o
// título sozinho não impede isso quando são doze áudios parecidos e a pessoa
// está com pressa.
//
// O link vale cinco minutos e é conferido contra a RLS a cada pedido: o balde é
// privado, e áudio de campanha circulando fora de contexto é material para
// adversário.

export const dynamic = "force-dynamic";

const VALIDADE = 300;

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const id = Number(new URL(req.url).searchParams.get("a"));
  if (!Number.isFinite(id) || id <= 0)
    return NextResponse.json({ erro: "Falta o áudio." }, { status: 400 });

  // Passa pela RLS: quem não enxerga a biblioteca não ouve nada dela.
  const { data: audio } = await supabase
    .from("materiais")
    .select("id, arquivo, mime")
    .eq("id", id)
    .maybeSingle();

  if (!audio)
    return NextResponse.json({ erro: "Áudio não encontrado." }, { status: 404 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    return NextResponse.json({ erro: "Sem chave de serviço." }, { status: 500 });

  const admin = criarServico(url, chave, { auth: { persistSession: false } });
  const { data, error } = await admin.storage
    .from("audios")
    .createSignedUrl(audio.arquivo, VALIDADE);

  if (error || !data?.signedUrl)
    return NextResponse.json(
      { erro: error?.message ?? "Não consegui gerar o link." },
      { status: 500 },
    );

  return NextResponse.json({ url: data.signedUrl, mime: audio.mime });
}
