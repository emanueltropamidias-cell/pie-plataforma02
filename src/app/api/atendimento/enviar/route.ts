import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { enviarTexto, idDaResposta } from "@/lib/wa";

// A atendente responde por aqui.
//
// ── POR QUE NÃO GRAVAR A MENSAGEM E DEIXAR O WEBHOOK CONFIRMAR ──────────────
//
// A Evolution avisa de volta tudo que sai, com fromMe. Seria tentador só
// disparar e esperar o eco chegar no webhook para gravar. Duas coisas quebram:
//
//   · o eco leva de centenas de milissegundos a segundos, e nesse intervalo a
//     tela fica sem a mensagem que a atendente acabou de mandar — ela reescreve,
//     e a pessoa recebe duas vezes;
//   · o eco não sabe QUEM da equipe mandou. Ele vem do WhatsApp, que só conhece
//     o número da campanha. Sem gravar aqui, `enviada_por` fica sempre nulo e o
//     relatório por atendente não existe.
//
// Então grava aqui, com autor, e o `wa_id` que a Evolution devolve faz o eco
// esbarrar na chave única quando chegar — em vez de virar mensagem duplicada.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: { conversaId?: number; texto?: string; respondeA?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const texto = (corpo.texto ?? "").trim();
  const conversaId = Number(corpo.conversaId);
  // O endereço da mensagem citada. Vazio é o normal — a maioria não cita.
  const respondeA = (corpo.respondeA ?? "").trim() || null;
  if (!conversaId || !texto) {
    return NextResponse.json(
      { erro: "Falta a conversa ou o texto." },
      { status: 400 },
    );
  }
  if (texto.length > 4000) {
    return NextResponse.json(
      { erro: "Mensagem longa demais." },
      { status: 400 },
    );
  }

  // A leitura passa pela RLS de propósito: se esta conta não enxerga a conversa,
  // ela também não responde por ela.
  // `numeros(instancia)` junto de propósito: a resposta precisa sair pelo MESMO
  // número por onde a pessoa escreveu. Buscar em separado seria uma ida ao
  // banco a mais em cada mensagem enviada.
  const { data: conversa } = await supabase
    .from("conversas")
    .select(
      "id, telefone, primeira_resp_at, atendente_id, instancia, numeros(instancia)",
    )
    .eq("id", conversaId)
    .maybeSingle();
  if (!conversa)
    return NextResponse.json(
      { erro: "Conversa não encontrada." },
      { status: 404 },
    );

  // A tabela manda; `conversas.instancia` é a rede de segurança para a conversa
  // antiga que ainda não foi ligada a um número.
  const numero = conversa.numeros as { instancia?: string } | null;
  const instancia = numero?.instancia ?? conversa.instancia ?? null;

  // ── A CITADA ──────────────────────────────────────────────────────────────
  //
  // O WhatsApp precisa da chave E do texto da original para desenhar a tarja no
  // aparelho de quem recebe. Buscamos aqui, e DENTRO da conversa: citar uma
  // mensagem de outra conversa seria vazar conteúdo entre atendimentos.
  //
  // Se a citada não for encontrada, a mensagem sai SEM citação em vez de
  // falhar. Perder a tarja é pequeno; não responder é grande.
  let citar: { waId: string; texto: string; minha: boolean } | null = null;
  if (respondeA) {
    const { data: original } = await supabase
      .from("mensagens")
      .select("wa_id, texto, direcao")
      .eq("wa_id", respondeA)
      .eq("conversa_id", conversa.id)
      .maybeSingle();
    if (original?.wa_id) {
      citar = {
        waId: original.wa_id,
        texto: original.texto ?? "",
        minha: original.direcao === "outbound",
      };
    }
  }

  const envio = await enviarTexto(conversa.telefone, texto, instancia, citar);
  if (!envio.ok) {
    // O erro volta inteiro para a tela. Mensagem que não saiu e não avisa é o
    // pior caso: a atendente segue a conversa achando que falou.
    return NextResponse.json({ erro: envio.erro }, { status: 502 });
  }

  // O identificador vem em lugares diferentes conforme o provedor — `key.id` na
  // Evolution, `messages[0].id` na Meta. A camada sabe ler os dois.
  const waId = idDaResposta(envio.dados);
  const agora = new Date().toISOString();

  // Grava com a chave de serviço: `enviada_por` precisa ser gravado mesmo que a
  // política de escrita mude, e a autoria é o dado que sustenta o relatório.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db =
    url && servico
      ? criarServico(url, servico, { auth: { persistSession: false } })
      : supabase;

  const gravarMensagem = db.from("mensagens").upsert(
    {
      conversa_id: conversa.id,
      wa_id: waId,
      telefone: conversa.telefone,
      direcao: "outbound",
      tipo: "texto",
      texto,
      enviada_por: user.id,
      status: "SENT",
      momento: agora,
      // Guarda o ENDEREÇO da citada, não uma cópia do texto: assim a citação
      // acompanha a edição do original em vez de congelar a versão antiga.
      responde_wa_id: citar?.waId ?? null,
    },
    { onConflict: "wa_id", ignoreDuplicates: true },
  );

  const patch: Record<string, unknown> = {
    ultima_msg: texto.slice(0, 240),
    ultima_msg_at: agora,
    ultima_direcao: "outbound",
    atualizado_em: agora,
  };
  // Fecha o SLA na primeira resposta, e só nela: reescrever apagaria a demora
  // que o carimbo existe para denunciar.
  if (!conversa.primeira_resp_at) patch.primeira_resp_at = agora;
  // Quem responde, assume. Conversa sem dono que recebe resposta passa a ser de
  // quem respondeu — senão ela continua na fila de todo mundo.
  if (!conversa.atendente_id) {
    patch.atendente_id = user.id;
    patch.atribuido_em = agora;
  }

  // AS DUAS GRAVAÇÕES VÃO JUNTAS. São independentes — uma escreve em
  // `mensagens`, a outra em `conversas` — e esperar a primeira para começar a
  // segunda era uma ida ao banco a mais em cada mensagem enviada.
  await Promise.all([
    gravarMensagem,
    db.from("conversas").update(patch).eq("id", conversa.id),
  ]);

  if (!conversa.atendente_id) {
    await db.from("atribuicoes").insert({
      conversa_id: conversa.id,
      telefone: conversa.telefone,
      para_atendente: user.id,
      feita_por: user.id,
      motivo: "manual",
      regra: "respondeu primeiro",
    });
  }

  return NextResponse.json({ ok: true, waId });
}
