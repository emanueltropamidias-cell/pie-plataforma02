import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ehRobo, impressaoDe } from "@/lib/quem-abriu";

// O clique no botão do grupo, contado.
//
// ── POR QUE UMA ROTA, E NÃO O REDIRECIONAMENTO DE /l/[slug] ─────────────────
//
// `/l/grupo-1022` contaria isto sozinho, sem código novo. Mas ele devolve uma
// página de prévia e manda a pessoa dali para o WhatsApp — um pulo a mais no
// botão mais importante do site, no exato instante em que ela decidiu entrar.
//
// Esse pulo custa caro onde a campanha mais recebe gente: no navegador interno
// do Instagram e do Facebook, cadeia de redirecionamento com `target="_blank"`
// às vezes abre aba em branco e a pessoa volta. Trocar conversão por métrica é
// o pior negócio possível — a métrica existe para aumentar a conversão.
//
// Então o botão continua apontando DIRETO para o grupo, e a contagem vem por
// fora, sem entrar no caminho de ninguém.
//
// ── `sendBeacon`, E O QUE ACONTECE SE ELE FALHAR ────────────────────────────
//
// O navegador entrega o beacon mesmo que a página seja abandonada no mesmo
// instante — é para isso que ele existe. Se falhar, a pessoa entra no grupo
// do mesmo jeito e o que se perde é uma linha de contagem. A ordem de
// importância é essa, e está escrita assim no cliente também.
//
// ── LINHA POR PESSOA, E NÃO POR TOQUE ───────────────────────────────────────
//
// A mesma janela de 30 minutos do QR (`/l/[slug]`), pelo mesmo motivo medido
// lá: a pessoa toca, acha que não pegou, toca de novo. Com o botão é ainda
// mais provável — ele abre outra aba, e voltar para a página com o botão
// pulsando na cara convida ao segundo toque.
//
// A repetição é DESCARTADA, e não marcada. Guardar linha que nenhuma conta usa
// é encher a tabela de coisa que alguém vai somar por engano um dia.

export const dynamic = "force-dynamic";

/** De onde a pessoa tocou. Texto fechado: campo livre vindo do navegador é
 *  campo que um dia chega com qualquer coisa dentro. */
const ORIGENS = new Set(["barra", "botao"]);

export async function POST(req: Request) {
  // Sempre 204, aconteça o que acontecer. Quem chama é um beacon disparado no
  // momento em que a aba está indo embora: não há ninguém para ler um erro, e
  // devolver 500 só encheria o log de ruído sobre algo que não tem conserto do
  // lado de cá.
  const ok = new NextResponse(null, { status: 204 });

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !chave) return ok;

    // CHAVE DE SERVIÇO porque quem clica NÃO TEM CONTA. `links` e
    // `link_leituras` só são legíveis por supervisão; esta rota, no servidor, é
    // a única porta que o navegador tem para elas.
    const db = createClient(url, chave, { auth: { persistSession: false } });

    let origem = "botao";
    try {
      const corpo = (await req.json()) as { onde?: unknown };
      if (typeof corpo?.onde === "string" && ORIGENS.has(corpo.onde)) {
        origem = corpo.onde;
      }
    } catch {
      // beacon sem corpo, ou corpo torto: conta como o botão do meio, que é o
      // caminho normal. Perder a origem é melhor que perder o clique.
    }

    const { data: link } = await db
      .from("links")
      .select("id")
      .eq("slug", "grupo-1022")
      .maybeSingle();

    // Sem a linha do link não há o que contar. Criar uma aqui seria deixar uma
    // rota pública escrever em `links` — e a migração 0051 já a cria.
    if (!link) return ok;

    const impressao = impressaoDe(req);
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
        // Robô não clica em botão — mas a rota é pública, e quem varre a
        // internet manda POST em tudo que acha. Marcado, `placar_qr` o tira da
        // conta de pessoas sozinho, como já faz com a prévia do WhatsApp.
        robo: ehRobo(req.headers.get("user-agent")),
        referencia: origem,
      });
    }
  } catch {
    // Contagem nunca derruba nada.
  }

  return ok;
}
