import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  adivinharColuna,
  lerCSV,
  nomeProprio,
  normalizarTelefone,
} from "@/lib/csv";
import { gerarLinkCode } from "@/lib/link-code";
import { MUNICIPIOS_BA } from "@/lib/municipios-ba";

// Importação de CSV sem passar pela tela: recebe o arquivo, normaliza,
// deduplica por telefone e grava. Feita para rodar de um terminal.
//
// Rodar de novo com o mesmo arquivo é seguro: quem já está na base pelo
// telefone é ignorado, então não duplica.
//
// Variáveis de ambiente na Vercel:
//   IMPORT_TOKEN               -> senha que você inventa, exigida no cabeçalho
//   SUPABASE_SERVICE_ROLE_KEY  -> Supabase > Settings > API
//   NEXT_PUBLIC_SUPABASE_URL   -> já existe

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const MAPA_MUN = new Map(
  MUNICIPIOS_BA.map((m) => [
    m.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(),
    m,
  ]),
);
function municipioOficial(v: string) {
  const k = (v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  return MAPA_MUN.get(k) ?? "";
}

function tokenConfere(recebido: string | null, esperado: string) {
  if (!recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  // timingSafeEqual exige mesmo tamanho; comparar o tamanho antes já vaza o
  // comprimento, que é informação de pouco valor — o conteúdo é o que importa.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const esperado = process.env.IMPORT_TOKEN;
  if (!esperado) {
    return NextResponse.json(
      { erro: "IMPORT_TOKEN não configurado na Vercel." },
      { status: 400 },
    );
  }
  // Comparação de tempo constante, como o webhook do WhatsApp já fazia. Com
  // !== o tempo de resposta varia conforme quantos caracteres bateram, e isso
  // vaza o token letra a letra para quem medir. Pela rede o ruído quase sempre
  // esconde a diferença — mas "quase sempre" não é argumento quando a correção
  // custa três linhas, e o projeto já tinha o padrão certo em outro lugar.
  if (!tokenConfere(req.headers.get("x-import-token"), esperado)) {
    return NextResponse.json({ erro: "Token inválido." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return NextResponse.json(
      { erro: "Faltam as credenciais do Supabase na Vercel." },
      { status: 400 },
    );
  }

  const params = new URL(req.url).searchParams;
  const tipo = params.get("tipo") || "lead";
  const parentId = params.get("lideranca") || null;
  const exigirTelefone = params.get("todos") !== "1";

  const texto = await req.text();
  if (!texto.trim())
    return NextResponse.json({ erro: "Arquivo vazio." }, { status: 400 });

  const { colunas, linhas } = lerCSV(texto);
  if (!colunas.length)
    return NextResponse.json(
      { erro: "Não consegui ler o CSV." },
      { status: 400 },
    );

  const cNome = adivinharColuna(colunas, [
    "nome",
    "nome completo",
    "razao social",
  ]);
  const cTel = adivinharColuna(colunas, [
    "telefone",
    "whatsapp",
    "celular",
    "fone",
  ]);
  const cMun = adivinharColuna(colunas, ["municipio", "cidade"]);
  const cBairro = adivinharColuna(colunas, ["bairro", "distrito"]);
  if (!cNome) {
    return NextResponse.json(
      { erro: "Não achei a coluna de nome.", colunas },
      { status: 400 },
    );
  }

  const supabase = createClient(url, chave, {
    auth: { persistSession: false },
  });

  // Telefones que já existem, para não duplicar ninguém
  const existentes = new Set<string>();
  for (let p = 0; p < 200; p++) {
    const { data, error } = await supabase
      .from("liderancas")
      .select("telefone")
      .not("telefone", "is", null)
      .range(p * 1000, p * 1000 + 999);
    if (error)
      return NextResponse.json({ erro: error.message }, { status: 502 });
    const lote = data ?? [];
    for (const r of lote as { telefone: string | null }[]) {
      const d = (r.telefone ?? "").replace(/\D/g, "");
      if (d) existentes.add(d);
    }
    if (lote.length < 1000) break;
  }

  const novos: Record<string, unknown>[] = [];
  let semNome = 0;
  let semTelefone = 0;
  let repetidos = 0;

  for (const l of linhas) {
    const nome = nomeProprio(l[cNome] ?? "");
    if (!nome) {
      semNome++;
      continue;
    }
    const telefone = cTel ? normalizarTelefone(l[cTel] ?? "") : "";
    if (exigirTelefone && !telefone) {
      semTelefone++;
      continue;
    }
    const digitos = telefone.replace(/\D/g, "");
    if (digitos && existentes.has(digitos)) {
      repetidos++;
      continue;
    }
    if (digitos) existentes.add(digitos);

    const munBruto = cMun ? (l[cMun] ?? "") : "";
    novos.push({
      nome,
      telefone: telefone || null,
      municipio: municipioOficial(munBruto) || nomeProprio(munBruto) || null,
      bairro: cBairro ? nomeProprio(l[cBairro] ?? "") || null : null,
      parent_id: parentId,
      tipo,
      created_via: "importacao",
      link_code: gerarLinkCode(),
    });
  }

  let gravados = 0;
  const LOTE = 500;
  for (let i = 0; i < novos.length; i += LOTE) {
    const { error } = await supabase
      .from("liderancas")
      .insert(novos.slice(i, i + LOTE));
    if (error) {
      return NextResponse.json(
        { erro: error.message, gravados, restantes: novos.length - gravados },
        { status: 502 },
      );
    }
    gravados += Math.min(LOTE, novos.length - i);
  }

  return NextResponse.json({
    ok: true,
    linhas_no_arquivo: linhas.length,
    gravados,
    ja_existiam: repetidos,
    sem_nome: semNome,
    sem_telefone: semTelefone,
    colunas_usadas: {
      nome: cNome,
      telefone: cTel,
      municipio: cMun,
      bairro: cBairro,
    },
  });
}
