import { createClient as criarServico } from "@supabase/supabase-js";
import {
  conversasDaInstancia,
  telefoneDoJid,
  enderecoDeLid,
  perfilDoJid,
} from "@/lib/evolution";

// Trazer para o PIE o que aconteceu fora dele.
//
// ── POR QUE ISTO É UMA BIBLIOTECA, E NÃO SÓ UM BOTÃO ────────────────────────
//
// Era só a rota do botão "Importar". Funcionava, e dependia de alguém lembrar
// de clicar — uma vez por número, depois de cada queda.
//
// Com sete números isso deixa de ser realista. Esquecer um clique é esquecer
// os leads pagos daquela janela, e ninguém descobre porque a fila daquele
// número simplesmente parece vazia.
//
// Agora o webhook chama isto sozinho quando um número volta a conectar. O
// botão continua existindo para quando se quiser uma janela maior.

/** Teto de segurança. Acima disto é sinal de filtro errado, não de operação. */
const TETO = 600;

export type Resultado =
  | { ok: false; erro: string }
  | { ok: true; achadas: number; aviso?: string; gravar?: () => Promise<void> };

/**
 * Acha as conversas com movimento e devolve `gravar` — a parte demorada.
 *
 * Separado de propósito: a rota do botão responde na hora com o que achou e
 * grava em `after()`, para a tela não ficar pendurada. O webhook, que não tem
 * ninguém esperando, chama `gravar` direto.
 */
export async function importarConversas(
  instancia: string,
  dias: number,
): Promise<Resultado> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return { ok: false as const, erro: "Sem chave de serviço." };

  const r = await conversasDaInstancia(instancia);
  if (!r.ok) return { ok: false as const, erro: `A Evolution não respondeu: ${r.erro}` };

  const corte = Date.now() - dias * 24 * 60 * 60 * 1000;

  const candidatas = (r.dados ?? [])
    .filter((c) => {
      const dom = String(c.remoteJid ?? "").split("@")[1] ?? "";
      // Grupo e transmissão não são atendimento.
      if (dom !== "s.whatsapp.net" && dom !== "lid") return false;
      const q = c.updatedAt ? Date.parse(c.updatedAt) : NaN;
      return Number.isFinite(q) && q >= corte;
    })
    .slice(0, TETO);

  if (candidatas.length === 0)
    return {
      ok: true as const,
      achadas: 0,
      aviso: `Nenhuma conversa com movimento nos últimos ${dias} dias.`,
    };

  const db = criarServico(url, chave, { auth: { persistSession: false } });

  // Responde na hora com o que achou; a gravação acontece depois. Seiscentas
  // conversas passam de dez segundos, e a tela não pode ficar pendurada.
  const gravar = async () => {
    let gravadas = 0;
    let semTelefone = 0;
    let porLid = 0;

    // ── OS NOMES, ANTES DE GRAVAR ─────────────────────────────────────────
    //
    // Num chat `@lid` o `pushName` costuma vir vazio ou repetindo o próprio
    // identificador: dos 371 da Maiana, só 4 tinham nome de gente. A fila
    // mostraria quinze dígitos, e ninguém atende um número.
    //
    // `fetchProfile` responde o nome real — devolveu "Elenilda" para o
    // 143417564733621@lid. É uma ida por conversa, então vai em paralelo e com
    // PRAZO: nome é conforto, a métrica é o que não pode faltar. Estourou o
    // prazo, grava sem nome e segue — a próxima mensagem da pessoa traz o
    // pushName pelo webhook.
    const nomes = new Map<string, string>();
    const semNome = candidatas.filter(
      (c) =>
        String(c.remoteJid ?? "").endsWith("@lid") &&
        !/[a-zA-ZÀ-ÿ]/.test(String(c.pushName ?? "")),
    );
    const prazo = Date.now() + 25_000;
    const fila = [...semNome];
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        for (;;) {
          const c = fila.shift();
          if (!c || Date.now() > prazo) return;
          const jid = String(c.remoteJid ?? "");
          const n = await perfilDoJid(jid, instancia);
          if (n) nomes.set(jid, n);
        }
      }),
    );

    for (const c of candidatas) {
      try {
        // ── O ENDEREÇO ────────────────────────────────────────────────────
        //
        // Chat `@lid` não traz o número: é o identificador anônimo. O telefone
        // real vem em `remoteJidAlt` — quando a mensagem passou pelo webhook ao
        // vivo. Vindo do history sync de uma reconexão, NÃO VEM: o WhatsApp não
        // manda, e não está na agenda de contatos nem na mensagem guardada.
        //
        // Foi assim que 371 leads de tráfego pago da Maiana ficaram de fora.
        // Agora entram pelo identificador e o telefone se costura depois, na
        // próxima mensagem que ela mandar.
        const jid = String(c.remoteJid ?? "");
        const ehDeLid = jid.endsWith("@lid");
        const alt = ehDeLid
          ? String(c.lastMessage?.key?.remoteJidAlt ?? c.remoteJidAlt ?? "")
          : jid;

        const telefone = telefoneDoJid(alt);
        const temTelefone =
          !!telefone && telefone.length >= 12 && telefone.length <= 15;

        const endereco = temTelefone ? telefone : enderecoDeLid(jid);
        if (!endereco) {
          semTelefone++;
          continue;
        }
        if (!temTelefone) porLid++;

        const ultima = c.lastMessage;
        const texto =
          ultima?.message?.conversation ??
          ultima?.message?.extendedTextMessage?.text ??
          null;
        const seg = Number(ultima?.messageTimestamp);
        const momento = Number.isFinite(seg)
          ? new Date(seg * 1000).toISOString()
          : (c.updatedAt ?? new Date().toISOString());

        // `receber_mensagem` é a MESMA função do webhook. Reusar em vez de
        // escrever um caminho de importação paralelo é o que garante que a
        // conversa importada nasce igual à que chegou ao vivo — mesmo setor,
        // mesma dona, mesmos carimbos de SLA.
        await db.rpc("receber_mensagem", {
          p_telefone: endereco,
          // ── O NOME NUNCA PODE VIR DE MENSAGEM NOSSA ──────────────────────
          //
          // O último recurso era `ultima?.pushName` — o nome de quem mandou a
          // ÚLTIMA mensagem do chat. Quando a última era nossa, `pushName` é o
          // NOSSO perfil, e a conversa do eleitor nascia chamada
          // "Talita Oliveira | 1022".
          //
          // E nasce para sempre: `receber_mensagem` grava com
          // `coalesce(conversas.nome, excluded.nome)`, que só preenche vazio.
          // O nome errado nunca mais é corrigido sozinho.
          //
          // Agora esse recurso só vale quando a última mensagem é DELES. Sem
          // nome é melhor que com o nome errado: vazio a atendente preenche,
          // errado ninguém desconfia.
          p_nome:
            nomes.get(jid) ??
            (/[a-zA-ZÀ-ÿ]/.test(String(c.pushName ?? ""))
              ? c.pushName
              : null) ??
            (ultima?.key?.fromMe ? null : (ultima?.pushName ?? null)) ??
            null,
          p_instancia: instancia,
          p_wa_id: ultima?.key?.id ?? null,
          p_direcao: ultima?.key?.fromMe ? "outbound" : "inbound",
          p_tipo: "texto",
          p_texto: texto,
          p_resumo: (texto ?? "Conversa importada do WhatsApp").slice(0, 240),
          p_midia_url: null,
          p_midia_mime: null,
          p_duracao: null,
          p_status: null,
          p_momento: momento,
          p_bruto: { importado: true, de: instancia },
          p_municipio_sug: null,
          p_bairro_sug: null,
          p_indicou: null,
        });
        gravadas++;
      } catch (e) {
        console.error("importar:", e);
      }
    }

    // ── CONVERSA IMPORTADA É LEAD, NUNCA DISPARO ─────────────────────────
    //
    // `receber_mensagem` classifica como 'disparo' quando a PRIMEIRA mensagem
    // que ela vê é da campanha — e faz certo: disparo não tem SLA nem entra na
    // conta de lead.
    //
    // Só que aqui ela vê uma mensagem só: a ÚLTIMA da conversa. Quando a
    // atendente respondeu por último — o caso comum — a conversa inteira era
    // de um lead do tráfego pago e entraria como disparo, sumindo da métrica.
    //
    // Estas conversas vieram do WhatsApp de um número que recebe anúncio.
    // Alguém escreveu primeiro; a gente só não tem a mensagem.
    await db
      .from("conversas")
      .update({ tipo: "lead" })
      .eq("instancia", instancia)
      .eq("tipo", "disparo");

    console.log(
      `importar ${instancia}: ${gravadas} gravadas (${porLid} só com identificador, ` +
        `${nomes.size} nomes recuperados), ${semTelefone} sem endereço, ` +
        `de ${candidatas.length} candidatas`,
    );
  };

  return { ok: true as const, achadas: candidatas.length, gravar };
}
