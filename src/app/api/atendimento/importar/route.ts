import { NextResponse, after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { importarConversas } from "@/lib/importar-conversas";

// O botão "Importar" do card do número.
//
// A lógica mora em `src/lib/importar-conversas.ts`, porque o webhook chama a
// mesma coisa sozinho quando um número volta a conectar. Aqui fica só o que é
// da web: permissão, validação do que veio na requisição, e responder rápido.
//
// A janela padrão é curta de propósito. A instância da Boneca tem 5 mil
// conversas, quase todas do WhatsApp pessoal que veio junto no primeiro
// pareamento — anos de contatos que nunca falaram com a campanha. Importar
// tudo encheria a fila das meninas de gente que não é lead.

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: podeMexer } = await supabase.rpc("perfil_supervisao");
  if (!podeMexer)
    return NextResponse.json(
      { erro: "Só a coordenação importa conversa." },
      { status: 403 },
    );

  let corpo: { instancia?: string; dias?: number };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const instancia = (corpo.instancia ?? "").trim();
  const dias = Math.min(Math.max(Number(corpo.dias) || 2, 1), 30);
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instancia))
    return NextResponse.json({ erro: "Número inválido." }, { status: 400 });

  const r = await importarConversas(instancia, dias);
  if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });

  // Responde na hora com o que achou; a gravação acontece depois. Seiscentas
  // conversas passam de dez segundos, e a tela não pode ficar pendurada.
  if (r.gravar) after(r.gravar);

  return NextResponse.json({
    ok: true,
    achadas: r.achadas,
    aviso: r.aviso,
    dias,
  });
}
