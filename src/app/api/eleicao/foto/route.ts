import { NextRequest, NextResponse } from "next/server";

// Proxy seguro de fotos do TSE com cache de 7 dias.
// O TSE bloqueia requisições diretas de navegadores por CORS e ausência de Referer.
// Este endpoint busca a imagem no servidor do TSE com os headers oficiais e a entrega ao navegador.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = searchParams.get("ano");
  const sq = searchParams.get("sq");
  const uf = (searchParams.get("uf") || "BR").toUpperCase();
  const urlParam = searchParams.get("url");

  let tseUrl = urlParam;
  if (!tseUrl && ano && sq) {
    tseUrl = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/foto/${ano}/${sq}/${uf}`;
  }

  if (!tseUrl) {
    return new NextResponse("Parâmetros inválidos", { status: 400 });
  }

  try {
    const res = await fetch(tseUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: "https://divulgacandcontas.tse.jus.br/",
      },
      next: { revalidate: 604800 }, // 7 dias
    });

    if (!res.ok) {
      // Se não achar no TSE, retorna 404
      return new NextResponse("Foto não encontrada", { status: 404 });
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
      },
    });
  } catch (err) {
    console.error("Erro ao buscar foto do TSE:", err);
    return new NextResponse("Erro ao carregar foto", { status: 502 });
  }
}
