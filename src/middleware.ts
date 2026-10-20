import { createServerClient } from "@supabase/ssr";
import { ehPermitidoNoSubdominio } from "@/lib/portas";
import { NextResponse, type NextRequest } from "next/server";

// Mantém a sessão renovada entre as páginas — e decide, pelo ENDEREÇO, se
// aquela visita é da plataforma inteira ou só do atendimento.
//
// ── O SUBDOMÍNIO ────────────────────────────────────────────────────────────
//
// `atendimento.talitaoliveiraoficial.com` serve o MESMO aplicativo, mas com uma
// porta só: a caixa de entrada. Qualquer outro endereço ali dentro devolve para
// /atendimento/caixa.
//
// Isto é conveniência e enquadramento, NÃO é a trava. Quem protege de verdade é
// a RLS no banco e o papel da conta: mesmo digitando o domínio principal, a
// atendente não alcança Lideranças nem Tráfego, porque `perfil_equipe()` é falso
// para ela. O subdomínio existe para que ela não precise nem ver que aquilo
// existe — a ferramenta dela abre no que ela faz.

// A lista mora em src/lib/portas.ts — ver lá por que não pode ser escrita aqui.

export function ehSubdominioAtendimento(host: string | null): boolean {
  return (host ?? "").toLowerCase().startsWith("atendimento.");
}

/**
 * Quem está logado — com teto de paciência.
 *
 * `getUser()` é uma ida à rede ao servidor de autenticação. Quando ele
 * engasga, esta chamada fica pendurada e leva o middleware junto; a Vercel
 * corta em 25s e a plataforma inteira devolve 504.
 *
 * 2,5s é folga larga: a resposta saudável leva menos de 200ms.
 */
async function usuarioDaSessao(
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ user: { id: string } | null; authExpirou: boolean }> {
  let alarme: ReturnType<typeof setTimeout> | undefined;
  try {
    const r = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, rejeitar) => {
        alarme = setTimeout(() => rejeitar(new Error("auth-lenta")), 2500);
      }),
    ]);
    return { user: r.data.user, authExpirou: false };
  } catch {
    return { user: null, authExpirou: true };
  } finally {
    if (alarme) clearTimeout(alarme);
  }
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // UMA vez por requisição, e o resultado é reaproveitado embaixo. É uma
  // chamada de REDE ao servidor de autenticação, não uma conta local.
  //
  // ── AUTENTICAÇÃO LENTA NÃO PODE DERRUBAR A PLATAFORMA INTEIRA ─────────────
  //
  // Esta é a linha que produziu o 504 de 12/09 e de novo em 14/09, às 10h35,
  // com a equipe toda trabalhando:
  //
  //     504 GATEWAY_TIMEOUT · MIDDLEWARE_INVOCATION_TIMEOUT
  //
  // Quando o serviço de autenticação do Supabase fica lento (medido: 4,7s →
  // 15,7s → sem resposta), o middleware fica esperando. A Vercel corta em 25s
  // e devolve 504 — para TODA página, inclusive as que nem dependem de login.
  // Uma peça lenta derrubava o prédio.
  //
  // Agora ele desiste em 2,5 segundos e segue sem saber quem é. Isso é seguro
  // porque o middleware NÃO é a tranca: no domínio principal ele apenas lê o
  // usuário e põe um cabeçalho; quem barra visitante é a própria página, que
  // faz a sua verificação, e o RLS do banco por baixo. Sem o nome de quem
  // entrou, o pior que acontece é a pessoa ver a tela de login.
  //
  // Lento vira degradado, não vira queda.
  const { user, authExpirou } = await usuarioDaSessao(supabase);

  const caminho = request.nextUrl.pathname;

  // Sem saber quem entrou, NÃO decidir para onde mandar. Tratar o desconhecido
  // como "não é atendente" jogaria a equipe inteira para fora do subdomínio
  // justamente no momento em que a autenticação está ruim — trocar uma queda
  // por um desvio em massa não é conserto.
  if (!authExpirou && ehSubdominioAtendimento(request.headers.get("host"))) {
    if (!ehPermitidoNoSubdominio(caminho)) {
      // ── QUEM NÃO É ATENDENTE NÃO PODE FICAR PRESO AQUI ────────────────────
      //
      // Antes todo mundo era jogado na caixa, sem olhar o papel. O Diego foi
      // promovido a admin e continuava chegando na tela de atendimento: ele
      // tinha entrado pelo subdomínio, e o subdomínio não perguntava quem era.
      //
      // A conta consulta o papel SÓ neste ramo — o de endereço bloqueado, que é
      // exceção. O caminho normal da atendente (a caixa) não paga por isso.
      let ehAtendente = false;
      if (user) {
        const { data } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();
        ehAtendente = data?.role === "atendente";
      }

      const destino = request.nextUrl.clone();

      if (ehAtendente) {
        // Para ela o enquadramento continua valendo: uma porta só.
        destino.pathname = "/atendimento/caixa";
      } else {
        // Para os outros, o mesmo endereço no domínio principal. Devolver para
        // a caixa seria trancar quem tem a chave do prédio inteiro.
        const host = request.headers.get("host") ?? "";
        destino.host = host.replace(/^atendimento\./i, "");
        destino.port = "";
      }

      return NextResponse.redirect(destino);
    }
  }

  // O caminho viaja num cabeçalho porque o layout do servidor não o enxerga
  // sozinho, e é ele quem sabe o PAPEL de quem entrou — a decisão de mandar a
  // atendente de volta para /caixa precisa das duas informações no mesmo lugar.
  if (authExpirou) supabaseResponse.headers.set("x-auth-lenta", "1");
  supabaseResponse.headers.set("x-caminho", caminho);
  return supabaseResponse;
}

export const config = {
  matcher: [
    // ── O QUE NÃO PASSA POR AQUI ───────────────────────────────────────────
    //
    // `api/whatsapp` é o WEBHOOK: quem bate nele é a Evolution, com a chave
    // dela, e não existe sessão de usuário para conferir. Mesmo assim o
    // middleware chamava `getUser()` — uma ida à rede, ao servidor de
    // autenticação do Supabase, para validar um login que não existe.
    //
    // São 600 mensagens por hora. Seiscentas idas à toa, competindo pelo mesmo
    // serviço que as atendentes usam para entrar — e que caiu duas vezes hoje,
    // levando a plataforma junto com 504.
    //
    // Tirar o webhook daqui faz duas coisas: alivia o serviço de autenticação e
    // tira um salto de rede do caminho de CADA mensagem que entra.
        // ── ÁUDIO TAMBÉM É ARQUIVO ESTÁTICO ───────────────────────────────────
    //
    // 29/09: o som da urna não tocava, e a causa estava aqui. A lista tinha
    // imagem e não tinha som: `/urna-tecla.wav` batia no middleware, que
    // devolvia 308 em vez do arquivo. O <audio> recebia um redirecionamento
    // onde esperava PCM, e falhava calado.
    //
    // Entraram wav, mp3, ogg e m4a — as quatro que um navegador toca.
    //
    // ── A CONTAGEM DO BOTÃO DO GRUPO TAMBÉM SAI DAQUI ─────────────────────
    //
    // `api/1022` recebe um beacon de quem NÃO TEM CONTA, disparado no instante
    // em que a aba está indo para o WhatsApp. Passar pelo middleware faria uma
    // ida ao servidor de autenticação do Supabase para validar uma sessão que
    // não existe — o mesmo desperdício que tirou o webhook desta lista, e
    // competindo pelo mesmo serviço que as atendentes usam para entrar.
    "/((?!_next/static|_next/image|favicon.ico|api/whatsapp|api/versao|api/1022|.*\\.(?:svg|png|jpg|jpeg|gif|webp|wav|mp3|ogg|m4a)$).*)",
  ],
};
