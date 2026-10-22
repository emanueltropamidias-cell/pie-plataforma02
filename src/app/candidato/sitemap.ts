import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { ANOS_ELEICAO, idsComVoto } from "@/lib/eleicao-arquivos";
import UFS from "@/lib/ufs.json";

// Lista das páginas públicas de candidato para o Google
// (/candidato/sitemap/<ano>-<UF>-<página>.xml).
//
// Uma lista por ano, estado e página: o Google aceita até 50 mil endereços por
// arquivo, e só São Paulo em 2024 tem perto de 90 mil candidatos com voto.
// Entra só quem teve voto — candidatura sem voto não é o que alguém procura.
//
// O domínio vem de quem pediu a lista: a plataforma responde em mais de um
// endereço, e NEXT_PUBLIC_SITE_URL é o site da campanha, que mora em outro lugar.

export const dynamic = "force-dynamic";

const POR_ARQUIVO = 45_000;
const PAGINAS = 2;
const UNIDADES = ["BR", ...UFS.map((u) => u.uf)];

export async function generateSitemaps() {
  return ANOS_ELEICAO.flatMap((ano) => UNIDADES.flatMap((uf) => Array.from({ length: PAGINAS }, (_, p) => ({ id: `${ano}-${uf}-${p}` }))));
}

export default async function sitemap(props: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const [ano, uf, pagina] = (await props.id).split("-");
  const h = await headers();
  const base = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}`;
  const ids = await idsComVoto(Number(ano), uf);
  const inicio = Number(pagina) * POR_ARQUIVO;
  return ids.slice(inicio, inicio + POR_ARQUIVO).map((id) => ({
    url: `${base}/candidato/${id}`,
    changeFrequency: "yearly",
  }));
}
