import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { responder, type Contexto, type Turno } from "@/lib/pergunta-eleicao";

// Perguntas em português sobre os dados eleitorais (aba Estratégia). A conversa
// com a IA e as ferramentas moram em src/lib/pergunta-eleicao.ts.

export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ erro: "A análise por IA ainda não está configurada (falta a chave da API na Vercel)." }, { status: 400 });

  let corpo: { historico?: Turno[]; contexto?: Contexto };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }
  const historico = (corpo.historico ?? []).filter((m) => m.texto?.trim()).slice(-12);
  if (!historico.length || historico[historico.length - 1].papel !== "usuario")
    return NextResponse.json({ erro: "Sem pergunta." }, { status: 400 });

  try {
    return NextResponse.json(await responder(historico, corpo.contexto));
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return NextResponse.json({ erro: "Muitas perguntas ao mesmo tempo. Tente em instantes." }, { status: 429 });
    if (err instanceof Anthropic.AuthenticationError) return NextResponse.json({ erro: "A chave da IA na Vercel é inválida." }, { status: 502 });
    if (err instanceof Anthropic.APIError) return NextResponse.json({ erro: `Erro da IA (${err.status}).` }, { status: 502 });
    return NextResponse.json({ erro: "Falha de rede ao chamar a IA." }, { status: 502 });
  }
}
