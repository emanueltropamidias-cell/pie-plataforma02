import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { campo, hojeBahia, respostaCSV, telefoneCSV, linhasSoNumeros } from "@/lib/base-tipos";

// Todas as bases num arquivo só, uma linha por pessoa.
//
// ── DOIS RECORTES, E O NOME DE CADA UM IMPORTA ──────────────────────────────
//
//   (sem parâmetro)  só as gavetas externas — planilhas e agendas
//   ?tudo=1          TUDO: as gavetas MAIS a base da campanha
//
// 02/10, Emanuel: "quando eu estou baixando a base, de 81 mil está vindo
// somente 63k". Estava certo. O botão dizia "Baixar todas", a tela mostra
// 81.751 pessoas, e o arquivo trazia 63.401 — porque a base da campanha, que é
// quem conversou com os 19 chips e quem está na rede, nunca entrava aqui.
//
// As duas opções ficam, com nome que diz qual é qual. Ver a migração 0053.
//
// ── POR QUE NÃO É A SOMA DAS PLANILHAS ──────────────────────────────────────
//
// Baixar as cinco gavetas e juntar no Excel devolve 58.017 linhas com gente
// repetida: a "Agenda dos aparelhos" tem 3.237 pessoas que também estão no
// Mandato 2023, e a base "Apoiadores" inteira já está nas conversas.
//
// Aqui são 53.326 — cada pessoa uma vez, com uma coluna dizendo de quais bases
// ela veio. É a mesma regra que a somatória da tela usa desde a 0042: contar
// pessoa distinta, nunca somar gaveta com gaveta.
//
// Quem quiser uma base isolada já tem o botão dela. Este arquivo responde a
// pergunta oposta: "me dá todo mundo, sem repetir".

export const dynamic = "force-dynamic";
// 53 mil linhas viram ~5 MB de CSV. O padrão da Vercel corta antes.
export const maxDuration = 60;

type Linha = {
  telefone: string | null;
  nome: string | null;
  municipio: string | null;
  bairro: string | null;
  local: string;
  bases: string | null;
};

const ONDE: Record<string, string> = {
  bahia: "Bahia",
  outro_estado: "outro estado",
  a_corrigir: "cidade a corrigir",
  vazio: "sem cidade",
};

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Não autenticado.", { status: 401 });

  const tudo = new URL(req.url).searchParams.get("tudo") === "1";
  const { data: json, error } = await supabase.rpc(
    tudo ? "base_tudo_exportar" : "bases_externas_exportar_tudo",
  );
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  if (json == null)
    return NextResponse.json({ erro: "Só a equipe exporta as bases." }, { status: 403 });
  const linhas = json as Linha[];

  // Registrado antes de sair, e se o registro falhar a exportação falha junto:
  // 53 mil telefones saindo da plataforma sem deixar rastro é o tipo de coisa
  // que ninguém consegue reconstituir depois.
  const { error: erroLog } = await supabase.from("exportacoes").insert({
    quem: user.id,
    quem_email: user.email,
    o_que: "bases_externas_todas",
    // O registro diz QUAL recorte saiu. Antes os dois gravavam o mesmo texto, e
    // não dava para saber pelo histórico se alguém tinha baixado 43 mil ou 46 mil.
    filtros: {
      tipo: tudo
        ? "base completa: campanha + outras bases, uma linha por pessoa"
        : "só as outras bases, uma linha por pessoa",
    },
    linhas: linhas.length,
  });
  if (erroLog)
    return NextResponse.json(
      { erro: `Não consegui registrar a exportação: ${erroLog.message}` },
      { status: 500 },
    );

  // ?formato=numeros — a lista inteira sem repetir ninguém. Aqui a
  // desduplicação pesa mais que em qualquer outra: o arquivo junta TODAS as
  // bases, e a mesma pessoa está em mais de uma por definição.
  if (new URL(req.url).searchParams.get("formato") === "numeros") {
    return respostaCSV(
      linhasSoNumeros(linhas.map((l) => l.telefone)),
      `numeros-${tudo ? "base-completa" : "outras-bases"}-${hojeBahia()}.csv`,
    );
  }

  const cabecalho = ["telefone", "nome", "municipio", "bairro", "onde", "bases"];
  const corpo = linhas.map((l) =>
    [
      telefoneCSV(l.telefone),
      campo(l.nome),
      campo(l.municipio),
      campo(l.bairro),
      campo(ONDE[l.local] ?? l.local),
      campo(l.bases),
    ].join(";"),
  );

  return respostaCSV(
    [cabecalho.map(campo).join(";"), ...corpo],
    `${tudo ? "base-completa" : "outras-bases"}-${hojeBahia()}.csv`,
  );
}
