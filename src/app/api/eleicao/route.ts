import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// ============================================================================
// API DE DADOS ELEITORAIS (TSE CONSOLIDADO)
// ============================================================================
//
// 1. Busca Inteligente de Candidatos (Insensível a acentos, multi-eleição):
//    GET /api/eleicao?q=Capitão%20Alden&ano=2022&uf=BA
//
// 2. Raio-X Completo do Candidato (Mapa de Votos + Top Municípios + Métricas):
//    GET /api/eleicao?candidatoId=1627
//
// ────────────────────────────────────────────────────────────────────────────

const CAMPOS =
  "id, ano, turno, uf, nm_ue, cargo, numero, sq_candidato, nome_urna, nome_completo, partido_sigla, situacao, foto_url";

function normalizar(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

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
  const qRaw = searchParams.get("q")?.trim();
  const anoParam = searchParams.get("ano");
  const ano = anoParam ? parseInt(anoParam, 10) : 2022;
  const uf = searchParams.get("uf")?.trim().toUpperCase();
  const cargo = searchParams.get("cargo")?.trim();
  // `exato=1`: quem chama quer aquele ano e aquele número, sem a busca ampla
  // em outras eleições — a troca de ano procura a candidatura da casa assim.
  const exato = searchParams.get("exato") === "1";

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

  // 2. Busca de Candidatos
  const qNorm = qRaw ? normalizar(qRaw) : "";
  const isNumero = qNorm && /^\d+$/.test(qNorm);

  // Tentativa 1: Busca respeitando os filtros selecionados
  let query = supabase
    .from("eleicao_candidatos")
    .select(CAMPOS)
    .order("numero", { ascending: true })
    .limit(40);

  if (ano) {
    query = query.eq("ano", ano);
  }

  if (uf && uf !== "TODAS" && uf !== "BR") {
    query = query.eq("uf", uf);
  }

  if (cargo && cargo !== "TODOS") {
    query = query.ilike("cargo", `%${cargo}%`);
  }

  if (qNorm) {
    if (isNumero) {
      query = query.eq("numero", parseInt(qNorm, 10));
    } else {
      // Divide por palavras para casar "capitao" e "alden" simultaneamente
      const palavras = qNorm.split(/\s+/).filter(Boolean);
      for (const p of palavras) {
        query = query.ilike("chave_busca", `%${p}%`);
      }
    }
  }

  const { data: candidatos, error } = await query;

  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }

  // Se encontrou candidatos com os filtros atuais, retorna
  if (candidatos && candidatos.length > 0) {
    return NextResponse.json({ candidatos });
  }

  // Tentativa 2 (Fallback Inteligente): Se o usuário buscou por nome/número mas não achou
  // (ex: digitou "Capitão Alden" enquanto estava com ano=2026 ou cargo errado selecionado),
  // fazemos uma busca global ampla em todas as eleições e cargos para achar o candidato!
  if (qNorm && !exato) {
    let fallback = supabase
      .from("eleicao_candidatos")
      .select(CAMPOS)
      .order("ano", { ascending: false })
      .order("numero", { ascending: true })
      .limit(30);

    if (isNumero) {
      fallback = fallback.eq("numero", parseInt(qNorm, 10));
    } else {
      const palavras = qNorm.split(/\s+/).filter(Boolean);
      for (const p of palavras) {
        fallback = fallback.ilike("chave_busca", `%${p}%`);
      }
    }

    const { data: achadosFallback } = await fallback;
    if (achadosFallback && achadosFallback.length > 0) {
      return NextResponse.json({
        candidatos: achadosFallback,
        aviso: "Candidatos encontrados em outras eleições ou cargos disponíveis.",
      });
    }
  }

  return NextResponse.json({ candidatos: [] });
}
