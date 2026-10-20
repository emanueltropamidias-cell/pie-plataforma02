import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// A arte do material, num endereço público — e SÓ ela.
//
// ── POR QUE ESTA ROTA EXISTE ────────────────────────────────────────────────
//
// A prévia do link (aquele cartão com foto que aparece quando alguém manda o
// endereço num grupo) é montada pelo robô do WhatsApp, de fora, sem login. Ele
// busca a imagem por HTTP e vai embora.
//
// A arte da dobradinha está no balde `audios`, que é PRIVADO. Endereço assinado
// não serve: ele expira, e a prévia que o WhatsApp guardou passaria a mostrar
// imagem quebrada dias depois — justamente quando o material já circulou.
//
// ── E POR QUE NÃO ABRIR O BALDE ─────────────────────────────────────────────
//
// Tornar o balde público resolveria em um clique e abriria junto os áudios da
// campanha e a mídia que o eleitor manda — foto de documento, print de
// conversa, o que a pessoa mandou achando que era privado.
//
// Esta rota entrega UMA imagem: a do link que existe, ativo, pelo slug. Não
// aceita caminho de arquivo vindo de fora, então não dá para pedir outra coisa
// do balde por ela.

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return new NextResponse(null, { status: 404 });

  const db = createClient(url, chave, { auth: { persistSession: false } });

  const { data: link } = await db
    .from("links")
    .select("arte, ativo")
    .eq("slug", slug)
    .maybeSingle();

  if (!link?.ativo || !link.arte) return new NextResponse(null, { status: 404 });

  // O caminho vem do BANCO, nunca da URL. É isto que impede pedir
  // `../conversas/algo` por aqui.
  const { data: arquivo, error } = await db.storage
    .from("audios")
    .download(link.arte);

  if (error || !arquivo) return new NextResponse(null, { status: 404 });

  const tipo = link.arte.endsWith(".png")
    ? "image/png"
    : link.arte.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

  return new NextResponse(await arquivo.arrayBuffer(), {
    headers: {
      "Content-Type": tipo,
      // Um dia de cache: a arte de um material impresso não muda, e cada
      // prévia montada de novo é uma leitura a mais no balde.
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
