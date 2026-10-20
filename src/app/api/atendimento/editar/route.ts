import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { editarTexto } from "@/lib/wa";

// Corrigir uma mensagem que já saiu.
//
// ── POR QUE ISTO EXISTE ─────────────────────────────────────────────────────
//
// A atendente escreve rápido, com fila esperando. Erro de digitação em nome de
// candidata, número de urna trocado, "não" que virou "nao vamos" — antes disso
// a única saída era mandar outra mensagem corrigindo, e a conversa do eleitor
// ficava com as duas.
//
// ── O LIMITE É DO WHATSAPP, NÃO NOSSO ───────────────────────────────────────
//
// O WhatsApp só aceita edição por 15 MINUTOS depois do envio. Passou disso ele
// recusa, e não há como contornar — nem pelo aplicativo. Por isso a tela precisa
// esconder o botão em vez de deixar tentar: botão que existe e falha ensina que
// o sistema é quebrado.
//
// Editada, a mensagem aparece com "editada" na conversa do eleitor. Isso é do
// WhatsApp e é bom que seja: correção silenciosa seria pior.

export const dynamic = "force-dynamic";

/** O que o WhatsApp aceita editar. Quinze minutos, em milissegundos. */
const JANELA_EDICAO = 15 * 60 * 1000;

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: { mensagemId?: number; texto?: string };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const mensagemId = Number(corpo.mensagemId);
  const texto = (corpo.texto ?? "").trim();
  if (!mensagemId || !texto)
    return NextResponse.json(
      { erro: "Falta a mensagem ou o texto novo." },
      { status: 400 },
    );

  // A LEITURA PASSA PELA RLS, e é ela que decide quem pode editar o quê: a
  // política de `mensagens` só devolve o que esta conta enxerga. Quem não
  // enxerga a conversa não recebe a linha, e a rota para aqui.
  const { data: msg } = await supabase
    .from("mensagens")
    .select("id, wa_id, telefone, direcao, tipo, texto, texto_original, momento, conversa_id")
    .eq("id", mensagemId)
    .maybeSingle();

  if (!msg)
    return NextResponse.json(
      { erro: "Mensagem não encontrada." },
      { status: 404 },
    );

  // ── AS TRÊS CONDIÇÕES DO WHATSAPP ─────────────────────────────────────────
  if (msg.direcao !== "outbound")
    return NextResponse.json(
      { erro: "Só dá para editar mensagem que a campanha enviou." },
      { status: 400 },
    );

  if (msg.tipo !== "texto")
    return NextResponse.json(
      { erro: "Só mensagem de texto pode ser editada. Áudio e imagem, não." },
      { status: 400 },
    );

  const idade = Date.now() - Date.parse(msg.momento);
  if (!Number.isFinite(idade) || idade > JANELA_EDICAO)
    return NextResponse.json(
      {
        erro: "Passou de 15 minutos — o WhatsApp não aceita mais editar esta mensagem.",
      },
      { status: 409 },
    );

  if (!msg.wa_id)
    return NextResponse.json(
      { erro: "Esta mensagem não tem identificador do WhatsApp." },
      { status: 400 },
    );

  // O número por onde ela saiu: a edição TEM de ir pelo mesmo, senão o WhatsApp
  // não reconhece a mensagem como sendo daquela conversa.
  const { data: conversa } = await supabase
    .from("conversas")
    .select("id, telefone, instancia, numeros(instancia)")
    .eq("id", msg.conversa_id)
    .maybeSingle();

  const numero = conversa?.numeros as { instancia?: string } | null;
  const instancia = numero?.instancia ?? conversa?.instancia ?? null;

  const envio = await editarTexto(msg.telefone, msg.wa_id, texto, instancia);
  if (!envio.ok)
    return NextResponse.json({ erro: envio.erro }, { status: 502 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const db =
    url && chave
      ? criarServico(url, chave, { auth: { persistSession: false } })
      : supabase;

  const agora = new Date().toISOString();
  await Promise.all([
    db
      .from("mensagens")
      .update({
        texto,
        // ── O ORIGINAL SE GUARDA UMA VEZ SÓ ────────────────────────────────
        //
        // `?? msg.texto` e não sempre `msg.texto`: o WhatsApp deixa editar
        // várias vezes dentro dos 15 minutos, e sobrescrever a cada uma
        // guardaria a PENÚLTIMA versão — rascunho de quem estava consertando,
        // não o que o eleitor leu primeiro.
        //
        // A pergunta da supervisão é "o que foi dito ANTES de corrigirem", e
        // quem responde isso é a primeira versão.
        texto_original: msg.texto_original ?? msg.texto,
        editada_em: agora,
        editada_por: user.id,
      })
      .eq("id", mensagemId),
    // A prévia da fila também: sem isto a lista continuaria mostrando o texto
    // errado, e é a lista que a atendente lê de relance.
    db
      .from("conversas")
      .update({ ultima_msg: texto.slice(0, 240), atualizado_em: agora })
      .eq("id", msg.conversa_id)
      .eq("ultima_msg_at", msg.momento),
  ]);

  return NextResponse.json({ ok: true, texto });
}
