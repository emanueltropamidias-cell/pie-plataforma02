import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rotuloOrigem } from "@/lib/origem-cadastro";
import { ROTULO_TIPO, campo, dataCSV as data, hojeBahia, linhasSoNumeros, respostaCSV, telefoneCSV } from "@/lib/base-tipos";

// A planilha da Base, nos três tipos.
//
// Sai com a MESMA regra do número da central — `base_exportar()` e
// `base_resumo()` casam telefone do mesmo jeito. Planilha que diz um total e
// painel que diz outro é o defeito que abriu esta demanda: o 12.502 de Métricas
// que não somava com o 9.117 da base.
//
//   ?tipo=               os tipos com telefone — o total da central
//   ?tipo=completos      nome, telefone e município da Bahia
//   ?tipo=outro_estado   cadastrado com cidade de outro estado (pelo cadastro, não pelo DDD)
//   ?tipo=sem_municipio  nome e telefone, sem município ou com município a corrigir
//   ?tipo=so_numero      conversou e não foi registrado
//   ?tipo=sem_telefone   fichas sem telefone
//
// Formato de planilha em português, como as outras exportações do PIE: BOM,
// ponto e vírgula, e ="dígitos" no telefone para o Excel não virar notação
// científica.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Os rótulos dos tipos moram em src/lib/base-tipos.ts, junto com os das outras bases.
//
// O arquivo sem filtro se chamava `base-completa`, o MESMO nome que
// `/api/base/externas/exportar-tudo?tudo=1` dá ao arquivo com campanha + outras
// bases. Dois arquivos de tamanhos diferentes com nome igual na pasta de
// downloads: em 03/10, no Manassés, o de 9.542 passou pelo de 46.666.
const ARQUIVO_TIPO: Record<string, string> = {
  "": "base-campanha",
  completos: "base-1-completos-bahia",
  outro_estado: "base-outro-estado",
  sem_municipio: "base-2-sem-municipio",
  so_numero: "base-3-so-numero",
  sem_telefone: "base-sem-telefone",
};

type Linha = {
  telefone: string | null;
  nome: string | null;
  municipio: string | null;
  bairro: string | null;
  tipo: string;
  municipio_a_corrigir?: boolean;
  origem: string | null;
  ultima_conversa: string | null;
  cadastro: string | null;
};

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const bruto = new URL(req.url).searchParams.get("tipo") ?? "";
  if (!(bruto in ARQUIVO_TIPO))
    return NextResponse.json({ erro: `tipo precisa ser vazio ou um de: ${Object.keys(ARQUIVO_TIPO).filter(Boolean).join(", ")}.` }, { status: 400 });
  const tipo = bruto === "" ? null : bruto;

  const { data: json, error } = await supabase.rpc("base_exportar", { p_tipo: tipo });
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  // Nulo = a função recusou: quem pediu não é da equipe.
  if (json == null) return NextResponse.json({ erro: "Só a equipe exporta a base." }, { status: 403 });
  const linhas = json as Linha[];

  // Registrado ANTES de o arquivo sair, e se o registro falhar a exportação
  // falha junto — é a regra das outras exportações: base com milhares de
  // telefones não sai sem rastro.
  const { error: erroLog } = await supabase.from("exportacoes").insert({
    quem: user.id,
    quem_email: user.email,
    o_que: "base",
    filtros: { tipo: bruto || "todos" },
    linhas: linhas.length,
  });
  if (erroLog)
    return NextResponse.json({ erro: `Não consegui registrar a exportação: ${erroLog.message}` }, { status: 500 });

  // ?formato=numeros — só a contagem e o telefone, sem repetir ninguém.
  // Para subir público na Meta ou carregar disparador; ver base-tipos.ts.
  if (new URL(req.url).searchParams.get("formato") === "numeros") {
    return respostaCSV(
      linhasSoNumeros(linhas.map((l) => l.telefone)),
      `numeros-${ARQUIVO_TIPO[bruto]}-${hojeBahia()}.csv`,
    );
  }

  const cabecalho = ["telefone", "nome", "municipio", "municipio_a_corrigir", "bairro", "tipo", "origem", "ultima_conversa", "cadastrado_em"];
  const corpo = linhas.map((l) =>
    [
      telefoneCSV(l.telefone),
      campo(l.nome),
      campo(l.municipio),
      campo(l.municipio_a_corrigir ? "sim" : ""),
      campo(l.bairro),
      campo(ROTULO_TIPO[l.tipo] ?? l.tipo),
      campo(l.tipo === "so_numero" ? "Conversou, sem cadastro" : rotuloOrigem(l.origem)),
      campo(data(l.ultima_conversa)),
      campo(data(l.cadastro)),
    ].join(";"),
  );

  return respostaCSV([cabecalho.join(";"), ...corpo], `${ARQUIVO_TIPO[bruto]}-${hojeBahia()}.csv`);
}
