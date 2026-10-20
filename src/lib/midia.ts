import { createClient } from "@supabase/supabase-js";
import { baixarMidia } from "@/lib/evolution";
import { baixarMidiaMeta } from "@/lib/meta-wa";

// Guardar o que a pessoa mandou.
//
// ── POR QUE ISTO ACONTECE NA HORA, E NÃO DEPOIS ─────────────────────────────
//
// Seria mais leve buscar o áudio só quando a atendente clicasse em ouvir. Mas a
// Evolution decifra a partir da sessão do WhatsApp: se o número cair, for
// religado ou banido, ela perde a capacidade de decifrar o que já passou. O
// arquivo que não foi baixado no momento em que chegou pode não existir mais
// depois — e não haveria como saber, porque a mensagem continua lá na lista.
//
// Então paga-se o custo agora. Só mídia paga: texto não passa por aqui.

/** O teto do WhatsApp. Acima disso não deveria chegar, mas confiar em "não
 *  deveria" é como se enche disco de graça. */
const TETO = 25 * 1024 * 1024;

const EXTENSAO: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/amr": "amr",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

function extensaoDe(mime: string | null | undefined, tipo: string): string {
  const limpo = (mime ?? "").split(";")[0].trim().toLowerCase();
  if (EXTENSAO[limpo]) return EXTENSAO[limpo];
  const depoisDaBarra = limpo.split("/")[1];
  if (depoisDaBarra && /^[a-z0-9]{2,5}$/.test(depoisDaBarra))
    return depoisDaBarra;
  return tipo === "audio" ? "ogg" : tipo === "imagem" ? "jpg" : "bin";
}

export type Guardada = {
  arquivo: string | null;
  erro: string | null;
  bytes: number;
};

/**
 * Baixa da Evolution e guarda no balde. Nunca lança: mídia que falha não pode
 * derrubar a gravação da mensagem — melhor a conversa com um áudio quebrado do
 * que a conversa inteira sumida.
 */
export async function guardarMidia(
  waId: string | null,
  conversaId: number,
  tipo: string,
  /**
   * De qual instância pedir o arquivo.
   *
   * Cada instância tem o próprio armazenamento. Pedir à errada devolve
   * "Message not found" — que parece mídia corrompida e não é: é a pergunta
   * feita na gaveta errada. Sem este parâmetro, tudo ia buscar na instância do
   * ambiente, que com vários números quase nunca é a certa.
   */
  instancia?: string | null,
): Promise<Guardada> {
  if (!waId)
    return { arquivo: null, erro: "mensagem sem identificador", bytes: 0 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) {
    return { arquivo: null, erro: "sem chave de serviço", bytes: 0 };
  }

  try {
    const r = await baixarMidia(waId, instancia);
    if (!r.ok) return { arquivo: null, erro: r.erro.slice(0, 200), bytes: 0 };

    const b64 = r.dados?.base64;
    if (!b64)
      return {
        arquivo: null,
        erro: "a Evolution não devolveu o arquivo",
        bytes: 0,
      };

    const bytes = Buffer.from(b64, "base64");
    if (bytes.byteLength === 0) {
      return { arquivo: null, erro: "arquivo vazio", bytes: 0 };
    }
    if (bytes.byteLength > TETO) {
      return {
        arquivo: null,
        erro: `arquivo grande demais (${bytes.byteLength} bytes)`,
        bytes: 0,
      };
    }

    const mime = r.dados?.mimetype ?? null;
    // O caminho começa pela conversa: assim o dia em que alguém pedir para
    // apagar os dados dela, é uma pasta, não uma caçada.
    const caminho = `${conversaId}/${waId}.${extensaoDe(mime, tipo)}`;

    const db = createClient(url, chave, { auth: { persistSession: false } });
    const { error } = await db.storage
      .from("conversas")
      .upload(caminho, bytes, {
        contentType: mime ?? "application/octet-stream",
        // A mesma mensagem pode chegar duas vezes — a Evolution reenvia quando o
        // webhook falha. Sobrescrever é o certo: é o mesmo arquivo.
        upsert: true,
      });

    if (error)
      return { arquivo: null, erro: error.message.slice(0, 200), bytes: 0 };
    return { arquivo: caminho, erro: null, bytes: bytes.byteLength };
  } catch (e) {
    return { arquivo: null, erro: String(e).slice(0, 200), bytes: 0 };
  }
}

/**
 * O arquivo do balde, em base64, pronto para ir dentro do pedido de envio.
 *
 * ── POR QUE NÃO MANDAR O ENDEREÇO ───────────────────────────────────────────
 *
 * Mandar a URL assinada era o desenho certo no papel: a Evolution buscaria o
 * arquivo direto do Supabase e nada pesado passaria pela função da Vercel.
 *
 * Só que ELA NÃO CONSEGUE BUSCAR. Testado com o mesmo arquivo nas duas formas:
 * por URL a mensagem é aceita, ganha identificador, e NUNCA CHEGA; por base64
 * chega na hora. A Evolution registra o envio antes de tentar baixar, então a
 * falha não aparece em lugar nenhum — nem erro, nem log, nem status.
 *
 * Foi assim que o santinho e o áudio da Talita saíram "enviados" e não
 * chegaram em ninguém.
 *
 * O custo é real: o arquivo passa a viajar Supabase → Vercel → Evolution, e
 * base64 é 33% maior que os bytes. Para santinho e áudio — os dois casos de
 * verdade — são centenas de kilobytes, e vale muito mais do que um envio que
 * mente.
 */
export async function arquivoEmBase64(
  balde: string,
  caminho: string,
): Promise<{ base64: string; mime: string | null } | { erro: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return { erro: "sem chave de serviço" };

  try {
    const db = createClient(url, chave, { auth: { persistSession: false } });
    const { data, error } = await db.storage.from(balde).download(caminho);
    if (error || !data) return { erro: error?.message ?? "arquivo não encontrado" };

    const bytes = Buffer.from(await data.arrayBuffer());
    if (bytes.byteLength === 0) return { erro: "arquivo vazio" };
    if (bytes.byteLength > TETO)
      return { erro: `arquivo grande demais (${bytes.byteLength} bytes)` };

    return { base64: bytes.toString("base64"), mime: data.type || null };
  } catch (e) {
    return { erro: String(e).slice(0, 200) };
  }
}

/**
 * O mesmo, vindo da Cloud API da Meta.
 *
 * ── A DIFERENÇA QUE IMPORTA ─────────────────────────────────────────────────
 *
 * A Evolution devolve o arquivo em base64 — texto, 33% maior que os bytes, e a
 * função precisa segurar tudo na memória de uma vez. A Meta devolve BYTES, num
 * endereço próprio protegido por token.
 *
 * E há uma folga que o não-oficial não dava: a Meta guarda a mídia por 14 dias.
 * Se o download falhar aqui, dá para tentar de novo amanhã. Na Evolution, o
 * arquivo que não foi baixado no instante em que chegou podia sumir para
 * sempre, porque a decifragem dependia da sessão do celular.
 *
 * Nunca lança, pela mesma razão do outro: mídia quebrada não pode derrubar a
 * gravação da conversa.
 */
export async function guardarMidiaMeta(
  mediaId: string | null,
  waId: string | null,
  conversaId: number,
  tipo: string,
): Promise<Guardada> {
  if (!mediaId)
    return { arquivo: null, erro: "mensagem sem identificador de mídia", bytes: 0 };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave)
    return { arquivo: null, erro: "sem chave de serviço", bytes: 0 };

  try {
    const r = await baixarMidiaMeta(mediaId);
    if (!r.ok) return { arquivo: null, erro: r.erro.slice(0, 200), bytes: 0 };

    const { bytes, mime } = r.dados;
    if (bytes.byteLength > TETO)
      return {
        arquivo: null,
        erro: `arquivo grande demais (${bytes.byteLength} bytes)`,
        bytes: 0,
      };

    // O nome usa o id da MENSAGEM, e não o da mídia: é por ele que a mensagem é
    // encontrada depois, e o id da mídia não aparece em lugar nenhum do banco.
    const nome = (waId ?? mediaId).replace(/[^a-zA-Z0-9_-]/g, "");
    const caminho = `${conversaId}/${nome}.${extensaoDe(mime, tipo)}`;

    const db = createClient(url, chave, { auth: { persistSession: false } });
    const { error } = await db.storage
      .from("conversas")
      .upload(caminho, bytes, {
        contentType: mime ?? "application/octet-stream",
        upsert: true,
      });

    if (error)
      return { arquivo: null, erro: error.message.slice(0, 200), bytes: 0 };
    return { arquivo: caminho, erro: null, bytes: bytes.byteLength };
  } catch (e) {
    return { arquivo: null, erro: String(e).slice(0, 200), bytes: 0 };
  }
}

/**
 * O NOME DO ARQUIVO QUE VAI PARA O WHATSAPP — COM EXTENSÃO, SEMPRE.
 *
 * ── O DEFEITO QUE ISTO CONSERTA ─────────────────────────────────────────────
 *
 * O kit e o material mandavam `fileName` igual ao TÍTULO do material —
 * "SANTINHO REMODULADO RECUPERADOTALITA (1)". Sem extensão.
 *
 * O WhatsApp ACEITA, devolve identificador, e DESCARTA na entrega. Nenhum erro,
 * nenhuma confirmação, nada em log. "Sai e não chega".
 *
 * Comprovado num teste A/B pelo mesmo chip, para o mesmo número, com o mesmo
 * arquivo, em 31/08/2026:
 *
 *   fileName = título cru      -> sem confirmação nenhuma
 *   fileName = "santinho.png"  -> DELIVERY_ACK
 *   sem fileName               -> DELIVERY_ACK
 *
 * Custou dois dias procurando arquivo corrompido, sessão travada e chip banido.
 * Era o nome.
 *
 * A extensão sai do CAMINHO no balde (`<uuid>.png`), que é a verdade sobre o
 * formato — o título é texto que alguém digitou e não promete nada.
 */
export function nomeParaWhatsApp(titulo: string, caminho: string): string {
  const ext = (caminho.split(".").pop() || "").toLowerCase();
  // Sem extensão reconhecível é melhor não mandar nome NENHUM: o teste C
  // mostrou que ausente entrega, e inventar ".bin" seria a mesma armadilha.
  if (!/^[a-z0-9]{2,5}$/.test(ext)) return "";
  const base =
    titulo
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .toLowerCase() || "arquivo";
  return `${base}.${ext}`;
}
