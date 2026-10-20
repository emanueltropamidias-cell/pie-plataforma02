import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ehRobo, impressaoDe } from "@/lib/quem-abriu";
import { CANDIDATO } from "@/lib/candidato";
import { previaDoLink } from "@/lib/previa-do-link";
import { repasseDoLink } from "@/lib/repasse-link";

// A ponte do QR impresso.
//
// ── POR QUE UMA ROTA, E NÃO UMA PÁGINA ──────────────────────────────────────
//
// Página carrega React, fonte, CSS — e quem escaneou está com o celular na mão,
// no meio da rua, no 3G do comício. Cada segundo aqui é gente desistindo.
//
// Rota devolve um 302 e o navegador já sai. É a diferença entre "abriu na hora"
// e "travou".
//
// ── E POR QUE 302, E NÃO 301 ────────────────────────────────────────────────
//
// 301 é permanente: o navegador GRAVA o destino e nas próximas vezes nem passa
// por aqui. Trocar o destino depois não alcançaria quem já leu uma vez — e a
// razão desta rota existir é justamente poder trocar. 302 pergunta sempre.

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ slug: string }> },
) {
  const { slug } = await ctx.params;
  const site = CANDIDATO.site;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return NextResponse.redirect(site, 302);

  // CHAVE DE SERVIÇO porque quem escaneia NÃO TEM CONTA. A tabela fica fechada
  // para o navegador e só esta rota, no servidor, a alcança.
  const db = createClient(url, chave, { auth: { persistSession: false } });

  const { data: link } = await db
    .from("links")
    .select("id, nome, destino, ativo, arte")
    .eq("slug", slug)
    .maybeSingle();

  // ── LINK QUE NÃO EXISTE VAI PARA O SITE ───────────────────────────────────
  //
  // E não para um 404. Quem leu o QR está com o material da campanha na mão;
  // uma tela de erro faz a pessoa achar que o material é falso. O site responde
  // a mesma pergunta que ela tinha.
  if (!link || !link.ativo || !link.destino) {
    return NextResponse.redirect(site, 302);
  }

  // QR que foi para outra instalação: só repassa, sem contar aqui
  // (src/lib/repasse-link.ts).
  const repasse = repasseDoLink(link.destino, site);
  if (repasse) return NextResponse.redirect(repasse, 302);

  // A LEITURA É CONTADA ANTES DO REDIRECIONAMENTO, e sem `await` bloqueante
  // seria pior: se a gravação falhar, a pessoa não pode ficar esperando. Mas
  // também não dá para soltar e sair — a função morre com a resposta. O insert
  // é uma linha, e custa menos que o próprio DNS do destino.
  const impressao = impressaoDe(req);
  const robo = ehRobo(req.headers.get("user-agent"));

  // ── O ROBÔ DE PRÉVIA RECEBE HTML; A PESSOA, O REDIRECIONAMENTO ────────────
  //
  // Quem manda o link num grupo espera ver o cartão com a arte da dobradinha.
  // O robô que monta esse cartão chegava aqui e levava um 302 para o
  // `api.whatsapp.com` — não há OG nenhum num redirecionamento, então o link
  // saía como retângulo cinza, ou pior, com a foto genérica do site.
  //
  // Ele não é gente e não tem pressa: pode receber HTML. A pessoa continua
  // saindo no 302, que é o que faz o QR abrir na hora no 3G do comício.
  //
  // A leitura NÃO é contada aqui — o robô já foi marcado como `robo` acima e
  // sai antes do insert, porque prévia montada não é gente que escaneou.
  // TODO MUNDO recebe o HTML com as marcas, e não só quem se identifica como
  // robô — ver o porquê em `previa-do-link.ts`. A pessoa é redirecionada pelo
  // próprio HTML, em duas formas, e nem chega a ver a página.
  const resposta = previaDoLink({
    slug,
    nome: link.nome,
    temArte: Boolean(link.arte),
    caminho: slug,
    destino: link.destino,
  });


  // ── A MESMA ABERTURA NÃO ENTRA DUAS VEZES ─────────────────────────────────
  //
  // Uma leitura de QR gera mais de uma abertura sem nenhuma pessoa a mais do
  // outro lado: a câmera abre a prévia e a pessoa toca, o navegador refaz o
  // pedido, o WhatsApp busca o link para montar o cartão. Nos dados de hoje há
  // dez casos de duas aberturas no MESMO MINUTO.
  //
  // Meia hora é a janela: curta o bastante para não engolir a pessoa que
  // escaneou de manhã e voltou à tarde, longa o bastante para cobrir a
  // repetição técnica, que acontece em segundos.
  //
  // A repetição é DESCARTADA, e não marcada: guardar linha que nenhuma conta
  // usa é encher a tabela de coisa que só serve para alguém somar por engano
  // um dia.
  const desde = new Date(Date.now() - 30 * 60_000).toISOString();
  const { data: repetida } = await db
    .from("link_leituras")
    .select("id")
    .eq("link_id", link.id)
    .eq("impressao", impressao)
    .gte("em", desde)
    .limit(1)
    .maybeSingle();

  if (!repetida) {
    await db.from("link_leituras").insert({
      link_id: link.id,
      impressao,
      robo,
    });
  }

  return resposta;
}
