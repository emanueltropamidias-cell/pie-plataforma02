import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { linhasSoNumeros } from "@/lib/base-tipos";

// A planilha das pessoas.
//
// ── QUATRO DETALHES QUE DECIDEM SE A PLANILHA PRESTA ────────────────────────
//
// Não são preciosismo: sem qualquer um deles, o arquivo abre torto e alguém
// perde a manhã copiando célula por célula.
//
//   1. BOM no começo. Sem os três bytes iniciais, o Excel em português lê o
//      arquivo como se fosse da década de 90 e "São Gonçalo" vira "SÃ£o
//      GonÃ§alo" em toda linha.
//
//   2. PONTO E VÍRGULA, não vírgula. O Excel em português usa `;` como
//      separador. Com vírgula, a planilha inteira cai numa coluna só — e a
//      pessoa conclui que o sistema exportou errado.
//
//   3. TELEFONE COMO TEXTO. `5571988887777` é um número de treze dígitos: o
//      Excel mostra 5,57199E+12 e, pior, ARREDONDA. O telefone volta errado e
//      ninguém percebe até a mensagem não chegar. A forma `="..."` sobrevive no
//      Excel e no Google Planilhas.
//
//   4. DATA NO FUSO DA BAHIA. O banco guarda em UTC. Sem converter, toda
//      conversa da noite aparece no dia seguinte.

export const dynamic = "force-dynamic";

/** Escapa para CSV. Aspas dobram; campo com separador, aspas ou quebra vai entre aspas. */
function campo(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** `="55719..."` — a única forma que segura dígitos como texto nos dois programas. */
function comoTexto(v: string | null): string {
  if (!v) return "";
  return `"=""${v.replace(/"/g, "")}"""`;
}

function bonito(t: string): string {
  const d = (t ?? "").replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11)
    return `+55 ${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10)
    return `+55 ${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`;
  return t ?? "";
}

function quando(iso: string | null): string {
  if (!iso) return "";
  // `sv-SE` devolve "2026-08-25 16:33"; viramos para o dia/mês/ano que se lê
  // aqui. Fazer isso à mão com getDate() usaria o fuso do servidor, que na
  // Vercel é UTC.
  const s = new Date(iso).toLocaleString("sv-SE", {
    timeZone: "America/Bahia",
  });
  const [data, hora] = s.split(" ");
  const [a, m, d] = data.split("-");
  return `${d}/${m}/${a} ${(hora ?? "").slice(0, 5)}`;
}

const COLUNAS = [
  "telefone",
  "telefone_digitos",
  "nome",
  "municipio",
  "bairro",
  "origem_campanha",
  "tipo",
  "status",
  "demandas",
  "departamento",
  "atendente",
  "chegou_em",
  "primeira_resposta_em",
  "ultima_mensagem_em",
  "total_mensagens",
  "indicado_por",
  // AS DUAS COLUNAS, porque são duas perguntas diferentes e confundir uma com
  // a outra é o que a regra do crédito veio resolver: "atendente" é quem está
  // com a conversa; "cadastrado_por" é quem levou o crédito do lead.
  "cadastrado_por",
  "cadastrado_na_base",
];

export async function GET(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  const { data: pode } = await supabase.rpc("perfil_supervisao");
  if (!pode) {
    return NextResponse.json(
      { erro: "Exportar é da coordenação. Fale com um supervisor." },
      { status: 403 },
    );
  }

  const p = new URL(req.url).searchParams;
  const dias = p.get("dias");
  const atendente = p.get("atendente");
  const municipio = p.get("municipio");
  const origem = p.get("origem");

  // ── DIA FECHADO, IGUAL À TELA ─────────────────────────────────────────────
  //
  // Antes só existia `dias`, e ele só sabia contar para trás a partir de agora.
  // "Ontem" e "Escolher dia" não cabiam nisso: a tela mandava `dias=ontem`,
  // `Number("ontem")` dava NaN, `Number.isFinite` era falso e o filtro era
  // PULADO — a planilha saía com a base inteira, sem erro e sem aviso, depois
  // de a pessoa ter escolhido um dia só.
  //
  // A Bahia é UTC-3 o ano todo, sem horário de verão, então a borda do dia é
  // exata escrita assim. Nada de `new Date()` com fuso do servidor, que na
  // Vercel é UTC e jogaria as três primeiras horas da noite para o dia errado.
  const dataOk = (v: string | null) => (/^\d{4}-\d{2}-\d{2}$/.test(v ?? "") ? v! : null);
  const deDia = dataOk(p.get("de"));
  const ateDia = dataOk(p.get("ate")) ?? deDia;

  // Nomes vêm de tabelas pequenas e viram mapa: um `join` por linha faria a
  // consulta crescer junto com a base, e aqui a base cresce mil por dia.
  const [{ data: atendentes }, { data: setores }] = await Promise.all([
    supabase.from("atendentes").select("id, nome"),
    supabase.from("departamentos").select("id, nome"),
  ]);
  const nomeAtendente = new Map((atendentes ?? []).map((a) => [a.id, a.nome]));
  const nomeSetor = new Map((setores ?? []).map((d) => [d.id, d.nome]));

  function recorte() {
    // ── A MESMA REGRA DE CRÉDITO DA TELA ──────────────────────────────────
    //
    // Aqui era `.eq("atendente_id", ...)` — uma TERCEIRA definição de
    // "creditado a", diferente da tela e do gráfico. Quem exportasse depois de
    // filtrar por pessoa recebia uma planilha que não batia com o número que
    // acabou de ver, e a planilha é o que vai para a coordenação.
    //
    // `conversas_creditadas` é `conversas` mais quem trabalhou nela. Só entra
    // COM filtro por pessoa: sem ele a conversa se repete uma vez por
    // trabalhador, e a planilha sairia com gente duplicada.
    let q = supabase
      .from(atendente ? "conversas_creditadas" : "conversas")
      // Lista de colunas numa STRING SÓ: o supabase-js lê esse texto em tempo
      // de tipo, e concatenação com "+" vira `string` genérica — aí o resultado
      // deixa de ser tipado e o build quebra.
      // prettier-ignore
      .select(
        "telefone, nome, municipio, bairro, origem, tipo, status_lead, demandas, departamento_id, atendente_id, cadastrado_por, primeira_msg_at, primeira_resp_at, ultima_msg_at, total_mensagens, indicado_por, cadastrado_em, criado_em",
      )
      .order("primeira_msg_at", { ascending: false, nullsFirst: false });

    // Intervalo de datas manda: é o recorte mais específico, e é o único que
    // "Ontem" e "Escolher dia" conseguem expressar.
    if (deDia && ateDia) {
      q = q
        .gte("primeira_msg_at", `${deDia}T00:00:00-03:00`)
        .lte("primeira_msg_at", `${ateDia}T23:59:59.999-03:00`);
    } else if (dias && dias !== "tudo") {
      const n = Number(dias);
      // `dias` que não é número nem "tudo" chegou aqui sem ninguém saber
      // traduzir. Antes caía fora do `if` e virava "exporta tudo", calado.
      // Agora estoura, e quem exportar vê o erro em vez de levar a base
      // inteira para a coordenação achando que é o recorte da tela.
      if (!Number.isFinite(n)) {
        throw new Error(`período não reconhecido na exportação: "${dias}"`);
      }
      const corte =
        n === 0
          ? (() => {
              const d = new Date(
                new Date().toLocaleString("en-US", {
                  timeZone: "America/Bahia",
                }),
              );
              d.setHours(0, 0, 0, 0);
              return d.toISOString();
            })()
          : new Date(Date.now() - n * 86_400_000).toISOString();
      q = q.gte("primeira_msg_at", corte);
    }
    if (atendente) q = q.eq("creditada_a", atendente);
    if (municipio) q = q.eq("municipio", municipio);
    if (origem) q = q.eq("origem", origem);
    return q;
  }

  // Em páginas de mil: o PostgREST devolve no máximo mil por chamada, e uma
  // exportação de trinta dias a mil leads por dia é trinta mil linhas. Pedir
  // tudo de uma vez traria mil e a planilha sairia truncada EM SILÊNCIO, que é
  // o pior jeito de errar num arquivo que alguém vai usar para trabalhar.
  const TETO = 50_000;
  const linhas: string[] = [];
  // Os telefones crus, para o ?formato=numeros. Recolhidos no MESMO laço: uma
  // segunda consulta poderia trazer conjunto diferente — a paginação corre
  // enquanto a equipe atende, e conversa nova entra no meio.
  const fones: (string | null)[] = [];
  let de = 0;

  while (de < TETO) {
    const { data, error } = await recorte().range(de, de + 999);
    if (error) {
      return NextResponse.json({ erro: error.message }, { status: 500 });
    }
    if (!data || data.length === 0) break;

    for (const c of data) {
      fones.push(c.telefone);
      linhas.push(
        [
          campo(bonito(c.telefone)),
          comoTexto(c.telefone),
          campo(c.nome),
          campo(c.municipio),
          campo(c.bairro),
          campo(c.origem),
          campo(c.tipo === "disparo" ? "disparo" : "lead"),
          campo(c.status_lead),
          campo((c.demandas ?? []).join(" | ")),
          campo(
            c.departamento_id ? (nomeSetor.get(c.departamento_id) ?? "") : "",
          ),
          campo(
            c.atendente_id
              ? (nomeAtendente.get(c.atendente_id) ?? "")
              : "sem dono",
          ),
          campo(quando(c.primeira_msg_at ?? c.criado_em)),
          campo(quando(c.primeira_resp_at)),
          campo(quando(c.ultima_msg_at)),
          campo(c.total_mensagens ?? 0),
          campo(c.indicado_por),
          campo(
            c.cadastrado_por ? (nomeAtendente.get(c.cadastrado_por) ?? "") : "",
          ),
          campo(c.cadastrado_em ? "sim" : "nao"),
        ].join(";"),
      );
    }

    if (data.length < 1000) break;
    de += 1000;
  }

  // O registro é gravado ANTES de o arquivo sair. Se falhar, a exportação
  // falha junto: base saindo sem rastro é exatamente o que este registro
  // existe para impedir.
  const { error: erroLog } = await supabase.from("exportacoes").insert({
    quem: user.id,
    quem_email: user.email,
    o_que: "conversas",
    filtros: { dias, atendente, municipio, origem },
    linhas: linhas.length,
  });
  if (erroLog) {
    return NextResponse.json(
      {
        erro:
          erroLog.code === "42P01" || erroLog.code === "PGRST205"
            ? "A tabela de exportações não existe: esta instalação está incompleta, faltam as migrações de supabase/migrations/."
            : `Não consegui registrar a exportação: ${erroLog.message}`,
      },
      { status: 500 },
    );
  }

  const hoje = new Date().toLocaleDateString("sv-SE", {
    timeZone: "America/Bahia",
  });
  // ?formato=numeros — só a contagem e o telefone, sem repetir ninguém. O
  // registro em `exportacoes` acima já aconteceu: o rastro vale para os dois
  // formatos, e é a mesma base saindo.
  const soNumeros = new URL(req.url).searchParams.get("formato") === "numeros";
  const corpo = soNumeros
    ? linhasSoNumeros(fones)
    : [COLUNAS.join(";"), ...linhas];
  const csv = "﻿" + corpo.join("\r\n") + "\r\n";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${soNumeros ? "numeros" : "pessoas"}-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
