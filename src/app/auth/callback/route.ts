import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Recebe o retorno do Supabase e troca o código por uma sessão.
//
// Hoje quem passa por aqui é o link de redefinição de senha. O login social foi
// retirado da plataforma; esta rota continua porque a recuperação depende dela.
//
// Quando dá errado, o Supabase manda a pessoa de volta com ?error na URL. Isso
// caía num redirecionamento mudo para /login — a tela piscava e voltava ao
// mesmo lugar, sem uma palavra sobre o que houve. Agora o motivo viaja junto.

/** Traduz os códigos do Supabase para uma frase que ajuda quem leu. */
function motivo(codigo: string | null, descricao: string | null) {
  const c = (codigo ?? "").toLowerCase();
  const d = (descricao ?? "").toLowerCase();

  if (c.includes("otp_expired") || d.includes("expired"))
    return "Esse link já expirou. Peça um novo em “Esqueci minha senha”.";
  if (c === "access_denied" || d.includes("access_denied"))
    return "O link não foi aceito. Peça um novo em “Esqueci minha senha”.";
  return "Não conseguimos concluir. Peça um novo link em “Esqueci minha senha”.";
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  // O texto cru vai junto, num segundo parâmetro. A frase traduzida serve para
  // quem só quer entrar; o detalhe serve para quem vai consertar — sem ele, um
  // erro fora da lista vira "não conseguimos" e não sobra por onde começar.
  const voltar = (texto: string, detalhe?: string | null) => {
    const p = new URLSearchParams({ erro: texto });
    if (detalhe) p.set("det", detalhe.slice(0, 160));
    return NextResponse.redirect(`${origin}/login?${p.toString()}`);
  };

  const erro = searchParams.get("error") ?? searchParams.get("error_code");
  if (erro) {
    const descricao = searchParams.get("error_description");
    return voltar(motivo(erro, descricao), `${erro}: ${descricao ?? ""}`);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    return voltar(motivo(null, error.message), error.message);
  }

  return NextResponse.redirect(`${origin}/login`);
}
