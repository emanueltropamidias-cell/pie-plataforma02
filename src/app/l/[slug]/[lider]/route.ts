import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ehRobo, impressaoDe } from "@/lib/quem-abriu";
import { CANDIDATO } from "@/lib/candidato";
import { previaDoLink } from "@/lib/previa-do-link";
import { comCaminho, repasseDoLink } from "@/lib/repasse-link";

// O QR de uma LIDERANÇA dentro de um material.
//
// `/l/dobradinha/joao` leva para o mesmo destino que `/l/dobradinha`, e a
// diferença é só a contagem: sem isto, a dobradinha inteira vira um número só e
// ninguém sabe quem espalhou. É essa informação que decide onde a campanha põe
// esforço no mês seguinte.
//
// O destino mora no LINK, e não na liderança, de propósito: quando a dobradinha
// mudar de endereço, troca-se num lugar e os cinquenta QR já impressos das
// lideranças passam a apontar para o novo.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string; lider: string }> },
) {
  const { slug, lider } = await ctx.params;
  const site = CANDIDATO.site;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return NextResponse.redirect(site, 302);

  const db = createClient(url, chave, { auth: { persistSession: false } });

  const { data: link } = await db
    .from("links")
    .select("id, nome, destino, ativo, arte")
    .eq("slug", slug)
    .maybeSingle();

  if (!link || !link.ativo || !link.destino) {
    return NextResponse.redirect(site, 302);
  }

  // QR que foi para outra instalação: repassa com o código da liderança, e a
  // leitura é contada lá (src/lib/repasse-link.ts).
  const repasse = repasseDoLink(link.destino, site);
  if (repasse) return NextResponse.redirect(comCaminho(repasse, lider), 302);

  // O robô de prévia recebe a arte do MATERIAL, e não o redirecionamento — o
  // mesmo tratamento de `/l/[slug]`. A liderança que manda o link dela no grupo
  // espalha a peça da campanha, e o cartão tem de mostrá-la.
  const resposta = previaDoLink({
    slug,
    nome: link.nome,
    temArte: Boolean(link.arte),
    caminho: `${slug}/${lider}`,
    destino: link.destino,
  });


  // A liderança pode não existir — QR antigo, código digitado errado, alguém
  // que saiu da campanha. Nesse caso a leitura conta para o material e o
  // redirecionamento acontece igual: perder a atribuição é ruim, perder a
  // pessoa que escaneou é pior.
  const { data: d } = await db
    .from("link_lideres")
    .select("id")
    .eq("link_id", link.id)
    .eq("codigo", lider)
    .maybeSingle();

  // A MESMA ABERTURA NÃO ENTRA DUAS VEZES. Mesma regra do `/l/[slug]`, e por
  // LIDERANÇA: duas pessoas diferentes espalhando o mesmo material têm cada uma
  // a sua contagem, e a repetição de uma não pode apagar a leitura da outra.
  const impressao = impressaoDe(req);
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: repetida } = await db
    .from("link_leituras")
    .select("id")
    .eq("link_id", link.id)
    .eq("impressao", impressao)
    .eq("referencia", lider)
    .gte("em", desde)
    .limit(1)
    .maybeSingle();
  if (repetida) return resposta;

  await db
    .from("link_leituras")
    .insert({
      link_id: link.id,
      lider_id: d?.id ?? null,
      referencia: lider,
      impressao,
      robo: ehRobo(req.headers.get("user-agent")),
    });

  return resposta;
}
