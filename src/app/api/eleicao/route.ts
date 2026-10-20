import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// API DE DADOS ELEITORAIS (TSE CONSOLIDADO)
// ============================================================================
//
// 1. Busca de Candidatos:
//    GET /api/eleicao?q=talita&ano=2022&uf=BA
//
// 2. Raio-X Completo do Candidato (Mapa de Votos + Top Municípios + Métricas):
//    GET /api/eleicao?candidatoId=1627
//
// ────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const candidatoId = searchParams.get("candidatoId");
  const q = searchParams.get("q")?.trim();
  const ano = parseInt(searchParams.get("ano") || "2022", 10);
  const uf = searchParams.get("uf")?.trim().toUpperCase();

  // 1. Raio-X por Candidato ID
  if (candidatoId) {
    const idNum = parseInt(candidatoId, 10);
    if (isNaN(idNum)) {
      return NextResponse.json({ erro: "ID inválido" }, { status: 400 });
    }

    const { data, error } = await supabase.rpc("obter_raio_x_candidato", {
      p_candidato_id: idNum,
    });

    if (error) {
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  }

  const cargo = searchParams.get("cargo")?.trim();

  // 2. Busca de Candidatos por Nome, Número ou Partido
  let query = supabase
    .from("eleicao_candidatos")
    .select("id, ano, turno, uf, cargo, numero, nome_urna, nome_completo, partido_sigla, situacao, foto_url")
    .eq("ano", ano)
    .order("numero", { ascending: true })
    .limit(40);

  if (uf && uf !== "TODAS" && uf !== "BR") {
    query = query.eq("uf", uf);
  }

  if (cargo && cargo !== "TODOS") {
    query = query.ilike("cargo", `%${cargo}%`);
  }

  if (q) {
    const isNumero = /^\d+$/.test(q);
    if (isNumero) {
      query = query.eq("numero", parseInt(q, 10));
    } else {
      query = query.ilike("chave_busca", `%${q.toLowerCase()}%`);
    }
  }

  const { data: candidatos, error } = await query;

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  return NextResponse.json({ candidatos: candidatos || [] });
}
