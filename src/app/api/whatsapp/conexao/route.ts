import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  configurada,
  estadoDaConexao,
  pedirQR,
  desconectar,
} from "@/lib/evolution";

// A ponte entre a tela de conexão e a Evolution.
//
// A CHAVE NÃO ATRAVESSA. O navegador pede aqui, o servidor fala com a Evolution
// e devolve só o estado e a imagem do QR. Quem tem a chave da Evolution manda
// mensagem pelo número da campanha — ela não tem o que fazer no lado do cliente,
// e é justamente esse o erro que se vê em painel de fornecedor por aí.
//
// Só supervisão. A atendente não reconecta o WhatsApp da campanha.

export const dynamic = "force-dynamic";

async function podeMexer() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.rpc("perfil_supervisao");
  return data === true;
}

export async function GET() {
  if (!(await podeMexer())) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }
  if (!configurada()) {
    return NextResponse.json({
      configurada: false,
      estado: "sem-configuracao",
      instancia: null,
    });
  }
  const r = await estadoDaConexao();
  return NextResponse.json({
    configurada: true,
    estado: r.ok ? (r.dados.instance?.state ?? "desconhecido") : "erro",
    instancia: process.env.EVOLUTION_INSTANCIA ?? null,
    erro: r.ok ? null : r.erro,
  });
}

export async function POST(req: Request) {
  if (!(await podeMexer())) {
    return NextResponse.json({ erro: "Sem permissão." }, { status: 403 });
  }
  if (!configurada()) {
    return NextResponse.json(
      { erro: "Evolution não configurada na Vercel." },
      { status: 400 },
    );
  }

  let acao = "";
  try {
    acao = (await req.json())?.acao ?? "";
  } catch {
    /* corpo vazio: cai no inválido abaixo */
  }

  if (acao === "qr") {
    const r = await pedirQR();
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
    // A Evolution devolve o base64 com o prefixo `data:` em algumas versões e
    // sem ele em outras. Normalizar aqui evita a imagem quebrada que não explica
    // o motivo.
    const cru = r.dados.base64 ?? "";
    const imagem = cru
      ? cru.startsWith("data:")
        ? cru
        : `data:image/png;base64,${cru}`
      : null;
    return NextResponse.json({
      imagem,
      pareamento: r.dados.pairingCode ?? null,
    });
  }

  if (acao === "desconectar") {
    const r = await desconectar();
    if (!r.ok) return NextResponse.json({ erro: r.erro }, { status: 502 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ erro: "Ação inválida." }, { status: 400 });
}
