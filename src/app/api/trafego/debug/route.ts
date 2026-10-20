import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listarContas } from "@/lib/trafego/meta";

// Rota de diagnóstico: mostra CRU o que a Meta devolve por campanha
// (objetivo, otimização e TODAS as ações com seus valores).
// Serve pra casar o "Resultado" do Gerenciador com o action_type certo.
// Abrir logado em: /api/trafego/debug

const API_VERSION = "v21.0";

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const token = process.env.META_ACCESS_TOKEN;
  if (!token)
    return NextResponse.json({ erro: "Meta não configurado." }, { status: 400 });

  // Qual conta: `?conta=<id>`. Sem ela, a primeira que o token enxerga. Era
  // META_AD_ACCOUNT_ID, a conta única — que deixou de existir quando o PIE
  // passou a ler as cinco (ver src/lib/trafego/meta.ts).
  const pedida = new URL(req.url).searchParams.get("conta")?.replace(/^act_/, "");
  let accountId = pedida ?? "";
  if (!accountId) {
    try {
      accountId = (await listarContas(token))[0]?.id ?? "";
    } catch (e) {
      return NextResponse.json({ erro: (e as Error).message }, { status: 502 });
    }
  }
  if (!accountId)
    return NextResponse.json({ erro: "O token não enxerga nenhuma conta." }, { status: 400 });

  const base = `https://graph.facebook.com/${API_VERSION}/act_${accountId}`;
  const tk = encodeURIComponent(token);

  const until = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
  const d = new Date();
  d.setDate(d.getDate() - 90);
  const since = d.toISOString().slice(0, 10);
  const range = `time_range[since]=${since}&time_range[until]=${until}`;

  const out: Record<string, unknown> = { periodo: { since, until } };

  try {
    const rc = await fetch(
      `${base}?fields=name,account_status,disable_reason,balance,currency&access_token=${tk}`,
      { cache: "no-store" },
    );
    out.conta = await rc.json();

    const rcamp = await fetch(
      `${base}/campaigns?fields=id,name,objective,effective_status,status,daily_budget&limit=50&access_token=${tk}`,
      { cache: "no-store" },
    );
    out.campanhas = await rcamp.json();

    const rset = await fetch(
      `${base}/adsets?fields=id,name,campaign_id,optimization_goal,billing_event,destination_type,effective_status&limit=50&access_token=${tk}`,
      { cache: "no-store" },
    );
    out.conjuntos = await rset.json();

    // O ouro: todas as ações com valores, por campanha
    const rins = await fetch(
      `${base}/insights?level=campaign&fields=campaign_name,spend,impressions,reach,clicks,actions,cost_per_action_type&${range}&limit=50&access_token=${tk}`,
      { cache: "no-store" },
    );
    out.insights = await rins.json();

    // Arte dos anúncios: mostra CRU de onde sai (ou não sai) a imagem de cada criativo.
    // Se o card estiver borrado, é aqui que se vê o porquê — url com /p64x64/ é miniatura.
    const rads = await fetch(
      `${base}/ads?fields=id,name,creative{thumbnail_url,image_url,effective_object_story_id,object_story_spec,asset_feed_spec}` +
        `&thumbnail_width=1080&thumbnail_height=1080&limit=25&access_token=${tk}`,
      { cache: "no-store" },
    );
    const anuncios = await rads.json();
    out.anuncios = anuncios;

    // A parte que faltava: tentar de fato buscar a arte no post original e
    // mostrar CRU o que a Meta responde — inclusive o erro, se houver.
    // Sem isso a gente só sabe que o card está borrado, não o motivo.
    type Ad = { creative?: { effective_object_story_id?: string } };
    const posts = [
      ...new Set(
        ((anuncios?.data ?? []) as Ad[])
          .map((a) => a.creative?.effective_object_story_id)
          .filter(Boolean) as string[],
      ),
    ].slice(0, 5);
    out.posts_tentados = posts;

    if (posts.length) {
      // 1) O caminho que o sync usa hoje
      const rp = await fetch(
        `https://graph.facebook.com/${API_VERSION}/?ids=${posts.map(encodeURIComponent).join(",")}` +
          `&fields=full_picture,picture&access_token=${tk}`,
        { cache: "no-store" },
      );
      out.posts_full_picture = { status: rp.status, corpo: await rp.json() };

      // 2) Alternativa: a imagem dentro do anexo do post, que costuma vir maior
      const ra = await fetch(
        `https://graph.facebook.com/${API_VERSION}/${encodeURIComponent(posts[0])}` +
          `?fields=attachments{media{image{src,width,height}},subattachments}&access_token=${tk}`,
        { cache: "no-store" },
      );
      out.post_attachments = { status: ra.status, corpo: await ra.json() };

      // 3) A Página dona do post — se o token não a enxerga, nada acima funciona
      const rpg = await fetch(
        `https://graph.facebook.com/${API_VERSION}/me/accounts?fields=name,access_token&limit=5&access_token=${tk}`,
        { cache: "no-store" },
      );
      const jpg = await rpg.json();
      out.paginas_do_token = {
        status: rpg.status,
        // nunca devolver o token da Página no diagnóstico
        nomes: (jpg?.data ?? []).map((p: { name?: string; id?: string }) => ({
          id: p.id,
          name: p.name,
        })),
        erro: jpg?.error?.message ?? null,
      };
    }
  } catch (e) {
    out.erro = String(e);
  }

  return NextResponse.json(out);
}
