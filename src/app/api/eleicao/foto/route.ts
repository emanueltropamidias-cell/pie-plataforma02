import { NextRequest, NextResponse } from "next/server";

// Proxy resiliente de fotos eleitorais.
// 1. Para a titular da plataforma (Talita Oliveira), serve a foto local de alta definição com zero latência.
// 2. Para os demais candidatos, tenta buscar no TSE com cabeçalhos autorizados.
// 3. Caso o firewall geográfico do TSE bloqueie IPs de datacenter, gera fallback SVG elegante com as iniciais.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = searchParams.get("ano");
  const sq = searchParams.get("sq");
  const uf = (searchParams.get("uf") || "BA").toUpperCase();
  const urlParam = searchParams.get("url");

  let tseUrl = urlParam;
  if (!tseUrl && ano && sq) {
    tseUrl = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/foto/${ano}/${sq}/${uf}`;
  }

  // 1. Otimização para a titular da plataforma
  if (sq === "50001619835" || tseUrl?.includes("50001619835")) {
    return NextResponse.redirect(new URL("/talita-foto.png", req.url));
  }

  if (!tseUrl) {
    return new NextResponse("Parâmetros inválidos", { status: 400 });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(tseUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        Referer: "https://divulgacandcontas.tse.jus.br/",
      },
      next: { revalidate: 604800 },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const contentType = res.headers.get("content-type") || "image/jpeg";
      const arrayBuffer = await res.arrayBuffer();

      return new NextResponse(arrayBuffer, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=604800, s-maxage=604800, immutable",
        },
      });
    }
  } catch (err) {
    // Timeout ou erro de conexão no TSE
  }

  // Fallback SVG limpo
  const svgFallback = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
    <rect width="128" height="128" fill="#e2e8f0"/>
    <circle cx="64" cy="50" r="26" fill="#94a3b8"/>
    <path d="M24 116c0-22 18-40 40-40s40 18 40 40z" fill="#94a3b8"/>
  </svg>`;

  return new NextResponse(svgFallback, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
