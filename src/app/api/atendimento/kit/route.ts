import { NextResponse, after } from "next/server";
import { createClient as criarServico } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { aplicarAtalhos } from "@/lib/atalhos-do-texto";
import { enviarTexto, enviarAudio, enviarMidia, idDaResposta } from "@/lib/wa";
import { arquivoEmBase64, nomeParaWhatsApp } from "@/lib/midia";

// Mandar um kit inteiro com um toque.
//
// ── POR QUE ISTO NÃO É UM LAÇO SIMPLES ──────────────────────────────────────
//
// São três a cinco mensagens seguidas para a mesma pessoa. Feito errado, é
// exatamente o comportamento que o WhatsApp lê como robô:
//
//   · TUDO DE UMA VEZ vira rajada. Quatro mensagens no mesmo segundo não é
//     gente falando; é máquina despejando. Por isso há um respiro entre elas.
//
//   · A ORDEM IMPORTA. Santinho, áudio, e só então a frase com o número.
//     Invertido, a pessoa lê o número antes de saber quem está falando.
//
//   · E TEM DE PARAR NO PRIMEIRO ERRO. Se o santinho falhou, mandar o áudio
//     depois deixa a conversa pela metade sem ninguém saber — e a menina acha
//     que enviou tudo.
//
// ── E POR QUE DEPOIS DA RESPOSTA ────────────────────────────────────────────
//
// Quatro envios em sequência, com respiro, passam de dez segundos. A função da
// Vercel morre nesse tempo e a menina veria "falhou" com metade enviada. Então
// a rota confere, responde na hora, e o envio acontece em `after` — as bolhas
// aparecem na tela pelo Realtime, uma a uma, como numa conversa de verdade.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Dez minutos: a Evolution busca o arquivo em segundos, a folga é para a fila. */
const VALIDADE = 600;

/**
 * O respiro entre uma mensagem e a seguinte.
 *
 * Um segundo e meio é o que separa "alguém mandando as coisas" de "um sistema
 * despejando". Não é rigor técnico — é o que a pessoa do outro lado percebe, e
 * é o que o WhatsApp mede.
 *
 * ── POR QUE UM INTERVALO, E NÃO UM NÚMERO FIXO ──────────────────────────────
 *
 * Era 1500 cravado. Pausa sempre igual é assinatura de máquina: gente nenhuma
 * leva exatamente um segundo e meio entre mandar o santinho e mandar o áudio,
 * quatro vezes seguidas, em duzentas conversas. A REGULARIDADE denuncia mais
 * que a velocidade.
 *
 * De 1,5 a 5 segundos, sorteado a cada mensagem. Custa alguns segundos por kit
 * e é o disfarce mais barato que existe aqui.
 */
const RESPIRO_MIN = 1500;
const RESPIRO_MAX = 5000;

/** Sorteia o respiro desta mensagem. */
const respiro = () =>
  RESPIRO_MIN + Math.floor(Math.random() * (RESPIRO_MAX - RESPIRO_MIN));

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ erro: "Não autenticado." }, { status: 401 });

  let corpo: { conversaId?: number; kitId?: number };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ erro: "Dados inválidos." }, { status: 400 });
  }

  const conversaId = Number(corpo.conversaId);

  const kitId = Number(corpo.kitId);
  if (!conversaId || !kitId)
    return NextResponse.json(
      { erro: "Falta a conversa ou o kit." },
      { status: 400 },
    );

  // As duas leituras passam pela RLS: quem não enxerga a conversa não responde
  // por ela, e quem não enxerga o kit não o distribui.
  const [{ data: conversa }, { data: itens }] = await Promise.all([
    supabase
      .from("conversas")
      .select(
        "id, telefone, nome, primeira_resp_at, atendente_id, instancia, numero_id, ultima_entrada_at, lideranca_id, numeros(instancia)",
      )
      .eq("id", conversaId)
      .maybeSingle(),
    supabase
      .from("kit_itens")
      .select(
        "ordem, materiais(id, titulo, tipo, arquivo, texto, mime, duracao_seg, ativo)",
      )
      .eq("kit_id", kitId)
      .order("ordem"),
  ]);

  if (!conversa)
    return NextResponse.json(
      { erro: "Conversa não encontrada." },
      { status: 404 },
    );

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

  const materiais = (itens ?? [])
    .map((i) => i.materiais as unknown as Material)
    .filter((m): m is Material => !!m && m.ativo);

  if (materiais.length === 0)
    return NextResponse.json(
      { erro: "Esse kit está vazio ou os materiais foram desativados." },
      { status: 400 },
    );

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    return NextResponse.json({ erro: "Sem chave de serviço." }, { status: 500 });

  const db = criarServico(url, chave, { auth: { persistSession: false } });

  const numero = conversa.numeros as { instancia?: string } | null;
  const instancia = numero?.instancia ?? conversa.instancia ?? null;
  const telefone = conversa.telefone;
  const numeroId = (conversa.numero_id as number | null) ?? null;

  // ── SÓ PARA QUEM ESCREVEU ─────────────────────────────────────────────────
  //
  // Material político em conversa que a pessoa nunca abriu é contato não
  // solicitado — o item que o WhatsApp pune mais rápido, e o que a lei
  // eleitoral trata com menos paciência.
  //
  // A tela já desabilitava o botão por `janelaFechada`, mas `dentroDaJanela`
  // devolve `true` para todo mundo fora da Meta ("no não-oficial não há
  // janela"). No Baileys, que é o nosso caso, a trava da tela NUNCA fechava.
  // Esta aqui é de servidor, e vale por qualquer caminho.
  if (!conversa.ultima_entrada_at)
    return NextResponse.json(
      {
        erro: "Essa pessoa ainda não escreveu. Kit só depois que ela mandar a primeira mensagem.",
      },
      { status: 409 },
    );

  // ── O CÓDIGO PESSOAL DE QUEM VAI RECEBER ─────────────────────────────────
  //
  // É o que faz `{{link}}` creditar a indicação a ela. Só é buscado quando a
  // conversa JÁ está ligada a uma liderança — uma consulta a mais por envio, e
  // só nesse caso.
  //
  // Sem código, `{{link}}` cai no link geral do WhatsApp: a frase continua
  // chegando inteira, só não conta indicação para ninguém. Falhar aqui não pode
  // impedir o envio do kit.
  let codigoDaLideranca: string | null = null;
  if (conversa.lideranca_id) {
    const { data: lid } = await db
      .from("liderancas")
      .select("link_code")
      .eq("id", conversa.lideranca_id)
      .maybeSingle();
    codigoDaLideranca = lid?.link_code ?? null;
  }

  // ── O TETO DO CHIP ────────────────────────────────────────────────────────
  //
  // Quem apanha do WhatsApp é o número, não a menina — por isso a conta é por
  // número. E o kit inteiro tem de caber: mandar metade deixa a conversa pela
  // metade, que é o estado que ninguém consegue auditar depois.
  const { data: ritmo } = await db.rpc("material_pode_sair", {
    p_numero: numeroId,
  });
  const r = ritmo as {
    pode?: boolean;
    motivo?: string;
    minutos?: number;
    teto?: number;
    restam_hora?: number;
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

  if (r?.pode && (r.restam_hora ?? 0) < materiais.length)
    return NextResponse.json(
      {
        erro: `Só cabem mais ${r.restam_hora} envios nesta hora, e o kit tem ${materiais.length}. Espere uns minutos ou use outro número.`,
      },
      { status: 429 },
    );

  // ── ASSUMIR E FECHAR O SLA ACONTECEM AGORA ────────────────────────────────
  //
  // Antes do envio, e não depois: se a função morrer no meio, a conversa já é
  // de quem clicou. Conversa sem dono com material enviado é o pior estado —
  // ninguém sabe que já foi feito.
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { atualizado_em: agora };
  if (!conversa.primeira_resp_at) patch.primeira_resp_at = agora;
  if (!conversa.atendente_id) {
    patch.atendente_id = user.id;
    patch.atribuido_em = agora;
  }
  await db.from("conversas").update(patch).eq("id", conversa.id);

  after(async () => {
    let enviados = 0;

    for (const m of materiais) {
      try {
        let envio;

        if (m.tipo === "texto") {
          const t = aplicarAtalhos(m.texto ?? "", {
            nome: conversa.nome,
            linkCode: codigoDaLideranca,
          });
          if (!t.trim()) continue;
          envio = await enviarTexto(telefone, t, instancia);
        } else {
          if (!m.arquivo) continue;
          // O ARQUIVO VAI DENTRO DO PEDIDO, não como endereço.
          //
          // A Evolution não consegue buscar a URL assinada do Supabase:
          // testado com o mesmo arquivo nas duas formas, por URL a mensagem é
          // aceita, ganha identificador e nunca chega. Por base64 chega na
          // hora. Ver `arquivoEmBase64`.
          const bruto = await arquivoEmBase64("audios", m.arquivo);
          if ("erro" in bruto) {
            console.error(`kit: nao li "${m.titulo}": ${bruto.erro}`);
            break;
          }

          envio =
            m.tipo === "audio"
              ? await enviarAudio(telefone, bruto.base64, instancia)
              : await enviarMidia(
                  telefone,
                  m.tipo === "video" ? "video" : m.tipo === "documento" ? "document" : "image",
                  bruto.base64,
                  {
                    mime: m.mime ?? bruto.mime ?? undefined,
                    // COM EXTENSÃO — ver `nomeParaWhatsApp`. Era aqui que o
                    // santinho do kit morria: título sem `.png`, aceito pela
                    // Evolution e descartado pelo WhatsApp, calado.
                    nomeArquivo: nomeParaWhatsApp(m.titulo, m.arquivo ?? "") || undefined,
                    instancia,
                  },
                );
        }

        if (!envio.ok) {
          // PARA NO PRIMEIRO ERRO. Continuar deixaria a conversa pela metade
          // sem ninguém saber, e a menina acharia que enviou tudo.
          console.error(`kit: parou em "${m.titulo}": ${envio.erro}`);
          break;
        }

        await db.from("mensagens").upsert(
          {
            conversa_id: conversa.id,
            wa_id: idDaResposta(envio.dados),
            telefone,
            direcao: "outbound",
            tipo: m.tipo,
            texto:
              m.tipo === "texto"
                ? aplicarAtalhos(m.texto ?? "", {
                    nome: conversa.nome,
                    linkCode: codigoDaLideranca,
                  })
                : null,
            midia_arquivo: m.arquivo ? `audios:${m.arquivo}` : null,
            midia_mime: m.mime,
            duracao_seg: m.duracao_seg,
            enviada_por: user.id,
            status: "SENT",
            momento: new Date().toISOString(),
          },
          { onConflict: "wa_id", ignoreDuplicates: true },
        );

        // O livro-caixa do chip. Uma linha por MATERIAL, não por kit: quatro
        // peças pesam quatro mensagens no número, e contar o kit como um faria
        // o teto mentir por um fator de quatro.
        await db.rpc("material_saiu", {
          p_numero: numeroId,
          p_conversa: conversa.id,
          p_kit: kitId,
          p_material: m.id,
          p_atendente: user.id,
        });

        enviados++;
        if (enviados < materiais.length) await espera(respiro());
      } catch (e) {
        console.error("kit:", e);
        break;
      }
    }

    const fim = new Date().toISOString();
    await Promise.all([
      db
        .from("conversas")
        .update({
          ultima_msg: `📦 Kit enviado (${enviados} ${enviados === 1 ? "item" : "itens"})`,
          ultima_msg_at: fim,
          ultima_direcao: "outbound",
          atualizado_em: fim,
        })
        .eq("id", conversa.id),
      db.rpc("kit_usado", { p_kit: kitId }),
    ]);

    console.log(`kit ${kitId}: ${enviados}/${materiais.length} enviados`);
  });

  // Responde na hora. As bolhas vão aparecendo pelo Realtime.
  return NextResponse.json({ ok: true, itens: materiais.length });
}
