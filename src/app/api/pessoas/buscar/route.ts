import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Busca por nome para o campo de autor da demanda.
//
// A tela carregava as ~29 mil pessoas só para filtrar oito no navegador. Agora
// pergunta ao banco conforme a atendente digita, e volta o que cabe na lista.

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ pessoas: [] }, { status: 401 });

  // Vírgula e parênteses quebram a sintaxe de filtro do PostgREST
  const q = (new URL(req.url).searchParams.get("q") ?? "")
    .trim()
    .replace(/[(),]/g, " ")
    .slice(0, 60);
  if (q.length < 2) return NextResponse.json({ pessoas: [] });

  // Contato anônimo do QR fica de fora: é clique, não pessoa identificada.
  const { data } = await supabase
    .from("liderancas")
    .select("id, nome, municipio, bairro")
    .neq("tipo", "contato")
    .ilike("nome", `%${q}%`)
    .order("nome")
    .limit(8);

  return NextResponse.json({ pessoas: data ?? [] });
}
