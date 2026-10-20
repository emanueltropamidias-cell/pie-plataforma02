import { createClient } from "@/lib/supabase/server";
import { paginar } from "@/lib/paginar";
import { rotuloOrigem } from "@/lib/origem-cadastro";
import { linhasSoNumeros } from "@/lib/base-tipos";

// A planilha dos munícipes.
//
// ── O QUE FAZ UM CSV ABRIR CERTO NO EXCEL EM PORTUGUÊS ──────────────────────
//
// Três detalhes, e errar qualquer um estraga o arquivo de um jeito que a pessoa
// culpa o sistema:
//
//   BOM no começo. Sem ele o Excel lê UTF-8 como Latin-1 e "João" vira "JoÃ£o"
//   na tela inteira.
//
//   PONTO E VÍRGULA como separador. O Excel em português usa a vírgula como
//   separador decimal, então um CSV com vírgula abre com tudo numa coluna só.
//
//   ="5571999998888" no telefone. Número puro com 13 dígitos o Excel converte
//   para notação científica — 5,57199E+12 — e o telefone se perde para sempre.
//   A fórmula obriga a tratar como texto.
//
// ── O FILTRO DA TELA VAI JUNTO ──────────────────────────────────────────────
//
// Exportar ignorando o filtro é a armadilha clássica: a pessoa filtra Salvador,
// clica em exportar, e recebe a base inteira sem perceber. Depois manda para a
// equipe achando que é a lista de Salvador.

export const dynamic = "force-dynamic";

function csv(v: string | null | undefined) {
  const s = (v ?? "").replace(/"/g, '""');
  return `"${s}"`;
}

/** America/Bahia, e não a hora do servidor — que roda em outro fuso. */
function data(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const p = new URL(req.url).searchParams;
  const q = (p.get("q") ?? "").trim().replace(/[(),]/g, " ").slice(0, 60);
  const municipio = (p.get("municipio") ?? "").trim();
  const vinculo = p.get("vinculo") ?? "";

  const linhas = await paginar<{
    nome: string | null;
    telefone: string | null;
    municipio: string | null;
    bairro: string | null;
    tipo: string | null;
    created_via: string | null;
    created_at: string | null;
    parent: { nome: string | null } | null;
  }>((de, ate) => {
    let c = supabase
      .from("liderancas")
      .select(
        "nome, telefone, municipio, bairro, tipo, created_via, created_at, parent:parent_id(nome)",
      )
      .in("tipo", ["lead", "lideranca"]);

    if (q) c = c.or(`nome.ilike.%${q}%,telefone.ilike.%${q}%,bairro.ilike.%${q}%`);
    if (municipio) c = c.eq("municipio", municipio);
    if (vinculo === "sem") c = c.is("parent_id", null);
    if (vinculo === "com") c = c.not("parent_id", "is", null);

    // Ordem fixa: sem ela o Postgres não promete a mesma sequência entre
    // páginas, e a planilha sai com linha repetida ou faltando.
    return c.order("municipio", { nullsFirst: false }).order("nome").range(de, ate);
  });


  const cabecalho = [
    // A CONTAGEM TEM DE ESTAR NA LINHA, não só no rodapé.
    //
    // O total já vinha no nome do arquivo e no fim da planilha, mas quem abre
    // no Excel, filtra uma coluna ou manda um recorte por WhatsApp perde os
    // dois — e aí não dá para dizer quantas pessoas são sem selecionar tudo e
    // olhar a barra de status. Com o Nº na primeira coluna, o último número
    // visível responde sozinho.
    "Nº",
    "Nome",
    "Telefone",
    "Município",
    "Bairro",
    "Tipo",
    "Como entrou",
    "Vinculado a",
    "Entrou em",
  ];

  const corpo = linhas.map((l, i) => {
    const digitos = (l.telefone ?? "").replace(/\D/g, "");
    return [
      csv(String(i + 1)),
      csv(l.nome),
      // A fórmula é o que impede o Excel de transformar em notação científica.
      digitos ? `="${digitos}"` : '""',
      csv(l.municipio),
      csv(l.bairro),
      csv(l.tipo === "lideranca" ? "Liderança" : "Munícipe"),
      csv(rotuloOrigem(l.created_via)),
      csv(l.parent?.nome),
      csv(data(l.created_at)),
    ].join(";");
  });

  // O total no nome do arquivo e no fim da planilha. Ver o comentário em
  // /api/atendimento/contatos — mesma razão.
  const liderancas = linhas.filter((l) => l.tipo === "lideranca").length;
  const comCidade = linhas.filter((l) => (l.municipio ?? "").trim()).length;

  const vazia = new Array(cabecalho.length).fill('""').join(";");
  const resumo = [
    vazia,
    ['""', csv("TOTAL DE PESSOAS"), csv(String(linhas.length))].join(";"),
    ['""', csv("Lideranças"), csv(String(liderancas))].join(";"),
    ['""', csv("Com município"), csv(String(comCidade))].join(";"),
  ];

  // ?formato=numeros — só a contagem e o telefone, sem repetir ninguém, e sem
  // o rodapé de totais: linha de resumo no meio de uma lista de telefones vira
  // linha inválida em qualquer coisa que leia o arquivo.
  //
  // O filtro da tela continua valendo, como no formato completo. Exportar
  // ignorando o filtro é a armadilha clássica — e aqui seria pior: uma lista
  // sem nome nem cidade não deixa ninguém perceber que veio a base inteira.
  const soNumeros = new URL(req.url).searchParams.get("formato") === "numeros";

  const texto = soNumeros
    ? "﻿" + linhasSoNumeros(linhas.map((l) => l.telefone)).join("\r\n")
    : "﻿" + [cabecalho.map(csv).join(";"), ...corpo, ...resumo].join("\r\n");

  const hoje = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Bahia" });
  const sufixo = municipio ? `-${municipio.replace(/[^\p{L}\d]+/gu, "-")}` : "";
  const nome = `${soNumeros ? "numeros" : "municipes"}${sufixo}-${linhas.length}-${hoje.replace(/\//g, "-")}.csv`;

  return new Response(texto, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nome}"`,
      "Cache-Control": "no-store",
    },
  });
}
