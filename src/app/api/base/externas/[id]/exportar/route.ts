import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ROTULO_TIPO, TIPOS_BASE, campo, hojeBahia, respostaCSV, telefoneCSV, linhasSoNumeros } from "@/lib/base-tipos";

// A planilha de UMA outra base (a antiga de Talita, a de Manassés…).
//
// Sai só daquela base, pelo id: `base_externa_exportar()` filtra por base_id e
// não lê a base da campanha. Os tipos e o formato são os mesmos da exportação
// da campanha (src/lib/base-tipos.ts), mais as colunas extras que vieram no
// arquivo original — nada do que foi subido se perde na volta.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Linha = {
  telefone: string | null;
  nome: string | null;
  municipio: string | null;
  municipio_a_corrigir: boolean;
  bairro: string | null;
  tipo: string;
  extras: Record<string, unknown>;
};

type Resumo = { nome: string; extras: string[] };

const arquivoDe = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "base";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const tipo = new URL(req.url).searchParams.get("tipo") ?? "";
  if (tipo && !(TIPOS_BASE as readonly string[]).includes(tipo))
    return NextResponse.json({ erro: `tipo precisa ser vazio ou um de: ${TIPOS_BASE.join(", ")}.` }, { status: 400 });

  const { data: resumo, error: erroResumo } = await supabase.rpc("base_externa_resumo", { p_base: id });
  if (erroResumo) return NextResponse.json({ erro: erroResumo.message }, { status: 500 });
  if (resumo == null) return NextResponse.json({ erro: "Base não encontrada, ou você não é da equipe." }, { status: 404 });
  const base = resumo as Resumo;

  const { data: json, error } = await supabase.rpc("base_externa_exportar", { p_base: id, p_tipo: tipo || null });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (json == null) return NextResponse.json({ erro: "Só a equipe exporta a base." }, { status: 403 });
  const linhas = json as Linha[];

  // Registrado antes de sair, e se o registro falhar a exportação falha junto.
  const { error: erroLog } = await supabase.from("exportacoes").insert({
    quem: user.id,
    quem_email: user.email,
    o_que: "base_externa",
    filtros: { base_id: id, base: base.nome, tipo: tipo || "todos" },
    linhas: linhas.length,
  });
  if (erroLog)
    return NextResponse.json({ erro: `Não consegui registrar a exportação: ${erroLog.message}` }, { status: 500 });

  // ?formato=numeros — só a contagem e o telefone, sem repetir ninguém.
  if (new URL(req.url).searchParams.get("formato") === "numeros") {
    return respostaCSV(
      linhasSoNumeros(linhas.map((l) => l.telefone)),
      `numeros-${arquivoDe(base.nome)}${tipo ? `-${tipo}` : ""}-${hojeBahia()}.csv`,
    );
  }

  const extras = base.extras ?? [];
  const cabecalho = ["telefone", "nome", "municipio", "municipio_a_corrigir", "bairro", "tipo", "base", ...extras];
  const corpo = linhas.map((l) =>
    [
      telefoneCSV(l.telefone),
      campo(l.nome),
      campo(l.municipio),
      campo(l.municipio_a_corrigir ? "sim" : ""),
      campo(l.bairro),
      campo(ROTULO_TIPO[l.tipo] ?? l.tipo),
      campo(base.nome),
      ...extras.map((k) => campo(l.extras?.[k])),
    ].join(";"),
  );

  return respostaCSV(
    [cabecalho.map(campo).join(";"), ...corpo],
    `outra-base-${arquivoDe(base.nome)}${tipo ? `-${tipo}` : ""}-${hojeBahia()}.csv`,
  );
}
