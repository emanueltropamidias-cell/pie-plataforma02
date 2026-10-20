import { NextRequest, NextResponse } from "next/server";

// Foto de urna que ainda não está no Storage, buscada no TSE.
//
// O caminho normal NÃO passa aqui: as fotos sobem para o bucket `urna` com
// `scripts/subir-fotos-urna.mjs`, e a tela usa o endereço direto (ver
// `fotoDoCandidato` em `src/lib/eleicao.ts`). Esta rota cobre o que ainda não
// subiu.
//
// Antes ela aceitava `?url=` qualquer e buscava do servidor — um proxy aberto,
// sem login, para qualquer endereço da internet. Agora o endereço é montado
// aqui, só para o TSE, a partir de três campos conferidos.
//
// Ela também lia `public/urna/` com `fs`, o que só funciona na máquina: na
// Vercel o `public/` vai para a CDN e não existe dentro da função.

const SEM_FOTO = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" fill="#e2e8f0"/>
  <circle cx="64" cy="50" r="26" fill="#94a3b8"/>
  <path d="M24 116c0-22 18-40 40-40s40 18 40 40z" fill="#94a3b8"/>
</svg>`;

function semFoto() {
  return new NextResponse(SEM_FOTO, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = searchParams.get("ano") ?? "";
  const sq = searchParams.get("sq") ?? "";
  const uf = (searchParams.get("uf") ?? "").toUpperCase();

  if (!/^20\d\d$/.test(ano) || !/^\d{6,15}$/.test(sq) || !/^[A-Z]{2}$/.test(uf)) return semFoto();

  try {
    const res = await fetch(
      `https://divulgacandcontas.tse.jus.br/divulga/rest/v1/candidatura/buscar/foto/${ano}/${sq}/${uf}`,
      {
        signal: AbortSignal.timeout(3500),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
          Referer: "https://divulgacandcontas.tse.jus.br/",
        },
        next: { revalidate: 604800 },
      },
    );
    const tipo = res.headers.get("content-type") ?? "";
    if (res.ok && /^image\/(jpeg|png|webp)$/.test(tipo.split(";")[0])) {
      return new NextResponse(await res.arrayBuffer(), {
        headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=604800, s-maxage=604800" },
      });
    }
  } catch {
    // TSE fora ou recusando: cai no retrato vazio.
  }
  return semFoto();
}
