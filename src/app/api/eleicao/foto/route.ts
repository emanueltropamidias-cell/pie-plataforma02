import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

// Proxy oficial de fotos da urna do TSE.
// 1. Para a titular (Talita Oliveira), entrega diretamente a foto oficial da URNA (talita-urna.jpg).
// 2. Para os demais candidatos da Bahia, entrega as fotos oficiais da URNA descompactadas em public/urna.
// 3. Para candidatos de outras UFs, consulta o CDN oficial com cabeçalhos autorizados.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = searchParams.get("ano");
  let sq = searchParams.get("sq");
  const uf = (searchParams.get("uf") || "BA").toUpperCase();
  const urlParam = searchParams.get("url");

  let tseUrl = urlParam;
  if (!tseUrl && ano && sq) {
    tseUrl = `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/foto/${ano}/${sq}/${uf}`;
  }

  // Extrai o SQ se veio na URL
  if (!sq && tseUrl) {
    const match = tseUrl.match(/\/(\d{11,12})\/?/);
    if (match) sq = match[1];
  }

  // 1. Candidata Titular (Talita Oliveira 1022) -> Foto oficial da urna do TSE
  if (sq === "50001619835" || tseUrl?.includes("50001619835")) {
    const fotoUrnaPath = path.resolve(process.cwd(), "public/talita-urna.jpg");
    if (fs.existsSync(fotoUrnaPath)) {
      const buffer = fs.readFileSync(fotoUrnaPath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  }

  // 2. Fotos oficiais da urna disponíveis localmente (public/urna)
  if (sq) {
    const possiveisNomes = [
      `F${uf}${sq}_div.jpg`,
      `F${uf}${sq}_div.jpeg`,
      `FBA${sq}_div.jpg`,
      `FBA${sq}_div.jpeg`,
      `${sq}.jpg`,
      `${sq}.jpeg`,
    ];

    for (const nome of possiveisNomes) {
      const arqPath = path.resolve(process.cwd(), "public/urna", nome);
      if (fs.existsSync(arqPath)) {
        const buffer = fs.readFileSync(arqPath);
        return new NextResponse(buffer, {
          headers: {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }
  }

  // 3. Fallback online para outros estados
  if (tseUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(tseUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          Referer: "https://divulgacandcontas.tse.jus.br/",
        },
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
    } catch {
      // Continua para fallback SVG
    }
  }

  // 4. Fallback padrão limpo
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
