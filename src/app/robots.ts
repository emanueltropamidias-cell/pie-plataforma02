import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { ANOS_ELEICAO } from "@/lib/eleicao-arquivos";
import UFS from "@/lib/ufs.json";

// O que o Google pode ler: as páginas públicas de candidato. A área logada já
// pede login; a API não é página.

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const unidades = ["BR", ...UFS.map((u) => u.uf)];
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
    sitemap: ANOS_ELEICAO.flatMap((ano) => unidades.flatMap((uf) => [0, 1].map((p) => `${base}/candidato/sitemap/${ano}-${uf}-${p}.xml`))),
  };
}
