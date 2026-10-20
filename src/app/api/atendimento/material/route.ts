import { NextResponse } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { aplicarAtalhos } from "@/lib/atalhos-do-texto";
import { enviarTexto, enviarAudio, enviarMidia, idDaResposta } from "@/lib/wa";
import { arquivoEmBase64, nomeParaWhatsApp } from "@/lib/midia";

// Mandar UM material da biblioteca — áudio, santinho, vídeo, documento ou frase.
//
// ── POR QUE ESTA ROTA SUBSTITUI A DE ÁUDIO ──────────────────────────────────
//
// Havia `/api/atendimento/audio`, que só sabia mandar voz. Quando a tabela
// `audios` virou `materiais` e passou a guardar santinho também, o botão de
// áudio listava tudo — e clicar num santinho tentava mandar imagem COMO voz.
//
// O conserto de ontem foi filtrar a lista para `tipo = 'audio'`. Certo, e deixou
// um buraco: santinho avulso passou a não ter caminho nenhum. Só saía dentro de
// kit, ou subindo do aparelho pelo Anexo — que não usa o que já está cadastrado.
//
// Duas rotas quase iguais seria o defeito de sempre: a trava do teto corrigida
// numa e esquecida na outra. Uma rota só, que despacha pelo TIPO do material.
//
// ── AS MESMAS TRAVAS DO KIT ─────────────────────────────────────────────────
//
// Material da biblioteca é conteúdo que sai IGUAL para muita gente — é
// exatamente o que o WhatsApp lê como disparo. Por isso passa pelo teto do chip
// e pela trava de primeiro contato, como o kit. Sem isso, mandar as peças uma a
// uma pelo botão do lado contornaria o teto sem ninguém querer.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Material = {
  id: number;
  titulo: string;
  tipo: string;
  arquivo: string | null;
  texto: string | null;
  mime: string | null;
  duracao_seg: number | null;
  ativo: boolean;
};

/** O rótulo que fica na lista da fila. */
function resumo(m: Material, texto: string | null) {
  if (m.tipo === "texto") return (texto ?? m.titulo).slice(0, 240);
  const icone: Record<string, string> = {
    audio: "🎤",
    imagem: "📷",
    video: "🎬",
    documento: "📎",
  };
  return `${icone[m.tipo] ?? "📦"} ${m.titulo}`.slice(0, 240);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: { conversaId?: number; materialId?: number };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const conversaId = Number(corpo.conversaId);
  const materialId = Number(corpo.materialId);
  if (!conversaId || !materialId)
    return NextResponse.json(
      { erro: "Falta a conversa ou o material." },
      { status: 400 },
    );

  // As duas leituras passam pela RLS: quem não enxerga a conversa não responde
  // por ela, e quem não enxerga o material não o distribui.
  const [{ data: conversa }, { data: material }] = await Promise.all([
    supabase
      .from("conversas")
      .select(
        "id, telefone, nome, primeira_resp_at, atendente_id, instancia, numero_id, ultima_entrada_at, lideranca_id, numeros(instancia)",
      )
      .eq("id", conversaId)
      .maybeSingle(),
    supabase
      .from("materiais")
      .select("id, titulo, tipo, arquivo, texto, mime, duracao_seg, ativo")
      .eq("id", materialId)
      .maybeSingle(),
  ]);

  if (!conversa)
    return NextResponse.json(
      { erro: "Conversa não encontrada." },
      { status: 404 },
    );

  const m = material as Material | null;
  if (!m || !m.ativo)
    return NextResponse.json(
      { erro: "Material não encontrado ou desativado." },
      { status: 404 },
    );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    return NextResponse.json({ erro: "Sem chave de serviço." }, { status: 500 });

  const db = criarServico(url, chave, { auth: { persistSession: false } });

  const numero = conversa.numeros as { instancia?: string } | null;
  const instancia = numero?.instancia ?? conversa.instancia ?? null;
  const numeroId = (conversa.numero_id as number | null) ?? null;

  // ── SÓ PARA QUEM ESCREVEU ─────────────────────────────────────────────────
  if (!conversa.ultima_entrada_at)
    return NextResponse.json(
      {
        erro: "Essa pessoa ainda não escreveu. Material só depois que ela mandar a primeira mensagem.",
      },
      { status: 409 },
    );

  // ── O TETO DO CHIP ────────────────────────────────────────────────────────
  const { data: ritmo } = await db.rpc("material_pode_sair", {
    p_numero: numeroId,
  });
  const r = ritmo as {
    pode?: boolean;
    motivo?: string;
    minutos?: number;
    teto?: number;
  } | null;

  if (r && r.pode === false)
    return NextResponse.json(
      {
        erro:
          r.motivo === "dia"
            ? `Este número já mandou o máximo de hoje (${r.teto}). Use outro número ou fale com a coordenação.`
            : `Este número atingiu o limite da hora (${r.teto}). Libera em ${r.minutos} min.`,
      },
      { status: 429 },
    );

  // ── O CÓDIGO PESSOAL DE QUEM VAI RECEBER ─────────────────────────────────
  //
  // É o que faz `{{link}}` creditar a indicação a ela. Só é buscado quando a
  // conversa JÁ está ligada a uma liderança — uma consulta a mais por envio, e
  // só nesse caso.
  //
  // Sem código, `{{link}}` cai no link geral do WhatsApp: a frase continua
  // chegando inteira, só não conta indicação para ninguém. Falhar aqui não pode
  // impedir o envio.
  let codigoDaLideranca: string | null = null;
  if (conversa.lideranca_id) {
    const { data: lid } = await db
      .from("liderancas")
      .select("link_code")
      .eq("id", conversa.lideranca_id)
      .maybeSingle();
    codigoDaLideranca = lid?.link_code ?? null;
  }

  // Os atalhos da frase pronta ({{nome}}, {{whatsapp}}, {{link}}…) moram em
  // `lib/atalhos-do-texto.ts`. Estavam escritos aqui e mais duas vezes na rota
  // de kit — três cópias da mesma regra, que é como um atalho novo passa a
  // funcionar num caminho e chegar escrito no outro.
  const texto =
    m.tipo === "texto"
      ? aplicarAtalhos(m.texto ?? "", {
          nome: conversa.nome,
          linkCode: codigoDaLideranca,
        })
      : null;

  // ── O ENVIO, DESPACHADO PELO TIPO ─────────────────────────────────────────
  //
  // Áudio tem caminho SEPARADO de foto e vídeo, e isso não é detalhe de API:
  // `sendMedia` com tipo áudio entrega um ARQUIVO ANEXADO, que a pessoa precisa
  // baixar e abrir noutro aplicativo. A maioria não abre. Para a voz da
  // candidata, é a diferença entre "ela falou comigo" e um anexo ignorado.
  let envio;
  if (m.tipo === "texto") {
    if (!texto?.trim())
      return NextResponse.json({ erro: "Esse material está vazio." }, { status: 400 });
    envio = await enviarTexto(conversa.telefone, texto, instancia);
  } else {
    if (!m.arquivo)
      return NextResponse.json(
        { erro: "Esse material não tem arquivo guardado." },
        { status: 400 },
      );
    // BASE64, e não URL: a Evolution aceita o envio por endereço, devolve
    // identificador, e a mensagem NUNCA CHEGA. Ver `arquivoEmBase64`.
    const bruto = await arquivoEmBase64("audios", m.arquivo);
    if ("erro" in bruto)
      return NextResponse.json(
        { erro: `Não consegui ler o arquivo: ${bruto.erro}` },
        { status: 500 },
      );

    envio =
      m.tipo === "audio"
        ? await enviarAudio(conversa.telefone, bruto.base64, instancia)
        : await enviarMidia(
            conversa.telefone,
            m.tipo === "video"
              ? "video"
              : m.tipo === "documento"
                ? "document"
                : "image",
            bruto.base64,
            {
              mime: m.mime ?? bruto.mime ?? undefined,
              // COM EXTENSÃO. Mandar o título cru — sem `.png` — faz o WhatsApp
              // aceitar e descartar na entrega, sem erro nenhum. Ver
              // `nomeParaWhatsApp`.
              nomeArquivo: nomeParaWhatsApp(m.titulo, m.arquivo) || undefined,
              instancia,
            },
          );
  }

  if (!envio.ok) {
    return NextResponse.json(
      {
        erro:
          m.tipo === "audio"
            ? `${envio.erro} — se o arquivo não for .ogg gravado no WhatsApp, o envio como voz costuma falhar.`
            : envio.erro,
      },
      { status: 502 },
    );
  }

  const waId = idDaResposta(envio.dados);
  const agora = new Date().toISOString();

  const patch: Record<string, unknown> = {
    ultima_msg: resumo(m, texto),
    ultima_msg_at: agora,
    ultima_direcao: "outbound",
    atualizado_em: agora,
  };
  if (!conversa.primeira_resp_at) patch.primeira_resp_at = agora;
  if (!conversa.atendente_id) {
    patch.atendente_id = user.id;
    patch.atribuido_em = agora;
  }

  await Promise.all([
    db.from("mensagens").upsert(
      {
        conversa_id: conversa.id,
        wa_id: waId,
        telefone: conversa.telefone,
        direcao: "outbound",
        tipo: m.tipo,
        texto,
        // O PREFIXO DIZ DE QUAL BALDE É. O material da campanha mora em
        // `audios`, não em `conversas` — sem o prefixo a rota que assina o link
        // procura no balde errado e a bolha vem quebrada, com o envio feito e
        // nada apontando o motivo.
        midia_arquivo: m.arquivo ? `audios:${m.arquivo}` : null,
        midia_mime: m.tipo === "audio" ? "audio/ogg" : m.mime,
        duracao_seg: m.duracao_seg,
        enviada_por: user.id,
        status: "SENT",
        momento: agora,
      },
      { onConflict: "wa_id", ignoreDuplicates: true },
    ),
    db.from("conversas").update(patch).eq("id", conversa.id),
    // Duas contas diferentes: `audio_usado` mede o MATERIAL (qual trabalha e
    // qual só ocupa lugar); `material_saiu` mede o CHIP, e é o que o teto lê.
    db.rpc("audio_usado", { p_audio: m.id }),
    db.rpc("material_saiu", {
      p_numero: numeroId,
      p_conversa: conversa.id,
      p_kit: null,
      p_material: m.id,
      p_atendente: user.id,
    }),
  ]);

  return NextResponse.json({ ok: true, waId, tipo: m.tipo });
}
