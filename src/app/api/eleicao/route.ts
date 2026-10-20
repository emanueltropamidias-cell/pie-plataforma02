import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buscarCandidatos, destaque, raioX, zonasNaCidade, decodificarId, ANOS_ELEICAO } from "@/lib/eleicao-arquivos";

// ============================================================================
// API DE DADOS ELEITORAIS (TSE, BRASIL INTEIRO)
// ============================================================================
//
// Lê dos arquivos prontos no Storage (src/lib/eleicao-arquivos.ts), não mais
// das tabelas — o país não cabe no Postgres gratuito.
//
//   ?q=alden&ano=2022&uf=BA[&cargo=…][&exato=1]   busca
//   ?candidatoId=<id>[&uf=MG]                     raio-x (uf = mapa do presidente)
//   ?candidatoId=<id>&municipio=SALVADOR          camada municipal
//   ?destaque=1&ano=2024&uf=MG[&cargo=…]          o mais votado
//
// O detalhe por LOCAL de votação (bairro) continua no banco, só para as
// cidades-foco: é pequeno e tem consulta própria.
// ────────────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ erro: "Não autorizado" }, { status: 401 });

  const sp = new URL(request.url).searchParams;
  const idParam = sp.get("candidatoId");
  const id = idParam ? Number(idParam) : NaN;
  const ano = parseInt(sp.get("ano") ?? "2022", 10);
  const uf = sp.get("uf")?.trim().toUpperCase() || null;
  const cargoParam = sp.get("cargo")?.trim().toUpperCase();
  const cargo = cargoParam && cargoParam !== "TODOS" ? cargoParam : null;
  const municipio = sp.get("municipio")?.trim();

  // Camada municipal: zonas do arquivo; locais (com bairro) do banco.
  if (Number.isFinite(id) && municipio) {
    const zonas = await zonasNaCidade(id, municipio);
    const { ano: anoC, chave } = decodificarId(id);
    const { data: cand } = await supabase
      .from("eleicao_candidatos")
      .select("id")
      .eq("ano", anoC)
      .eq("sq_candidato", String(Math.floor(chave / 10)))
      .eq("turno", chave % 10)
      .maybeSingle();
    const { data: det } = cand
      ? await supabase.rpc("obter_detalhe_municipio", { p_candidato_id: cand.id, p_municipio: municipio })
      : { data: null };
    return NextResponse.json({ zonas, locais: det?.locais ?? null, tem_detalhe: det?.tem_detalhe ?? false });
  }

  if (sp.get("destaque") === "1" && uf) {
    const idDestaque = await destaque(ano, uf, cargo);
    if (!idDestaque) return NextResponse.json({ candidato: null });
    return NextResponse.json(await raioX(idDestaque, uf));
  }

  if (Number.isFinite(id)) {
    const r = await raioX(id, uf);
    return r ? NextResponse.json(r) : NextResponse.json({ erro: "Candidato não encontrado" }, { status: 404 });
  }

  const q = sp.get("q")?.trim() ?? "";
  if (!q || !uf) return NextResponse.json({ candidatos: [] });

  const candidatos = await buscarCandidatos({ q, ano, uf, cargo });
  if (candidatos.length || sp.get("exato") === "1") return NextResponse.json({ candidatos });

  // Não achou com os filtros: tenta as outras eleições do mesmo estado (ex.:
  // "Capitão Alden" digitado com 2024 selecionado).
  for (const outro of ANOS_ELEICAO.filter((a) => a !== ano).reverse()) {
    const achados = await buscarCandidatos({ q, ano: outro, uf });
    if (achados.length)
      return NextResponse.json({
        candidatos: achados,
        aviso: "Candidatos encontrados em outras eleições ou cargos disponíveis.",
      });
  }
  return NextResponse.json({ candidatos: [] });
}
